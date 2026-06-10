import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_refresh_token,
)
from app.core.audit import write_audit_log, hash_token
from app.core.deps import get_current_user, get_client_info
from app.models.user import User, UserDevice
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


@router.post("/send-code")
async def send_code(body: SendCodeRequest, db: AsyncSession = Depends(get_db)):
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

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要 6 位")

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
    await db.commit()

    await write_audit_log(db, user.id, "register", detail="用户注册", ip_address=client["ip_address"])

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

    await db.commit()

    await write_audit_log(db, user.id, "login", ip_address=client["ip_address"])

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
async def forgot_password_send_code(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
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

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要 6 位")

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
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少需要 6 位")

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