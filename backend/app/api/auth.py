import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_refresh_token,
)
from app.core.audit import write_audit_log, hash_token
from app.core.deps import get_current_user, get_client_info, get_redis, RateLimiter
from app.models.user import User, UserDevice
from app.services.qq_auth import (
    qq_enabled, make_state, save_state, verify_and_consume_state,
    build_authorize_url, fetch_access_token, fetch_openid, fetch_user_info,
    synthetic_email, error_fragment,
)
from app.schemas.user import (
    UserRegister, UserLogin, TokenResponse, UserResponse,
    SendCodeRequest, ForgotPasswordRequest, ResetPasswordRequest,
    RefreshTokenRequest, ChangePasswordRequest, BindPhoneRequest, UnbindPhoneRequest,
)
from app.services.device_service import register_device, revoke_device, get_user_devices
from app.models.verification_code import VerificationCode
from app.services.email_service import send_verification_email

router = APIRouter()
TZ_UTC8 = timezone(timedelta(hours=8))
logger = logging.getLogger(__name__)


@router.get("/qq/authorize")
async def qq_authorize(redis=Depends(get_redis)):
    """启动 QQ 登录：生成一次性 state 并返回 QQ 授权页 URL（前端整体跳转）。

    appid/appkey 只留在后端，浏览器不接触；未配置时返回 503，
    前端据此提示「QQ 登录暂未开放」。
    """
    if not qq_enabled():
        raise HTTPException(status_code=503, detail="QQ 登录未配置，暂时无法使用")
    state = make_state()
    await save_state(redis, state)
    return {"authorize_url": build_authorize_url(state)}


@router.get("/qq/callback")
async def qq_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """QQ 授权回调：校验 state → 换 token → 取 openid → 找/建用户 → 签发本站 JWT
    → 令牌经 hash 片段跳回前端 /login/qq-callback。

    所有失败路径都带中文原因跳回前端，不把用户晾在 QQ 侧。
    """
    frontend = settings.FRONTEND_URL.rstrip("/")

    def _fail(msg: str) -> RedirectResponse:
        return RedirectResponse(f"{frontend}/login/qq-callback{error_fragment(msg)}")

    if error:
        return _fail("你已取消 QQ 授权，可以重试或使用邮箱登录")
    if not code or not state:
        return _fail("QQ 回调参数缺失，请重新登录")
    if not await verify_and_consume_state(redis, state):
        return _fail("登录状态已失效或重复提交，请重新点击 QQ 登录")

    try:
        access_token = await fetch_access_token(code)
        openid = await fetch_openid(access_token)
        info = await fetch_user_info(access_token, openid)
    except Exception as e:  # noqa: BLE001 —— QQ 侧异常统一转成友好跳转
        logger.warning("QQ 登录链路失败: %s", e)
        return _fail(f"QQ 登录失败：{e}")

    # 按 openid 找用户；找不到则自动注册（与邮箱注册互不干扰）
    result = await db.execute(select(User).where(User.qq_openid == openid))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=synthetic_email(openid),
            # 随机不可用密码：纯 QQ 用户没有密码，但 password_hash 非空
            password_hash=hash_password(secrets.token_urlsafe(32)),
            qq_openid=openid,
            nickname=(info.get("nickname") or f"QQ用户{openid[-4:]}"),
            avatar_url=info.get("figureurl_qq_1") or info.get("figureurl") or None,
            is_verified=True,  # QQ 侧已完成身份确认
        )
        db.add(user)
        await db.flush()
    else:
        # 同步 QQ 侧最新昵称/头像；注销冻结期内重新登录视为恢复账号
        if info.get("nickname"):
            user.nickname = info["nickname"]
        if info.get("figureurl_qq_1") or info.get("figureurl"):
            user.avatar_url = info.get("figureurl_qq_1") or info.get("figureurl")
        if user.status == "deleted_pending":
            user.status = "active"
            user.deleted_at = None
        await db.flush()

    if user.status != "active":
        return _fail("账号已被冻结，请联系管理员")

    client = await get_client_info(request)
    # 固定设备 ID：同一用户多次 QQ 登录不会无限创建设备记录
    device_id = f"web-qq-{user.id}"
    access_jwt = create_access_token(user.id)
    refresh_jwt = create_refresh_token(user.id, device_id)
    await register_device(
        db, user.id, device_id,
        platform="web",
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        refresh_token=refresh_jwt,
    )
    # 审计日志必须先于 commit 写入（write_audit_log 只 flush 不提交）
    await write_audit_log(db, user.id, "qq_login", detail="QQ 登录", ip_address=client["ip_address"])
    await db.commit()

    # 令牌走 hash 回传：不进服务器访问日志与 Referer，比 query 参数安全
    fragment = urlencode({"access_token": access_jwt, "refresh_token": refresh_jwt})
    return RedirectResponse(f"{frontend}/login/qq-callback#{fragment}")


