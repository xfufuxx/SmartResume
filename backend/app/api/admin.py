"""
管理后台完整 API — 用户管理 / 内容管理 / AI模型管理 / 任务监控 /
数据大屏 / 财务管理 / 反馈工单 / 计费额度
权限控制: Admin JWT 鉴权
"""
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.core.crypto import mask_phone, mask_email
from app.core.audit import write_audit_log
from app.models.user import User, AuditLog, ResumeTemplate, UserQuota
from app.models.admin import (
    Admin, AdminLog, PromptTemplate, ModelRouting, AIModelCallLog,
    IndustryKeyword, ATSRule, Order, SupportTicket, TicketReply, QuotaPackage,
)
from app.models.optimized_resume import OptimizedResume
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.services.prompt_service import (
    PROMPT_SCENES, create_prompt_version, deploy_prompt,
    rollback_prompt, get_prompt_versions, get_active_prompt, resolve_prompt_for_user,
)
from app.services.model_router import get_model_stats, get_enabled_models
from app.services.quota_service import check_and_consume_quota, add_quota
from app.services.order_service import process_refund

router = APIRouter()
TZ_UTC8 = timezone(timedelta(hours=8))
admin_bearer = HTTPBearer(auto_error=False)


# ── 管理员登录 & JWT 鉴权 ──────────────────────────

async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(admin_bearer),
    db: AsyncSession = Depends(get_db),
) -> Admin:
    if not credentials:
        raise HTTPException(status_code=401, detail="请先登录")
    try:
        payload = decode_access_token(credentials.credentials)
        admin_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="管理员令牌无效或已过期")

    result = await db.execute(
        select(Admin).where(Admin.id == admin_id, Admin.is_active == True)
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=401, detail="管理员不存在或已被停用")
    return admin


@router.post("/login")
async def admin_login(body: dict = Body(...), db: AsyncSession = Depends(get_db)):
    username = body.get("username", "")
    password = body.get("password", "")

    result = await db.execute(select(Admin).where(Admin.username == username, Admin.is_active == True))
    admin = result.scalar_one_or_none()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    admin.last_login_at = datetime.now(TZ_UTC8)
    token = create_access_token(admin.id)
    await db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "admin": {"id": admin.id, "username": admin.username, "role": admin.role},
    }


async def _write_admin_log(db: AsyncSession, admin_id: str, action: str, target_type: str = None, target_id: str = None, details: dict = None):
    log = AdminLog(admin_id=admin_id, action=action, target_type=target_type, target_id=target_id, details=details)
    db.add(log)
    await db.flush()


# ═══════════════════════════════════════════════════════
#  1. 用户管理（增强版）
# ═══════════════════════════════════════════════════════