@router.post("/send-code")
async def send_code(body: SendCodeRequest, _: None = Depends(RateLimiter(max_requests=3, window_seconds=60)), db: AsyncSession = Depends(get_db)):
    code = VerificationCode.generate_code()
    expires_at = VerificationCode.expiry()

    vc = VerificationCode(email=body.email.lower(), code=code, purpose=body.purpose, expires_at=expires_at)
    db.add(vc)
    await db.commit()

    send_verification_email(body.email, code)
    return {"detail": "验证码已发送", "expires_in": 300}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = body.email.lower()

    vc_result = await db.execute(
        select(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.code == body.code,
            VerificationCode.purpose == "register",
            VerificationCode.is_used == False,
            VerificationCode.expires_at > datetime.now(TZ_UTC8),
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    vc = vc_result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已注册")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="密码至少需要 8 位，且必须包含字母和数字")

    vc.is_used = True
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        is_verified=True,
        nickname=body.email.split("@")[0],
    )
    db.add(user)
    await db.flush()

    client = await get_client_info(request)
    access_token = create_access_token(user.id)
    device_id = request.headers.get("X-Device-Id", f"web-{user.id}")
    refresh_token = create_refresh_token(user.id, device_id)
    await register_device(
        db, user.id, device_id,
        platform=body.platform or "web",
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        refresh_token=refresh_token,
    )

    await db.refresh(user)
    # 审计日志必须先于 commit 写入：write_audit_log 只 flush 不提交，
    # 放在 commit 之后会被会话关闭时的回滚丢弃（曾导致全部注册审计丢失）。
    await write_audit_log(db, user.id, "register", detail="用户注册", ip_address=client["ip_address"])
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=60)),
):
    email = body.email.lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if user.status == "deleted_pending":
        user.status = "active"
        user.deleted_at = None
        await db.flush()

    if user.status != "active":
        raise HTTPException(status_code=403, detail="账号已被冻结，请联系管理员")

    client = await get_client_info(request)
    access_token = create_access_token(user.id)
    device_id = body.device_id or request.headers.get("X-Device-Id", f"web-{user.id}")
    refresh_token = create_refresh_token(user.id, device_id)
    await register_device(
        db, user.id, device_id,
        platform=body.platform or "web",
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        refresh_token=refresh_token,
    )

    # 审计日志必须先于 commit 写入（write_audit_log 只 flush 不提交）
    await write_audit_log(db, user.id, "login", ip_address=client["ip_address"])
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = decode_refresh_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload["sub"]
    device_id = payload.get("device_id", "")

    result = await db.execute(select(User).where(User.id == user_id, User.status == "active"))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    token_hash_val = hash_token(body.refresh_token)
    device_result = await db.execute(
        select(UserDevice).where(
            UserDevice.user_id == user_id,
            UserDevice.refresh_token_hash == token_hash_val,
            UserDevice.is_revoked == False,
        )
    )
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    client = await get_client_info(request)
    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id, device_id)

    await register_device(
        db, user.id, device_id,
        platform=request.headers.get("X-Platform", "web"),
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        refresh_token=new_refresh_token,
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    device_id = request.headers.get("X-Device-Id", "")
    if device_id:
        device_result = await db.execute(
            select(UserDevice).where(
                UserDevice.user_id == user.id,
                UserDevice.device_id == device_id,
            )
        )
        for d in device_result.scalars().all():
            d.is_revoked = True
            d.refresh_token_hash = None

    client = await get_client_info(request)
    await write_audit_log(db, user.id, "logout", ip_address=client["ip_address"])
    await db.commit()
    return {"detail": "已退出登录"}

@router.post("/forgot-password/send-code")
async def forgot_password_send_code(body: ForgotPasswordRequest, _: None = Depends(RateLimiter(max_requests=3, window_seconds=60)), db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    result = await db.execute(select(User).where(User.email == email))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    code = VerificationCode.generate_code()
    vc = VerificationCode(email=email, code=code, purpose="reset_password", expires_at=VerificationCode.expiry())
    db.add(vc)
    await db.commit()

    send_verification_email(email, code)
    return {"detail": "验证码已发送"}


@router.post("/forgot-password/reset")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    vc_result = await db.execute(
        select(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.code == body.code,
            VerificationCode.purpose == "reset_password",
            VerificationCode.is_used == False,
            VerificationCode.expires_at > datetime.now(TZ_UTC8),
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    vc = vc_result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码至少需要 8 位，且必须包含字母和数字")

    vc.is_used = True
    user.password_hash = hash_password(body.new_password)
    await db.commit()

    return {"detail": "密码已重置，请登录"}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码至少需要 8 位，且必须包含字母和数字")

    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"detail": "密码已修改"}


@router.get("/devices")
async def list_devices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    devices = await get_user_devices(db, user.id)
    return [
        {
            "id": d.id,
            "device_name": d.device_name,
            "platform": d.platform,
            "ip_address": d.ip_address,
            "user_agent": d.user_agent[:80] if d.user_agent else None,
            "last_active": d.last_active.isoformat() if d.last_active else None,
            "is_revoked": d.is_revoked,
            "is_current": not d.is_revoked and d.last_active and d.last_active > datetime.now(TZ_UTC8) - timedelta(hours=2),
        }
        for d in devices
    ]


@router.delete("/devices/{device_id}")
async def remove_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = await revoke_device(db, device_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="设备不存在")
    await db.commit()
    return {"detail": "设备已下线"}


@router.post("/bind-phone")
async def bind_phone(
    body: BindPhoneRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(select(User).where(User.phone == body.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该手机号已被其他账号绑定")

    user.phone = body.phone
    await db.commit()
    return {"detail": "手机号已绑定"}


@router.post("/unbind-phone")
async def unbind_phone(
    body: UnbindPhoneRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=400, detail="密码错误")
    user.phone = None
    await db.commit()
    return {"detail": "手机号已解绑"}


@router.post("/delete-account")
async def delete_account(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.status = "deleted_pending"
    user.deleted_at = datetime.now(TZ_UTC8) + timedelta(days=30)
    await revoke_all_devices_impl(db, user.id)
    client = await get_client_info(request)
    await write_audit_log(db, user.id, "delete_account", detail="申请注销，30天冻结期", ip_address=client["ip_address"])
    await db.commit()
    return {"detail": "账号已进入注销冻结期（30天），期间可重新登录恢复"}


async def revoke_all_devices_impl(db: AsyncSession, user_id: str):
    from app.services.device_service import revoke_all_devices as rad
    await rad(db, user_id)