@router.get("/users")
async def admin_list_users(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""), status_filter: str = Query(""),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    base = select(User)
    if search:
        base = base.where((User.email.ilike(f"%{search}%")) | (User.nickname.ilike(f"%{search}%")))
    if status_filter:
        base = base.where(User.status == status_filter)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    stmt = base.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    items = []
    for u in rows:
        rc = (await db.execute(select(func.count(Resume.id)).where(Resume.user_id == u.id, Resume.deleted_at.is_(None)))).scalar() or 0
        oc = (await db.execute(select(func.count(OptimizedResume.id)).where(OptimizedResume.user_id == u.id))).scalar() or 0
        qr = await db.execute(select(UserQuota).where(UserQuota.user_id == u.id))
        q = qr.scalar_one_or_none()
        items.append({"id": u.id, "email": mask_email(u.email), "phone": mask_phone(u.phone) if u.phone else None,
                       "nickname": u.nickname, "career_state": u.career_state, "status": u.status,
                       "resume_count": rc, "opt_count": oc,
                       "is_vip": q.is_paid if q else False,
                       "daily_quota": (q.daily_limit - q.daily_used) if q else 3,
                       "created_at": u.created_at.isoformat() if u.created_at else None})

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/users/{user_id}")
async def admin_user_detail(
    user_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "用户不存在")
    rc = (await db.execute(select(func.count(Resume.id)).where(Resume.user_id == user_id))).scalar() or 0
    oc = (await db.execute(select(func.count(OptimizedResume.id)).where(OptimizedResume.user_id == user_id))).scalar() or 0
    qr = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    q = qr.scalar_one_or_none()
    logs = (await db.execute(select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc()).limit(20))).scalars().all()
    orders = (await db.execute(select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc()).limit(20))).scalars().all()
    return {"id": u.id, "email": u.email, "phone": mask_phone(u.phone) if u.phone else None,
            "nickname": u.nickname, "career_state": u.career_state, "expectation": u.expectation,
            "status": u.status, "avatar_url": u.avatar_url,
            "resume_count": rc, "opt_count": oc,
            "quota": {"daily_limit": q.daily_limit if q else 3, "daily_used": q.daily_used if q else 0,
                       "monthly_limit": q.monthly_limit if q else 50, "monthly_used": q.monthly_used if q else 0,
                       "is_paid": q.is_paid if q else False},
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "recent_logs": [{"action": l.action, "detail": l.detail, "created_at": l.created_at.isoformat() if l.created_at else None} for l in logs],
            "orders": [{"order_no": o.order_no, "package_name": o.package_name, "amount": float(o.amount),
                         "status": o.status, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders]}


@router.put("/users/{user_id}/ban")
async def admin_ban_user(
    user_id: str, reason: str = Body(...), duration_days: int = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "用户不存在")
    u.status = "frozen"
    await db.commit()
    await _write_admin_log(db, admin.id, "user_ban", "user", user_id, {"reason": reason, "duration_days": duration_days})
    return {"detail": "用户已封禁"}


@router.put("/users/{user_id}/unban")
async def admin_unban_user(
    user_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "用户不存在")
    u.status = "active"
    await db.commit()
    await _write_admin_log(db, admin.id, "user_unban", "user", user_id)
    return {"detail": "用户已解封"}


@router.put("/users/{user_id}/vip")
async def admin_set_vip(
    user_id: str, is_paid: bool = Body(...), daily_limit: int = Body(None), monthly_limit: int = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    qr = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    q = qr.scalar_one_or_none()
    if not q:
        q = UserQuota(user_id=user_id, is_paid=is_paid)
        db.add(q)
    q.is_paid = is_paid
    if daily_limit is not None: q.daily_limit = daily_limit
    if monthly_limit is not None: q.monthly_limit = monthly_limit
    await db.commit()
    await _write_admin_log(db, admin.id, "set_vip", "user", user_id, {"is_paid": is_paid})
    return {"detail": "VIP状态已更新"}


@router.post("/users/{user_id}/quota")
async def admin_add_user_quota(
    user_id: str, amount: int = Body(...), reason: str = Body(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    remaining = await add_quota(db, user_id, amount, reason)
    await db.commit()
    await _write_admin_log(db, admin.id, "add_quota", "user", user_id, {"amount": amount, "reason": reason})
    return {"detail": "额度已增加", "remaining_daily": remaining}


# ═══════════════════════════════════════════════════════
#  2. 内容管理：模板 + 关键词库 + ATS规则
# ═══════════════════════════════════════════════════════

@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    rows = (await db.execute(select(ResumeTemplate).order_by(ResumeTemplate.created_at.desc()))).scalars().all()
    return [{"id": t.id, "name": t.name, "description": t.description, "thumbnail_url": t.thumbnail_url,
             "is_active": t.is_active, "is_default": t.is_default,
             "created_at": t.created_at.isoformat() if t.created_at else None} for t in rows]


@router.post("/templates")
async def create_template(
    name: str = Body(...), description: str = Body(""), html_content: str = Body(""), css_content: str = Body(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    t = ResumeTemplate(id=str(uuid.uuid4()), name=name, description=description,
                        html_content=html_content, css_content=css_content, created_by=admin.id)
    db.add(t); await db.commit(); await db.refresh(t)
    await _write_admin_log(db, admin.id, "create_template", "template", t.id)
    return {"id": t.id, "detail": "模板已创建"}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str, is_active: bool = Body(None), is_default: bool = Body(None),
    name: str = Body(None), html_content: str = Body(None), css_content: str = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    t = (await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))).scalar_one_or_none()
    if not t: raise HTTPException(404)
    if is_active is not None: t.is_active = is_active
    if is_default is not None:
        if is_default:
            for ot in (await db.execute(select(ResumeTemplate).where(ResumeTemplate.is_default == True))).scalars().all():
                ot.is_default = False
        t.is_default = is_default
    if name is not None: t.name = name
    if html_content is not None: t.html_content = html_content
    if css_content is not None: t.css_content = css_content
    await db.commit()
    return {"detail": "模板已更新"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    t = (await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))).scalar_one_or_none()
    if not t: raise HTTPException(404)
    await db.delete(t); await db.commit()
    return {"detail": "已删除"}


# ── 行业关键词库 ─────────────────────────────────────

@router.get("/keywords")
async def list_keywords(
    industry: str = Query(""), category: str = Query(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(IndustryKeyword)
    if industry: base = base.where(IndustryKeyword.industry == industry)
    if category: base = base.where(IndustryKeyword.category == category)
    rows = (await db.execute(base.order_by(IndustryKeyword.created_at.desc()))).scalars().all()
    return [{"id": k.id, "keyword": k.keyword, "industry": k.industry, "category": k.category,
             "is_active": k.is_active, "created_at": k.created_at.isoformat() if k.created_at else None} for k in rows]


@router.post("/keywords")
async def create_keyword(
    keyword: str = Body(...), industry: str = Body("通用"), category: str = Body("hard_skill"),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    k = IndustryKeyword(id=str(uuid.uuid4()), keyword=keyword, industry=industry, category=category, created_by=admin.id)
    db.add(k); await db.commit(); await db.refresh(k)
    return {"id": k.id, "detail": "关键词已添加"}


@router.post("/keywords/batch")
async def batch_import_keywords(
    keywords: list[dict] = Body(...),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    added = 0
    for item in keywords:
        k = IndustryKeyword(id=str(uuid.uuid4()), keyword=item.get("keyword", ""),
                             industry=item.get("industry", "通用"), category=item.get("category", "hard_skill"),
                             created_by=admin.id)
        db.add(k); added += 1
    await db.commit()
    return {"detail": f"已导入 {added} 个关键词"}


@router.put("/keywords/{keyword_id}")
async def update_keyword(
    keyword_id: str, is_active: bool = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    k = (await db.execute(select(IndustryKeyword).where(IndustryKeyword.id == keyword_id))).scalar_one_or_none()
    if not k: raise HTTPException(404)
    if is_active is not None: k.is_active = is_active
    await db.commit()
    return {"detail": "已更新"}


@router.delete("/keywords/{keyword_id}")
async def delete_keyword(keyword_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    k = (await db.execute(select(IndustryKeyword).where(IndustryKeyword.id == keyword_id))).scalar_one_or_none()
    if not k: raise HTTPException(404)
    await db.delete(k); await db.commit()
    return {"detail": "已删除"}


# ── ATS 检测规则 ─────────────────────────────────────

@router.get("/ats-rules")
async def list_ats_rules(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    rows = (await db.execute(select(ATSRule).order_by(ATSRule.created_at.desc()))).scalars().all()
    return [{"id": r.id, "name": r.name, "pattern": r.pattern, "severity": r.severity,
             "is_active": r.is_active, "description": r.description} for r in rows]


@router.post("/ats-rules")
async def create_ats_rule(
    name: str = Body(...), pattern: str = Body(...), severity: str = Body("warning"), description: str = Body(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    r = ATSRule(id=str(uuid.uuid4()), name=name, pattern=pattern, severity=severity, description=description, created_by=admin.id)
    db.add(r); await db.commit()
    return {"id": r.id, "detail": "ATS规则已创建"}


@router.put("/ats-rules/{rule_id}")
async def update_ats_rule(
    rule_id: str, is_active: bool = Body(None), severity: str = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    r = (await db.execute(select(ATSRule).where(ATSRule.id == rule_id))).scalar_one_or_none()
    if not r: raise HTTPException(404)
    if is_active is not None: r.is_active = is_active
    if severity is not None: r.severity = severity
    await db.commit()
    return {"detail": "已更新"}


@router.delete("/ats-rules/{rule_id}")
async def delete_ats_rule(rule_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    r = (await db.execute(select(ATSRule).where(ATSRule.id == rule_id))).scalar_one_or_none()
    if not r: raise HTTPException(404)
    await db.delete(r); await db.commit()
    return {"detail": "已删除"}


# ═══════════════════════════════════════════════════════
#  3. AI 模型管理
# ═══════════════════════════════════════════════════════

@router.get("/prompts")
async def list_prompts(
    name: str = Query(""), scene: str = Query(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(PromptTemplate)
    if name: base = base.where(PromptTemplate.name == name)
    if scene: base = base.where(PromptTemplate.scene == scene)
    rows = (await db.execute(base.order_by(PromptTemplate.name, PromptTemplate.version.desc()))).scalars().all()
    return {"prompts": [{"id": p.id, "name": p.name, "scene": p.scene, "version": p.version,
                          "is_active": p.is_active, "gray_ratio": p.gray_ratio,
                          "created_at": p.created_at.isoformat() if p.created_at else None} for p in rows],
            "scenes": PROMPT_SCENES}


@router.post("/prompts")
async def create_prompt(
    name: str = Body(...), scene: str = Body(...), content: str = Body(...), variables: dict = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    p = await create_prompt_version(db, name, scene, content, variables, admin.id)
    await db.commit()
    await _write_admin_log(db, admin.id, "create_prompt", "prompt", p.id, {"version": p.version})
    return {"id": p.id, "version": p.version, "detail": f"Prompt版本 v{p.version} 已创建"}


@router.get("/prompts/{prompt_id}")
async def get_prompt_detail(
    prompt_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    p = (await db.execute(select(PromptTemplate).where(PromptTemplate.id == prompt_id))).scalar_one_or_none()
    if not p: raise HTTPException(404)
    versions = await get_prompt_versions(db, p.name, p.scene)
    return {"id": p.id, "name": p.name, "scene": p.scene, "version": p.version,
            "content": p.content, "variables": p.variables, "is_active": p.is_active, "gray_ratio": p.gray_ratio,
            "all_versions": [{"version": v.version, "id": v.id, "is_active": v.is_active,
                               "gray_ratio": v.gray_ratio, "created_at": v.created_at.isoformat() if v.created_at else None}
                              for v in versions]}


@router.post("/prompts/{prompt_id}/deploy")
async def deploy_prompt_endpoint(
    prompt_id: str, gray_ratio: int = Body(0),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    p = await deploy_prompt(db, prompt_id, gray_ratio, admin.id)
    await db.commit()
    await _write_admin_log(db, admin.id, "deploy_prompt", "prompt", prompt_id, {"gray_ratio": gray_ratio})
    return {"detail": f"Prompt已部署 (灰度 {gray_ratio}%)"}


@router.post("/prompts/rollback")
async def rollback_prompt_endpoint(
    name: str = Body(...), scene: str = Body(...), target_version: int = Body(...),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    try:
        p = await rollback_prompt(db, name, scene, target_version)
        await db.commit()
        await _write_admin_log(db, admin.id, "rollback_prompt", "prompt", p.id)
        return {"detail": f"已回滚到 v{target_version}"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/models")
async def list_models(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    models = await get_enabled_models(db)
    stats = await get_model_stats(db, 24)
    return {"models": [{"id": m.id, "model_name": m.model_name, "display_name": m.display_name,
                         "weight": m.weight, "rate_limit_per_minute": m.rate_limit_per_minute,
                         "is_enabled": m.is_enabled, "tier": m.tier,
                         "consecutive_failures": m.consecutive_failures,
                         "stats": stats.get(m.model_name, {})} for m in models]}


@router.put("/models/{model_id}")
async def update_model(
    model_id: str, weight: int = Body(None), rate_limit_per_minute: int = Body(None),
    is_enabled: bool = Body(None), tier: str = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    m = (await db.execute(select(ModelRouting).where(ModelRouting.id == model_id))).scalar_one_or_none()
    if not m: raise HTTPException(404)
    if weight is not None: m.weight = weight
    if rate_limit_per_minute is not None: m.rate_limit_per_minute = rate_limit_per_minute
    if is_enabled is not None: m.is_enabled = is_enabled; m.consecutive_failures = 0
    if tier is not None: m.tier = tier
    await db.commit()
    return {"detail": "模型配置已更新"}


@router.get("/models/call-logs")
async def list_call_logs(
    page: int = Query(1), page_size: int = Query(50),
    model_name: str = Query(""), is_success: bool = Query(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(AIModelCallLog)
    if model_name: base = base.where(AIModelCallLog.model_name == model_name)
    if is_success is not None: base = base.where(AIModelCallLog.is_success == is_success)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(AIModelCallLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [{"id": l.id, "user_id": l.user_id, "model_name": l.model_name,
                        "prompt_template_name": l.prompt_template_name, "prompt_version": l.prompt_version,
                        "input_tokens": l.input_tokens, "output_tokens": l.output_tokens,
                        "latency_ms": l.latency_ms, "is_success": l.is_success,
                        "error_message": l.error_message, "cost_usd": float(l.cost_usd) if l.cost_usd else None,
                        "created_at": l.created_at.isoformat() if l.created_at else None} for l in rows],
            "total": total, "page": page, "page_size": page_size}


# ═══════════════════════════════════════════════════════
#  4. 任务监控
# ═══════════════════════════════════════════════════════

@router.get("/tasks/stats")
async def task_stats(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    cutoff = datetime.now(TZ_UTC8).replace(hour=0, minute=0, second=0, microsecond=0)
    total = (await db.execute(select(func.count(AIModelCallLog.id)).where(AIModelCallLog.created_at >= cutoff))).scalar() or 0
    success = (await db.execute(select(func.count(AIModelCallLog.id)).where(AIModelCallLog.created_at >= cutoff, AIModelCallLog.is_success == True))).scalar() or 0
    avg_lat = (await db.execute(select(func.avg(AIModelCallLog.latency_ms)).where(AIModelCallLog.created_at >= cutoff))).scalar()

    fail_by_reason = (await db.execute(
        select(AIModelCallLog.error_message, func.count(AIModelCallLog.id))
        .where(AIModelCallLog.created_at >= cutoff, AIModelCallLog.is_success == False)
        .group_by(AIModelCallLog.error_message).order_by(func.count(AIModelCallLog.id).desc()).limit(10)
    )).all()

    model_stats = await get_model_stats(db, 24)

    return {"today_total": total, "today_success": success,
            "success_rate": round(success / total * 100, 1) if total else 0,
            "avg_latency_ms": round(avg_lat or 0, 1),
            "fail_by_reason": [{"reason": r[0] or "unknown", "count": r[1]} for r in fail_by_reason],
            "model_health": model_stats}


@router.get("/tasks/failed")
async def list_failed_tasks(
    page: int = Query(1), page_size: int = Query(50),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    cutoff = datetime.now(TZ_UTC8) - timedelta(hours=24)
    base = select(AIModelCallLog).where(AIModelCallLog.created_at >= cutoff, AIModelCallLog.is_success == False)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(AIModelCallLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [{"id": l.id, "user_id": l.user_id, "model_name": l.model_name,
                        "error_message": l.error_message, "created_at": l.created_at.isoformat() if l.created_at else None} for l in rows],
            "total": total}


@router.post("/tasks/retry")
async def retry_failed_tasks(
    task_ids: list[str] = Body(...),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    return {"detail": f"已触发 {len(task_ids)} 个任务的重试（需接入实际AI重试逻辑）"}


# ═══════════════════════════════════════════════════════
#  5. 数据大屏
# ═══════════════════════════════════════════════════════

@router.get("/dashboard/core")
async def dashboard_core(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(select(func.count(User.id)).where(User.status == "active"))).scalar() or 0
    total_opt = (await db.execute(select(func.count(OptimizedResume.id)))).scalar() or 0

    today = datetime.now(TZ_UTC8).date()
    start_today = datetime.now(TZ_UTC8).replace(hour=0, minute=0, second=0, microsecond=0)
    dau = (await db.execute(select(func.count(AuditLog.user_id.distinct())).where(func.date(AuditLog.created_at) == today, AuditLog.action == "login"))).scalar() or 0

    today_opt = (await db.execute(select(func.count(OptimizedResume.id)).where(OptimizedResume.created_at >= start_today))).scalar() or 0
    today_upload = (await db.execute(select(func.count(Resume.id)).where(Resume.created_at >= start_today))).scalar() or 0

    paid_count = (await db.execute(select(func.count(UserQuota.user_id)).where(UserQuota.is_paid == True))).scalar() or 0
    paid_rate = round(paid_count / total_users * 100, 2) if total_users else 0

    yesterday_start = start_today - timedelta(days=1)
    yesterday_dau = (await db.execute(select(func.count(AuditLog.user_id.distinct())).where(func.date(AuditLog.created_at) == yesterday_start.date(), AuditLog.action == "login"))).scalar() or 0
    dau_change = round((dau - yesterday_dau) / yesterday_dau * 100, 1) if yesterday_dau else 0

    return {"total_users": total_users, "active_users": active_users,
            "dau": dau, "dau_change_percent": dau_change,
            "today_optimizations": today_opt, "today_uploads": today_upload,
            "total_optimizations": total_opt, "paid_conversion_rate": paid_rate}


@router.get("/dashboard/industry")
async def dashboard_industry(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    rows = (await db.execute(
        select(User.expectation["industries"].astext, func.count(User.id))
        .where(User.expectation.isnot(None)).group_by(User.expectation["industries"].astext).limit(20)
    )).all()
    return {"industries": [{"name": r[0] or "未知", "count": r[1]} for r in rows]}


@router.get("/dashboard/match_improvement")
async def dashboard_match_improvement(
    days: int = Query(30), db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    cutoff = datetime.now(TZ_UTC8) - timedelta(days=days)
    rows = (await db.execute(
        select(func.date(OptimizedResume.created_at).label("day"), func.avg(OptimizedResume.match_score))
        .where(OptimizedResume.created_at >= cutoff, OptimizedResume.match_score.isnot(None))
        .group_by(text("day")).order_by(text("day"))
    )).all()
    return {"trend": [{"date": str(r[0]), "avg_score": round(float(r[1] or 0), 1)} for r in rows]}


@router.get("/dashboard/feature_usage")
async def dashboard_feature_usage(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    opt_count = (await db.execute(select(func.count(OptimizedResume.id)))).scalar() or 0
    refine_count = (await db.execute(select(func.count(OptimizedResume.id)).where(OptimizedResume.parent_record_id.isnot(None)))).scalar() or 0
    batch_count = (await db.execute(select(func.count("batch_optimizations.id")))).scalar() or 0
    return {"features": [
        {"name": "AI优化", "count": opt_count},
        {"name": "微调修改", "count": refine_count},
        {"name": "批量优化", "count": batch_count},
    ]}


@router.get("/dashboard/job_trending")
async def dashboard_job_trending(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    cutoff = datetime.now(TZ_UTC8) - timedelta(days=30)
    rows = (await db.execute(
        select(JobImage.parsed_job_json["title"].astext, func.count(JobImage.id))
        .where(JobImage.created_at >= cutoff, JobImage.parsed_job_json.isnot(None))
        .group_by(JobImage.parsed_job_json["title"].astext).order_by(func.count(JobImage.id).desc()).limit(10)
    )).all()
    total = sum(r[1] for r in rows)
    return {"jobs": [{"title": r[0] or "未知", "count": r[1], "percent": round(r[1] / total * 100, 1) if total else 0} for r in rows]}


@router.get("/dashboard/satisfaction")
async def dashboard_satisfaction(
    days: int = Query(30), db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    cutoff = datetime.now(TZ_UTC8) - timedelta(days=days)
    rows = (await db.execute(
        select(func.date(OptimizedResume.created_at).label("day"), func.avg(OptimizedResume.satisfaction_score))
        .where(OptimizedResume.created_at >= cutoff, OptimizedResume.satisfaction_score.isnot(None))
        .group_by(text("day")).order_by(text("day"))
    )).all()
    return {"trend": [{"date": str(r[0]), "avg_satisfaction": round(float(r[1] or 0), 2)} for r in rows]}


# ═══════════════════════════════════════════════════════
#  6. 财务管理
# ═══════════════════════════════════════════════════════

@router.get("/orders")
async def list_orders(
    page: int = Query(1), page_size: int = Query(20),
    status: str = Query(""), user_search: str = Query(""),
    start_date: str = Query(""), end_date: str = Query(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(Order)
    if status: base = base.where(Order.status == status)
    if start_date: base = base.where(Order.created_at >= datetime.fromisoformat(start_date))
    if end_date: base = base.where(Order.created_at <= datetime.fromisoformat(end_date))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()

    items = []
    for o in rows:
        ur = await db.execute(select(User).where(User.id == o.user_id))
        u = ur.scalar_one_or_none()
        items.append({"id": o.id, "order_no": o.order_no, "user_id": o.user_id,
                       "nickname": u.nickname if u else "-", "email": mask_email(u.email) if u else "-",
                       "package_name": o.package_name, "package_type": o.package_type,
                       "amount": float(o.amount), "payment_method": o.payment_method,
                       "status": o.status, "paid_at": o.paid_at.isoformat() if o.paid_at else None,
                       "created_at": o.created_at.isoformat() if o.created_at else None})
    return {"items": items, "total": total}


@router.post("/orders/{order_id}/refund")
async def refund_order(
    order_id: str, reason: str = Body(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    try:
        result = await process_refund(db, order_id, admin.id, reason)
        await db.commit()
        await _write_admin_log(db, admin.id, "refund_order", "order", order_id, {"reason": reason})
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/revenue")
async def get_revenue(
    days: int = Query(30), db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    cutoff = datetime.now(TZ_UTC8) - timedelta(days=days)
    rows = (await db.execute(
        select(Order).where(Order.created_at >= cutoff, Order.status.in_(["success", "refunded"]))
    )).scalars().all()

    total_revenue = sum(o.amount for o in rows if o.status == "success")
    refund_amount = sum(o.amount for o in rows if o.status == "refunded")
    order_count = sum(1 for o in rows if o.status == "success")

    daily_rows = (await db.execute(
        select(func.date(Order.created_at).label("day"), func.sum(Order.amount), func.count(Order.id))
        .where(Order.created_at >= cutoff, Order.status == "success")
        .group_by(text("day")).order_by(text("day"))
    )).all()

    return {
        "total_revenue": round(total_revenue, 2),
        "refund_amount": round(refund_amount, 2),
        "net_revenue": round(total_revenue - refund_amount, 2),
        "order_count": order_count,
        "daily": [{"date": str(r[0]), "revenue": round(float(r[1] or 0), 2), "orders": r[2]} for r in daily_rows],
    }


# ── 套餐管理 ─────────────────────────────────────────

@router.get("/packages")
async def list_packages(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    rows = (await db.execute(select(QuotaPackage).order_by(QuotaPackage.price))).scalars().all()
    return [{"id": p.id, "name": p.name, "package_type": p.package_type, "price": float(p.price),
             "duration_days": p.duration_days, "quota_amount": p.quota_amount, "is_active": p.is_active} for p in rows]


@router.post("/packages")
async def create_package(
    name: str = Body(...), package_type: str = Body(...), price: float = Body(...),
    duration_days: int = Body(None), quota_amount: int = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    p = QuotaPackage(id=str(uuid.uuid4()), name=name, package_type=package_type,
                      price=price, duration_days=duration_days, quota_amount=quota_amount)
    db.add(p); await db.commit()
    return {"id": p.id, "detail": "套餐已创建"}


@router.put("/packages/{package_id}")
async def update_package(
    package_id: str, is_active: bool = Body(None), price: float = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    p = (await db.execute(select(QuotaPackage).where(QuotaPackage.id == package_id))).scalar_one_or_none()
    if not p: raise HTTPException(404)
    if is_active is not None: p.is_active = is_active
    if price is not None: p.price = price
    await db.commit()
    return {"detail": "套餐已更新"}


# ═══════════════════════════════════════════════════════
#  7. 反馈与工单
# ═══════════════════════════════════════════════════════

@router.get("/feedbacks")
async def list_feedbacks(
    page: int = Query(1), page_size: int = Query(20),
    min_score: int = Query(None), max_score: int = Query(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(OptimizedResume).where(OptimizedResume.satisfaction_score.isnot(None))
    if min_score is not None: base = base.where(OptimizedResume.satisfaction_score >= min_score)
    if max_score is not None: base = base.where(OptimizedResume.satisfaction_score <= max_score)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(OptimizedResume.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [{"id": r.id, "score": r.satisfaction_score, "feedback_text": r.feedback_text,
                        "job_title": r.job_title, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows],
            "total": total}


@router.get("/feedbacks/clustering")
async def feedback_clustering(
    days: int = Query(7), db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    cutoff = datetime.now(TZ_UTC8) - timedelta(days=days)
    rows = (await db.execute(
        select(OptimizedResume.feedback_text)
        .where(OptimizedResume.feedback_text.isnot(None), OptimizedResume.satisfaction_score <= 2,
               OptimizedResume.created_at >= cutoff)
    )).scalars().all()
    return {"total_low": len(rows), "samples": rows[:20]}


@router.get("/tickets")
async def list_tickets(
    page: int = Query(1), page_size: int = Query(20),
    status: str = Query(""), priority: str = Query(""), category: str = Query(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(SupportTicket)
    if status: base = base.where(SupportTicket.status == status)
    if priority: base = base.where(SupportTicket.priority == priority)
    if category: base = base.where(SupportTicket.category == category)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(SupportTicket.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()

    items = []
    for t in rows:
        ur = await db.execute(select(User).where(User.id == t.user_id))
        u = ur.scalar_one_or_none()
        replies = (await db.execute(select(func.count(TicketReply.id)).where(TicketReply.ticket_id == t.id))).scalar() or 0
        items.append({"id": t.id, "user_id": t.user_id, "nickname": u.nickname if u else "-",
                       "category": t.category, "priority": t.priority, "subject": t.subject,
                       "status": t.status, "reply_count": replies,
                       "created_at": t.created_at.isoformat() if t.created_at else None})
    return {"items": items, "total": total}


@router.get("/tickets/{ticket_id}")
async def ticket_detail(ticket_id: str, db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    t = (await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404)
    replies = (await db.execute(select(TicketReply).where(TicketReply.ticket_id == ticket_id).order_by(TicketReply.created_at))).scalars().all()
    return {"id": t.id, "user_id": t.user_id, "category": t.category, "priority": t.priority,
            "subject": t.subject, "content": t.content, "attachments": t.attachments,
            "status": t.status, "resolution": t.resolution,
            "assigned_to": t.assigned_to,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "replies": [{"id": r.id, "content": r.content, "admin_id": r.admin_id, "user_id": r.user_id,
                          "is_internal": r.is_internal, "created_at": r.created_at.isoformat() if r.created_at else None} for r in replies]}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str, content: str = Body(...), is_internal: bool = Body(False),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    t = (await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404)
    r = TicketReply(id=str(uuid.uuid4()), ticket_id=ticket_id, admin_id=admin.id, content=content, is_internal=is_internal)
    db.add(r)
    if t.status == "open": t.status = "in_progress"; t.assigned_to = admin.id
    await db.commit()
    return {"id": r.id, "detail": "回复已发送"}


@router.put("/tickets/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str, status: str = Body(...), resolution: str = Body(None),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    if status not in ("open", "in_progress", "resolved", "closed"): raise HTTPException(400, "无效状态")
    t = (await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404)
    t.status = status
    if resolution: t.resolution = resolution
    if status == "resolved": t.assigned_to = admin.id
    if status == "closed": t.closed_at = datetime.now(TZ_UTC8)
    await db.commit()
    return {"detail": "工单状态已更新"}


# ═══════════════════════════════════════════════════════
#  8. 计费与额度配置
# ═══════════════════════════════════════════════════════

@router.get("/quota/config")
async def get_quota_config(db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin)):
    return {"free_daily_limit": 3, "free_monthly_limit": 50, "vip_unlimited": False, "carry_over": False}


@router.get("/admin-logs")
async def list_admin_logs(
    page: int = Query(1), page_size: int = Query(50),
    action: str = Query(""), admin_id: str = Query(""),
    db: AsyncSession = Depends(get_db), admin: Admin = Depends(get_current_admin),
):
    base = select(AdminLog)
    if action: base = base.where(AdminLog.action == action)
    if admin_id: base = base.where(AdminLog.admin_id == admin_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(AdminLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [{"id": l.id, "admin_id": l.admin_id, "action": l.action,
                        "target_type": l.target_type, "target_id": l.target_id,
                        "details": l.details, "created_at": l.created_at.isoformat() if l.created_at else None} for l in rows],
            "total": total}