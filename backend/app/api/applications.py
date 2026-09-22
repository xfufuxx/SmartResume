"""岗位投递申请：用户向指定岗位发起投递（招聘软件式一键投递 + 阶段1 邮件直投 + 阶段2 回执闭环）。

包含：
- 投递时只需「选简历 + 选填附言」，联系方式（姓名/邮箱/电话）在创建时
  自动从个人资料（User）带出，不要求用户重复填写。
- 申请数据与对应岗位关联存储（job_image_id 外键，岗位删除级联清除）。
- 投递状态记录与结果反馈（status：submitted/viewed/interview/offer/rejected）。
- 防重复投递：user_id + job_image_id 唯一约束 + 创建前 409 拦截。
- 真实触达（阶段1）：recipient_email + consent_given 走邮件直投通道，
  简历 PDF 附件经 SMTP 发送到 HR 邮箱；发送在后台任务执行并落 delivery_events；
  未提供邮箱则走 manual 记录模式（引导用户去官方渠道，站内留痕）。
- 回执闭环（阶段2）：POST /email/sync 轮询 IMAP 收件箱，退信自动标记 bounced
  并进 suppression 名单，HR 回复落 delivery_events(replied) + 沟通时间线；
  POST /batch 批量投递（逐个限频调度）；撤回投递发送撤回告知邮件；
  suppression 名单查询/手动加入/移除。
"""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.config import settings
from app.core.deps import get_current_user, get_redis
from app.database import get_db, async_session_factory
from app.models.application import Application
from app.models.communication import Communication
from app.models.delivery_event import DELIVERY_EVENT_LABELS, DeliveryEvent
from app.models.email_suppression import EmailSuppression
from app.models.job_image import JobImage
from app.models.resume import Resume
from app.models.user import User
from app.schemas.application import (
    APPLICATION_STATUSES,
    APPLICATION_STATUS_LABELS,
    DELIVERY_CHANNEL_LABELS,
    DELIVERY_STATUS_LABELS,
    ApplicationCreate,
    ApplicationResponse,
    ApplicationStats,
    ApplicationUpdate,
    BatchApplicationCreate,
    BatchApplicationResult,
    BatchResultItem,
    DeliveryEventResponse,
    FormProbeRequest,
    FormProbeResult,
    FormResultReport,
    GuidePackResponse,
    SuppressionCreate,
    SuppressionEntryResponse,
)
from app.services.delivery_email import (
    build_application_email,
    build_withdrawal_email,
    check_and_consume_daily_quota,
    detect_hr_email,
    is_valid_email,
    release_daily_quota,
    send_application_email,
    smtp_configured,
)
from app.services.email_suppression import is_suppressed, suppress_email
from app.services.form_delivery import detect_apply_url
from app.services.guide_pack import build_guide_pack, resume_plain_text
from app.services.imap_poller import (
    fetch_recent_messages_sync,
    imap_configured,
    match_inbox_messages,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/applications", tags=["Applications"])
TZ_UTC8 = timezone(timedelta(hours=8))


async def _check_owned_refs(
    db: AsyncSession,
    user: User,
    job_image_id: str,
    resume_id: str | None,
) -> JobImage:
    """校验岗位存在且属于当前用户；可选的简历也必须属于当前用户。返回岗位实体。"""
    job = await db.execute(
        select(JobImage).where(JobImage.id == job_image_id, JobImage.user_id == user.id)
    )
    job = job.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="岗位不存在或无权投递")
    if resume_id:
        r = await db.execute(
            select(Resume.id).where(Resume.id == resume_id, Resume.user_id == user.id)
        )
        if r.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="关联的简历不存在")
    return job


def _serialize(app: Application, job: JobImage | None) -> ApplicationResponse:
    data = ApplicationResponse.model_validate(app)
    data.job_title = job.title if job else None
    data.job_company = job.company if job else None
    return data


async def _get_owned(db: AsyncSession, user: User, application_id: str) -> Application:
    result = await db.execute(
        select(Application).where(Application.id == application_id, Application.user_id == user.id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="投递记录不存在")
    return app


# ────────────────────────── 阶段1：邮件直投 ──────────────────────────

async def _process_email_delivery(application_id: str) -> None:
    """后台执行真实邮件投递（API 已先返回 201，本函数用独立会话自续事务）。

    流程：取申请/岗位/简历 → 生成简历 PDF 附件（失败降级 DOCX）→ 组装邮件
    → SMTP 发送（未配置凭据自动 dry-run）→ 写 delivery_events + 回写 delivery_status。
    """
    from app.services.docx_export import build_docx_from_resume_json
    from app.services.pdf_generator import generate_pdf

    async with async_session_factory() as db:
        try:
            app_rec = (await db.execute(
                select(Application).where(Application.id == application_id)
            )).scalar_one_or_none()
            if app_rec is None:
                logger.warning("后台投递：申请 %s 已不存在，跳过", application_id)
                return
            job = (await db.execute(
                select(JobImage).where(JobImage.id == app_rec.job_image_id)
            )).scalar_one_or_none()
            job_title = (job.title if job else None) or "岗位"
            company = (job.company if job else None) or ""

            # 发送前双重校验抑制名单（创建后、发送前名单可能已因退信更新）
            if await is_suppressed(db, app_rec.user_id, app_rec.recipient_email):
                app_rec.delivery_status = "failed"
                db.add(DeliveryEvent(
                    application_id=application_id, event_type="failed",
                    detail="收件地址在退信抑制名单中，已跳过发送",
                ))
                from app.core.deps import _get_redis_client
                try:
                    await release_daily_quota(_get_redis_client(), app_rec.user_id)
                except Exception:  # noqa: BLE001
                    pass
                await db.commit()
                logger.info("后台投递跳过（suppression 命中）app=%s", application_id)
                return

            # 组装附件：优先 PDF，异常降级 DOCX
            attachments: list[tuple[str, bytes, str]] = []
            if app_rec.resume_id:
                resume = (await db.execute(
                    select(Resume).where(Resume.id == app_rec.resume_id)
                )).scalar_one_or_none()
                if resume is not None and (resume.parsed_json or {}):
                    try:
                        pdf_bytes = await generate_pdf(resume.parsed_json or {})
                        if pdf_bytes:
                            attachments.append(("resume.pdf", pdf_bytes, "application/pdf"))
                    except Exception as e:  # noqa: BLE001
                        logger.warning("简历 PDF 生成失败(降级 DOCX): %s", e)
                    if not attachments:
                        try:
                            docx_bytes = build_docx_from_resume_json(resume.parsed_json or {})
                            if docx_bytes:
                                attachments.append(("resume.docx", docx_bytes,
                                                    "application/vnd.openxmlformats-officedocument"
                                                    ".wordprocessingml.document"))
                        except Exception as e:  # noqa: BLE001
                            logger.warning("简历 DOCX 生成失败(无附件发送): %s", e)

            subject, body = build_application_email(
                applicant_name=app_rec.applicant_name,
                applicant_email=app_rec.email,
                applicant_phone=app_rec.phone,
                job_title=job_title,
                company=company,
                cover_letter=app_rec.cover_letter,
            )
            ok, info = await send_application_email(
                app_rec.recipient_email or "", subject, body, attachments
            )
            now = datetime.now(TZ_UTC8)
            if ok:
                app_rec.delivery_status = "sent"
                app_rec.sent_at = now
                app_rec.provider_message_id = info
                db.add(DeliveryEvent(
                    application_id=application_id, event_type="sent",
                    detail="dry-run 模式（未配置 SMTP，未真正出网）" if info == "dry-run"
                           else f"已发送至 {app_rec.recipient_email}",
                ))
            else:
                app_rec.delivery_status = "failed"
                db.add(DeliveryEvent(
                    application_id=application_id, event_type="failed", detail=(info or "未知错误")[:500],
                ))
                # 失败退还当日额度
                from app.core.deps import _get_redis_client
                try:
                    await release_daily_quota(_get_redis_client(), app_rec.user_id)
                except Exception:  # noqa: BLE001
                    pass
            await db.commit()
            logger.info("后台投递完成 app=%s ok=%s info=%s", application_id, ok, info)
        except Exception:  # noqa: BLE001 —— 后台任务吞异常避免任务栈噪声，但必须落事件
            logger.exception("后台投递异常 app=%s", application_id)
            try:
                app_rec2 = (await db.execute(
                    select(Application).where(Application.id == application_id)
                )).scalar_one_or_none()
                if app_rec2:
                    app_rec2.delivery_status = "failed"
                    db.add(DeliveryEvent(
                        application_id=application_id, event_type="failed", detail="后台投递内部异常",
                    ))
                    await db.commit()
            except Exception:  # noqa: BLE001
                logger.exception("后台投递异常兜底落库也失败 app=%s", application_id)


@router.get("/contact-hint/{job_id}")
async def get_contact_hint(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """投递弹窗打开时的 HR 邮箱探测与通道可用性。

    从岗位解析 JSON / OCR 文本中正则提取 HR 邮箱（用户可确认/修改）；
    同时返回 SMTP 是否已配置（未配置 = dry-run 演示模式）与今日剩余额度。
    """
    job = await _check_owned_refs(db, user, job_id, None)
    detected = detect_hr_email(job.parsed_job_json, job.ocr_text)
    detected_url = detect_apply_url(job.parsed_job_json, job.ocr_text)
    sent_today = 0
    try:
        from datetime import datetime as _dt
        today = _dt.now(TZ_UTC8).strftime("%Y%m%d")
        val = await redis.get(f"delivery:count:{user.id}:{today}")
        sent_today = int(val or 0)
    except Exception:  # noqa: BLE001 —— Redis 不可用不阻塞弹窗
        pass
    return {
        "email": detected,
        "email_source": "job_parsed" if detected else None,
        "apply_url": detected_url,
        "smtp_configured": smtp_configured(),
        "delivery_enabled": settings.DELIVERY_ENABLED,
        "daily_limit": settings.DELIVERY_DAILY_LIMIT,
        "sent_today": sent_today,
    }


@router.get("/{application_id}/delivery-events", response_model=list[DeliveryEventResponse])
async def list_delivery_events(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """投递轨迹时间线（发送/送达/退信/失败事件，按时间倒序）。"""
    app_rec = await _get_owned(db, user, application_id)
    result = await db.execute(
        select(DeliveryEvent)
        .where(DeliveryEvent.application_id == app_rec.id)
        .order_by(DeliveryEvent.occurred_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{application_id}/resend", response_model=ApplicationResponse)
async def resend_application(
    application_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """重新发送失败的邮件投递（仅 email 通道且当前非 sent 状态；占用当日额度）。"""
    app_rec = await _get_owned(db, user, application_id)
    if app_rec.channel != "email" or not app_rec.recipient_email:
        raise HTTPException(status_code=400, detail="仅邮件直投记录支持重发")
    if app_rec.delivery_status == "sent":
        raise HTTPException(status_code=400, detail="该投递已成功送达，无需重发")

    allowed, used = await check_and_consume_daily_quota(redis, user.id)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"已达今日投递上限（{used}/{settings.DELIVERY_DAILY_LIMIT}），请明日再试")

    app_rec.delivery_status = "pending"
    db.add(DeliveryEvent(application_id=app_rec.id, event_type="queued", detail="用户触发重发"))
    await db.commit()
    await db.refresh(app_rec)
    background_tasks.add_task(_process_email_delivery, app_rec.id)

    job = await db.execute(select(JobImage).where(JobImage.id == app_rec.job_image_id))
    job = job.scalar_one_or_none()
    return _serialize(app_rec, job)


# ────────────────────────── 阶段3：官网表单半自动投递 ──────────────────────────

@router.post("/form/probe", response_model=FormProbeResult)
async def probe_apply_form(
    body: FormProbeRequest,
    user: User = Depends(get_current_user),
):
    """只读探测官网投递页：robots.txt 核查 + 投递表单字段识别。

    合规边界：仅 GET 页面做结构识别，不提交任何数据；robots 禁止时拒绝并说明。
    """
    import asyncio
    from app.services.form_delivery import probe_form_page

    # requests/bs4 同步阻塞 → to_thread，不阻塞事件循环
    result = await asyncio.to_thread(probe_form_page, body.url)
    return FormProbeResult(
        ok=result.ok,
        url=result.url,
        robots_allowed=result.robots_allowed,
        robots_detail=result.robots_detail,
        form_detected=result.form_detected,
        fields=[
            {"selector": f.selector, "kind": f.kind, "input_type": f.input_type, "label": f.label}
            for f in result.fields
        ],
        site_title=result.site_title,
        detail=result.detail,
    )


async def _process_form_prefill(application_id: str, keep_open_seconds: int, headless: bool) -> None:
    """后台执行官网表单预填（API 先返回 202）。

    打开 headed 浏览器 → 预填字段（含简历附件）→ 浏览器留给用户人工确认提交
    → 结果写 delivery_events(form_prefilled)。绝不自动点击提交。
    """
    import os
    import tempfile
    import asyncio
    from app.services.form_delivery import open_and_prefill
    from app.services.docx_export import build_docx_from_resume_json
    from app.services.pdf_generator import generate_pdf

    resume_path: str | None = None
    async with async_session_factory() as db:
        try:
            app_rec = (await db.execute(
                select(Application).where(Application.id == application_id)
            )).scalar_one_or_none()
            if app_rec is None or app_rec.channel != "form" or not app_rec.apply_url:
                logger.warning("表单预填：申请 %s 不存在或非 form 通道，跳过", application_id)
                return

            # 简历文件：优先 PDF，失败降级 DOCX（写到临时文件供浏览器上传）
            if app_rec.resume_id:
                resume = (await db.execute(
                    select(Resume).where(Resume.id == app_rec.resume_id)
                )).scalar_one_or_none()
                if resume is not None and (resume.parsed_json or {}):
                    try:
                        pdf_bytes = await generate_pdf(resume.parsed_json or {})
                        if pdf_bytes:
                            tmp = tempfile.NamedTemporaryFile(
                                prefix="resume_", suffix=".pdf", delete=False)
                            tmp.write(pdf_bytes)
                            tmp.close()
                            resume_path = tmp.name
                    except Exception as e:  # noqa: BLE001
                        logger.warning("简历 PDF 生成失败(降级 DOCX): %s", e)
                    if not resume_path:
                        try:
                            docx_bytes = build_docx_from_resume_json(resume.parsed_json or {})
                            if docx_bytes:
                                tmp = tempfile.NamedTemporaryFile(
                                    prefix="resume_", suffix=".docx", delete=False)
                                tmp.write(docx_bytes)
                                tmp.close()
                                resume_path = tmp.name
                        except Exception as e:  # noqa: BLE001
                            logger.warning("简历 DOCX 生成失败(表单预填无附件): %s", e)

            data = {
                "applicant_name": app_rec.applicant_name or "",
                "email": app_rec.email or "",
                "phone": app_rec.phone or "",
                "cover_letter": app_rec.cover_letter or "",
            }
            # Playwright 同步 API 阻塞（浏览器保持打开等待用户确认）→ to_thread
            report = await asyncio.to_thread(
                open_and_prefill, app_rec.apply_url, data, resume_path,
                headless=headless, keep_open_seconds=keep_open_seconds,
            )

            if not report.get("robots_allowed"):
                app_rec.delivery_status = "failed"
                db.add(DeliveryEvent(
                    application_id=application_id, event_type="form_failed",
                    detail=(report.get("detail") or "robots.txt 禁止自动访问该站点")[:500],
                ))
            else:
                parts = []
                if report.get("filled"):
                    parts.append(f"已预填 {len(report['filled'])} 个字段")
                if report.get("uploaded"):
                    parts.append("已上传简历附件")
                if report.get("skipped"):
                    parts.append(f"{len(report['skipped'])} 个字段需手动确认")
                db.add(DeliveryEvent(
                    application_id=application_id, event_type="form_prefilled",
                    detail=("；".join(parts) or "已在浏览器打开投递页，请人工检查并手动提交")
                           + "（提交需你本人在浏览器中确认，系统不会自动提交）",
                ))
            await db.commit()
            logger.info("表单预填完成 app=%s filled=%s uploaded=%s",
                        application_id, len(report.get("filled") or []), report.get("uploaded"))
        except Exception:  # noqa: BLE001
            logger.exception("表单预填异常 app=%s", application_id)
            try:
                app_rec2 = (await db.execute(
                    select(Application).where(Application.id == application_id)
                )).scalar_one_or_none()
                if app_rec2:
                    db.add(DeliveryEvent(
                        application_id=application_id, event_type="form_failed",
                        detail="表单预填内部异常",
                    ))
                    await db.commit()
            except Exception:  # noqa: BLE001
                logger.exception("表单预填异常兜底落库失败 app=%s", application_id)
        finally:
            if resume_path:
                try:
                    os.unlink(resume_path)
                except OSError:
                    pass


@router.post("/{application_id}/form/prefill", status_code=202)
async def prefill_apply_form(
    application_id: str,
    background_tasks: BackgroundTasks,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """打开预填浏览器（headed）：官网表单按探测结果预填，用户人工确认后手动提交。

    立即返回 202，预填过程在后台执行，结果经 delivery_events(form_prefilled) 回写。
    仅 form 通道且已有 apply_url 的投递可调用。
    """
    app_rec = await _get_owned(db, user, application_id)
    if app_rec.channel != "form" or not app_rec.apply_url:
        raise HTTPException(status_code=400, detail="仅官网表单投递记录支持预填")
    if app_rec.delivery_status == "sent":
        raise HTTPException(status_code=400, detail="该投递已在官网确认提交，无需再次预填")

    # 测试钩子：回归可传 headless/keep_open_seconds；产品前端不传（headed + 默认等待）
    body = body or {}
    keep_open = int(body.get("keep_open_seconds") or 900)
    headless = bool(body.get("headless") or False)

    app_rec.delivery_status = "pending"
    await db.commit()
    background_tasks.add_task(_process_form_prefill, app_rec.id, keep_open, headless)
    return {"detail": "预填浏览器已启动，请在打开的页面中核对信息并手动提交"}


@router.post("/{application_id}/form/result", response_model=ApplicationResponse)
async def report_form_result(
    application_id: str,
    body: FormResultReport,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """用户在官网浏览器人工确认后的结果回填：submitted/failed 写事件与状态。"""
    app_rec = await _get_owned(db, user, application_id)
    if app_rec.channel != "form":
        raise HTTPException(status_code=400, detail="仅官网表单投递记录支持结果回填")

    if body.result == "submitted":
        app_rec.delivery_status = "sent"
        app_rec.sent_at = datetime.now(TZ_UTC8)
        db.add(DeliveryEvent(
            application_id=app_rec.id, event_type="form_submitted",
            detail=(body.detail or "你已在官网投递页人工确认提交")[:500],
        ))
    else:
        app_rec.delivery_status = "failed"
        db.add(DeliveryEvent(
            application_id=app_rec.id, event_type="form_failed",
            detail=(body.detail or "官网提交未完成")[:500],
        ))
    await db.commit()
    await db.refresh(app_rec)
    job = await db.execute(select(JobImage).where(JobImage.id == app_rec.job_image_id))
    job = job.scalar_one_or_none()
    return _serialize(app_rec, job)


# ── 阶段4：平台引导投递（通道 C，零合规风险：只生成准备包，绝不代替用户投递）──


async def _load_resume_text(
    db: AsyncSession, user: User, resume_id: str | None,
) -> tuple[str | None, str]:
    """取（指定或默认主）简历并渲染纯文本。返回 (resume_title, resume_text)。"""
    if resume_id:
        r = await db.execute(
            select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
        )
        resume = r.scalar_one_or_none()
        if resume is None:
            raise HTTPException(status_code=404, detail="关联的简历不存在")
    else:
        r = await db.execute(
            select(Resume)
            .where(Resume.user_id == user.id, Resume.deleted_at.is_(None))
            .order_by(Resume.is_primary.desc(), Resume.updated_at.desc())
            .limit(1)
        )
        resume = r.scalars().first()
    if resume is None:
        return None, ""
    return resume.title, resume_plain_text(
        resume.parsed_json, resume.raw_text, resume.target_position,
    )


@router.get("/guide-pack/{job_id}", response_model=GuidePackResponse)
async def get_guide_pack(
    job_id: str,
    resume_id: str | None = Query(None, description="指定简历；不传则取主简历/最新简历"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """一键准备包：平台识别 + 深链 + 简历纯文本。

    深链只指向官方公开页面（JD 内平台链接优先，否则平台搜索页），
    最后一步「发送」由用户在官方平台完成——本系统不代投、不模拟登录态。
    """
    job = await _check_owned_refs(db, user, job_id, resume_id)
    pack = build_guide_pack(job.parsed_job_json, job.ocr_text, job.title, job.company)
    resume_title, resume_text = await _load_resume_text(db, user, resume_id)
    return GuidePackResponse(
        job_title=job.title,
        job_company=job.company,
        resume_title=resume_title,
        resume_text=resume_text,
        **pack,
    )


@router.post("/{application_id}/guide/opened", status_code=201)
async def log_guide_opened(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """记录「用户点击打开平台岗位页」事件（时间线留痕，不影响状态）。"""
    app_rec = await _get_owned(db, user, application_id)
    if app_rec.channel != "guide":
        raise HTTPException(status_code=400, detail="仅平台引导投递记录支持此操作")
    db.add(DeliveryEvent(
        application_id=app_rec.id, event_type="guide_opened",
        detail=f"已前往{'' if not app_rec.apply_url else '：' + app_rec.apply_url[:200]}",
    ))
    await db.commit()
    return {"detail": "ok"}


@router.post("/{application_id}/guide/result", response_model=ApplicationResponse)
async def report_guide_result(
    application_id: str,
    body: FormResultReport,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """用户在官方平台完成/放弃投递后的结果回填：submitted/failed 写事件与状态。"""
    app_rec = await _get_owned(db, user, application_id)
    if app_rec.channel != "guide":
        raise HTTPException(status_code=400, detail="仅平台引导投递记录支持结果回填")

    if body.result == "submitted":
        app_rec.delivery_status = "sent"
        app_rec.sent_at = datetime.now(TZ_UTC8)
        if app_rec.status == "submitted":
            app_rec.status = "submitted"
        db.add(DeliveryEvent(
            application_id=app_rec.id, event_type="guide_submitted",
            detail=(body.detail or "你已在官方平台完成投递")[:500],
        ))
    else:
        app_rec.delivery_status = "failed"
        db.add(DeliveryEvent(
            application_id=app_rec.id, event_type="guide_failed",
            detail=(body.detail or "平台投递未完成")[:500],
        ))
    await db.commit()
    await db.refresh(app_rec)
    job = await db.execute(select(JobImage).where(JobImage.id == app_rec.job_image_id))
    job = job.scalar_one_or_none()
    return _serialize(app_rec, job)


@router.get("/options")
async def get_options():
    """前端表单下拉用的可选项（状态枚举单一数据源，避免前后端漂移）。"""
    from app.schemas.application import DELIVERY_CHANNELS, DELIVERY_STATUSES
    return {
        "statuses": APPLICATION_STATUSES,
        "status_labels": APPLICATION_STATUS_LABELS,
        "delivery_channels": DELIVERY_CHANNELS,
        "delivery_channel_labels": DELIVERY_CHANNEL_LABELS,
        "delivery_statuses": DELIVERY_STATUSES,
        "delivery_status_labels": DELIVERY_STATUS_LABELS,
        "delivery_event_labels": DELIVERY_EVENT_LABELS,
        "smtp_configured": smtp_configured(),
    }


@router.post("/", response_model=ApplicationResponse, status_code=201)
async def create_application(
    body: ApplicationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """向指定岗位发起投递（招聘软件式一键投递 + 可选邮件直投）。

    - recipient_email 为空：manual 记录模式（站内留痕，引导用户去官方渠道投递）。
    - recipient_email 非空：邮件直投通道。必须 consent_given=true（PIPL 单独同意），
      且未超当日额度；邮件在后台任务中发送（本接口立即返回 201，投递状态经
      delivery_events 异步回写）。
    - 同一用户同一岗位已存在申请则拒绝（防重复投递）。
    """
    job = await _check_owned_refs(db, user, body.job_image_id, body.resume_id)

    existing = await db.execute(
        select(Application.id).where(
            Application.user_id == user.id, Application.job_image_id == body.job_image_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="你已投递过该岗位，不可重复投递")

    # ── 通道决策（显式 guide > email > form > manual；对外通道均需 PIPL 单独同意）──
    if body.channel_hint == "guide" and not body.consent_given:
        raise HTTPException(
            status_code=422,
            detail="平台引导投递需要你勾选授权确认（PIPL 单独同意）后方可进行",
        )
    want_guide = body.channel_hint == "guide" and body.consent_given
    want_email = (
        not want_guide
        and settings.DELIVERY_ENABLED
        and bool(body.recipient_email)
        and body.consent_given
    )
    want_form = (not want_guide) and bool(body.apply_url) and body.consent_given
    if (body.recipient_email or body.apply_url) and not body.consent_given:
        raise HTTPException(
            status_code=422,
            detail="对外投递需要你勾选授权确认（PIPL 单独同意）后方可进行",
        )

    channel: str | None = None
    delivery_status: str | None = None
    consent_at = None
    if want_email:
        if not is_valid_email(body.recipient_email or ""):
            raise HTTPException(status_code=422, detail="HR 邮箱格式不正确")
        if await is_suppressed(db, user.id, body.recipient_email):
            raise HTTPException(
                status_code=422,
                detail="该邮箱因此前退信已被加入「不发送名单」，尊重对方信号暂不投递；"
                       "如确认可正常接收，请在面试追踪的退信名单中移除后重试",
            )
        allowed, used = await check_and_consume_daily_quota(redis, user.id)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"已达今日投递上限（{used}/{settings.DELIVERY_DAILY_LIMIT}），请明日再试",
            )
        channel = "email"
        delivery_status = "pending"
        consent_at = datetime.now(TZ_UTC8)
    elif want_form:
        # 官网表单半自动投递：不发邮件、不占邮件额度；预填与提交由用户在浏览器完成
        channel = "form"
        delivery_status = "pending"  # pending=预填流程进行中，最终由用户回填结果
        consent_at = datetime.now(TZ_UTC8)
    elif want_guide:
        # 平台引导投递（阶段4）：只生成深链 + 准备包，最后一步「发送」由用户在官方平台完成
        channel = "guide"
        delivery_status = "pending"
        consent_at = datetime.now(TZ_UTC8)
    else:
        channel = "manual"
        delivery_status = "not_applicable"

    app = Application(
        user_id=user.id,
        job_image_id=body.job_image_id,
        resume_id=body.resume_id,
        cover_letter=body.cover_letter,
        status="submitted",
        # 联系方式自动取自个人资料（招聘软件式：不重复填写）
        applicant_name=user.nickname or "",
        email=user.email,
        phone=user.phone or "",
        # 真实触达（阶段1/阶段3）
        channel=channel,
        apply_url=body.apply_url if channel in ("form", "guide") else None,
        recipient_email=body.recipient_email if channel == "email" else None,
        delivery_status=delivery_status,
        consent_at=consent_at,
    )
    db.add(app)
    await db.flush()
    await db.refresh(app)
    if channel == "email":
        db.add(DeliveryEvent(application_id=app.id, event_type="queued", detail="已加入发送队列"))
    await db.commit()
    await db.refresh(app)

    # 邮件投递在后台执行（响应不被 SMTP 阻塞）；dry-run 未配置 SMTP 时同样走此路径
    if channel == "email":
        background_tasks.add_task(_process_email_delivery, app.id)

    return _serialize(app, job)


@router.get("/", response_model=list[ApplicationResponse])
async def list_applications(
    status: str | None = Query(None, description="按状态过滤"),
    keyword: str | None = Query(None, max_length=100, description="申请人姓名 / 邮箱关键词"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户的投递申请（按投递时间倒序）。"""
    stmt = select(Application).where(Application.user_id == user.id)
    if status:
        if status not in APPLICATION_STATUSES:
            raise HTTPException(status_code=400, detail=f"状态必须是 {'/'.join(APPLICATION_STATUSES)} 之一")
        stmt = stmt.where(Application.status == status)
    if keyword:
        kw = f"%{keyword.strip()}%"
        stmt = stmt.where(Application.applicant_name.ilike(kw) | Application.email.ilike(kw))

    stmt = stmt.order_by(Application.created_at.desc())
    result = await db.execute(stmt)
    apps = list(result.scalars().all())

    # 批量取岗位标题（含已软删岗位，仍可被读取用于展示）
    job_map: dict[str, JobImage] = {}
    job_ids = [a.job_image_id for a in apps]
    if job_ids:
        jr = await db.execute(select(JobImage).where(JobImage.id.in_(job_ids)))
        for j in jr.scalars().all():
            job_map[j.id] = j

    return [_serialize(a, job_map.get(a.job_image_id)) for a in apps]


@router.get("/stats", response_model=ApplicationStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """基于真实投递记录的统计（无模拟数据）。"""
    result = await db.execute(
        select(Application.status, func.count())
        .where(Application.user_id == user.id)
        .group_by(Application.status)
    )
    by_status: dict[str, int] = {s: 0 for s in APPLICATION_STATUSES}
    total = 0
    for st, cnt in result.all():
        if st in by_status:
            by_status[st] = cnt
        total += cnt
    return ApplicationStats(total=total, by_status=by_status)


@router.get("/applied-job-ids", response_model=list[str])
async def applied_job_ids(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """返回当前用户已投递过的岗位 ID 列表，供岗位页标记「已投递」。"""
    result = await db.execute(
        select(Application.job_image_id).where(Application.user_id == user.id)
    )
    return list(result.scalars().all())


@router.get("/check/{job_id}")
async def check_applied(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """查询当前用户是否已投递某岗位（岗位页投递按钮状态用）。"""
    r = await db.execute(
        select(Application.id).where(
            Application.user_id == user.id, Application.job_image_id == job_id
        )
    )
    application_id = r.scalar_one_or_none()
    return {"applied": application_id is not None, "application_id": application_id}


# ────────────────────────── 阶段2：回执闭环 / 批量投递 / suppression ──────────────────────────

@router.post("/email/sync")
async def sync_email_receipts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """轮询发件邮箱的 IMAP 收件箱，处理退信与 HR 回复（用户手动触发）。

    - 退信：投递标记 bounced + 收件地址自动进 suppression 名单；
    - 回复：写 delivery_events(replied) + 生成 Communication(direction=in,
      channel=email)，自动出现在面试追踪「沟通消息」时间线；
    - 同一封邮件只处理一次（按 Message-ID 在已有事件中溯源去重）。
    """
    if not imap_configured():
        return {
            "enabled": False, "scanned": 0, "bounces": 0, "replies": 0,
            "message": "未配置 IMAP（IMAP_HOST/IMAP_USER/IMAP_PASSWORD），无法拉取回执",
        }

    rows = await db.execute(
        select(Application).where(
            Application.user_id == user.id,
            Application.channel == "email",
            Application.provider_message_id.is_not(None),
        )
    )
    apps = list(rows.scalars().all())
    tracked = [
        {
            "application_id": a.id,
            "provider_message_id": a.provider_message_id,
            "recipient_email": a.recipient_email,
        }
        for a in apps
    ]
    if not tracked:
        return {"enabled": True, "scanned": 0, "bounces": 0, "replies": 0,
                "message": "暂无待匹配的邮件投递记录"}

    try:
        messages = await asyncio.to_thread(fetch_recent_messages_sync)
    except Exception as e:  # noqa: BLE001 —— IMAP 连接失败需给出明确反馈
        logger.warning("IMAP 拉取失败 user=%s: %s", user.id, e)
        return {"enabled": True, "scanned": 0, "bounces": 0, "replies": 0,
                "message": f"IMAP 连接失败：{str(e)[:200]}"}

    actions = match_inbox_messages(messages, tracked)

    # 去重：已落过事件（detail 带 [src:<message_id>]）的邮件不再处理
    app_ids = {a.id for a in apps}
    existing_events = await db.execute(
        select(DeliveryEvent.detail).where(
            DeliveryEvent.application_id.in_(app_ids),
            DeliveryEvent.event_type.in_(["bounced", "replied"]),
        )
    )
    seen_src: set[str] = set()
    for (detail,) in existing_events.all():
        if detail:
            seen_src.update(_SRC_RE.findall(detail))

    # 岗位快照（用于回复生成的沟通记录公司/职位）
    job_ids = {a.job_image_id for a in apps}
    job_map: dict[str, JobImage] = {}
    if job_ids:
        jr = await db.execute(select(JobImage).where(JobImage.id.in_(job_ids)))
        job_map = {j.id: j for j in jr.scalars().all()}
    app_by_id = {a.id: a for a in apps}

    bounces = replies = suppressed_new = 0
    for act in actions:
        src = act.get("source_message_id") or ""
        if src and src in seen_src:
            continue
        app_rec = app_by_id.get(act["application_id"])
        if app_rec is None:
            continue
        occurred = act.get("occurred_at")
        suffix = f" [src:{src}]" if src else ""
        if act["action"] == "bounced":
            app_rec.delivery_status = "bounced"
            db.add(DeliveryEvent(
                application_id=app_rec.id, event_type="bounced",
                detail=f"收到退信：{(act.get('snippet') or '')[:200]}{suffix}",
            ))
            before = await is_suppressed(db, user.id, app_rec.recipient_email)
            await suppress_email(db, user.id, app_rec.recipient_email,
                                 reason="bounce", detail=(act.get("snippet") or "")[:200])
            if before is None:
                suppressed_new += 1
            bounces += 1
        else:  # replied
            db.add(DeliveryEvent(
                application_id=app_rec.id, event_type="replied",
                detail=f"收到对方回复：{(act.get('snippet') or '')[:200]}{suffix}",
            ))
            job = job_map.get(app_rec.job_image_id)
            db.add(Communication(
                user_id=user.id,
                application_id=app_rec.id,
                company=(job.company if job else None) or app_rec.recipient_email or "对方",
                position=job.title if job else None,
                direction="in", channel="email",
                content=(act.get("snippet") or "(无正文)"),
                contact_at=occurred,
            ))
            replies += 1

    await db.commit()
    return {
        "enabled": True, "scanned": len(messages), "matched": len(actions),
        "bounces": bounces, "replies": replies,
        "suppressed_new": suppressed_new,
        "message": f"扫描 {len(messages)} 封，新增退信 {bounces} 条、回复 {replies} 条"
                   + (f"，新加入不发送名单 {suppressed_new} 个地址" if suppressed_new else ""),
    }


@router.post("/batch", response_model=BatchApplicationResult)
async def batch_create_applications(
    body: BatchApplicationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
):
    """批量投递（阶段2）：多个岗位共用简历/附言/授权，逐个限频调度。

    每个岗位独立判定：409 重复跳过、429 额度用尽记 failed_quota、
    suppression 命中跳过；有效任务进入后台发送队列（与单投同一链路）。
    """
    result = BatchApplicationResult()
    # 简历一次校验（批量共用）
    if body.resume_id:
        r = await db.execute(
            select(Resume.id).where(Resume.id == body.resume_id, Resume.user_id == user.id)
        )
        if r.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="关联的简历不存在")

    seen: set[str] = set()
    for job_id in body.job_image_ids:
        if job_id in seen:
            continue
        seen.add(job_id)
        item = BatchResultItem(job_image_id=job_id)
        try:
            job = await _check_owned_refs(db, user, job_id, body.resume_id)
            existing = await db.execute(
                select(Application.id).where(
                    Application.user_id == user.id, Application.job_image_id == job_id
                )
            )
            if existing.scalar_one_or_none():
                item.ok, item.code, item.detail = False, 409, "已投递过该岗位，跳过"
                result.items.append(item)
                result.skipped += 1
                continue

            recipient = (body.recipient_emails or {}).get(job_id)
            want_email = bool(
                settings.DELIVERY_ENABLED and recipient and body.consent_given
            )
            if recipient and not body.consent_given:
                item.ok, item.code, item.detail = False, 422, "未勾选授权，跳过邮件直投"
                result.items.append(item)
                result.skipped += 1
                continue
            if recipient and not is_valid_email(recipient):
                item.ok, item.code, item.detail = False, 422, "HR 邮箱格式不正确，跳过"
                result.items.append(item)
                result.skipped += 1
                continue
            if want_email and await is_suppressed(db, user.id, recipient):
                item.ok, item.code, item.detail = False, 422, "邮箱在不发送名单中，跳过"
                result.items.append(item)
                result.skipped += 1
                continue

            if want_email:
                allowed, used = await check_and_consume_daily_quota(redis, user.id)
                if not allowed:
                    item.ok, item.code = False, 429
                    item.detail = f"今日额度已用尽（{used}/{settings.DELIVERY_DAILY_LIMIT}）"
                    result.items.append(item)
                    result.failed_quota += 1
                    continue
                channel, delivery_status = "email", "pending"
                consent_at: datetime | None = datetime.now(TZ_UTC8)
            else:
                channel, delivery_status = "manual", "not_applicable"
                consent_at = None

            app = Application(
                user_id=user.id,
                job_image_id=job_id,
                resume_id=body.resume_id,
                cover_letter=body.cover_letter,
                status="submitted",
                applicant_name=user.nickname or "",
                email=user.email,
                phone=user.phone or "",
                channel=channel,
                recipient_email=recipient if channel == "email" else None,
                delivery_status=delivery_status,
                consent_at=consent_at,
            )
            db.add(app)
            await db.flush()
            if channel == "email":
                db.add(DeliveryEvent(application_id=app.id, event_type="queued", detail="批量投递入队"))
            await db.commit()
            await db.refresh(app)
            item.ok, item.code, item.detail = True, 201, "已加入投递队列"
            item.application_id = app.id
            result.items.append(item)
            result.created += 1
            if channel == "email":
                background_tasks.add_task(_process_email_delivery, app.id)
        except HTTPException as e:
            item.ok, item.code, item.detail = False, e.status_code, str(e.detail)
            result.items.append(item)
            if e.status_code == 409:
                result.skipped += 1
            elif e.status_code == 429:
                result.failed_quota += 1
            else:
                result.skipped += 1
        except Exception as e:  # noqa: BLE001 —— 单个岗位失败不拖垮整批
            logger.exception("批量投递单岗位异常 job=%s", job_id)
            item.ok, item.code, item.detail = False, 500, f"内部异常：{str(e)[:120]}"
            result.items.append(item)
            result.skipped += 1

    return result


@router.get("/suppressions", response_model=list[SuppressionEntryResponse])
async def list_suppressions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """我的邮件不发送名单（退信自动加入 / 手动加入）。"""
    result = await db.execute(
        select(EmailSuppression)
        .where(EmailSuppression.user_id == user.id)
        .order_by(EmailSuppression.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/suppressions", response_model=SuppressionEntryResponse, status_code=201)
async def add_suppression(
    body: SuppressionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """手动把地址加入不发送名单（用户控制权：不想再向某邮箱投递）。"""
    entry = await suppress_email(db, user.id, body.email, reason="manual", detail=body.detail)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/suppressions/{entry_id}")
async def remove_suppression(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """从名单移除地址（如确认对方邮箱已修复，可恢复投递）。"""
    result = await db.execute(
        select(EmailSuppression).where(
            EmailSuppression.id == entry_id, EmailSuppression.user_id == user.id
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="名单记录不存在")
    await db.delete(entry)
    await db.commit()
    return {"detail": "已移除"}


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    app = await _get_owned(db, user, application_id)
    job = await db.execute(select(JobImage).where(JobImage.id == app.job_image_id))
    job = job.scalar_one_or_none()
    return _serialize(app, job)


@router.put("/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: str,
    body: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """更新投递：手动推进状态、改投递简历或补附言（联系方式不可改，取自个人资料）。"""
    app = await _get_owned(db, user, application_id)

    # 改投递简历时必须属于本人
    if body.resume_id:
        r = await db.execute(
            select(Resume.id).where(Resume.id == body.resume_id, Resume.user_id == user.id)
        )
        if r.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="关联的简历不存在")

    if body.status is not None:
        app.status = body.status
    if body.resume_id is not None:
        app.resume_id = body.resume_id
    if body.cover_letter is not None:
        app.cover_letter = body.cover_letter

    await db.commit()
    await db.refresh(app)
    job = await db.execute(select(JobImage).where(JobImage.id == app.job_image_id))
    job = job.scalar_one_or_none()
    return _serialize(app, job)


@router.delete("/{application_id}")
async def delete_application(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """撤回投递：删除申请记录（唯一约束释放，可再次投递该岗位）。

    阶段2：邮件直投且已记录收件邮箱的，撤回时向对方发送撤回告知邮件
    （礼貌告知、请对方删除简历——PIPL 数据最小化与用户控制权的延伸）；
    未配置 SMTP 时记 dry-run；告知失败不阻塞撤回本身。
    """
    app = await _get_owned(db, user, application_id)
    job = await db.execute(select(JobImage).where(JobImage.id == app.job_image_id))
    job = job.scalar_one_or_none()

    withdrawal_status = "skipped"
    if app.channel == "email" and app.recipient_email:
        if not smtp_configured():
            withdrawal_status = "dry-run"
            logger.info("[撤回告知 dry-run] To=%s app=%s", app.recipient_email, app.id)
        else:
            subject, body = build_withdrawal_email(
                applicant_name=app.applicant_name or user.nickname or "",
                applicant_email=app.email or user.email,
                job_title=(job.title if job else None) or "岗位",
                company=(job.company if job else None) or "",
            )
            try:
                ok, info = await send_application_email(
                    app.recipient_email, subject, body, []
                )
                withdrawal_status = "sent" if ok else f"failed: {(info or '')[:120]}"
            except Exception as e:  # noqa: BLE001 —— 告知失败不阻塞撤回
                logger.warning("撤回告知邮件异常 app=%s: %s", app.id, e)
                withdrawal_status = f"failed: {str(e)[:120]}"

    await db.delete(app)
    await db.commit()
    return {"detail": "已撤回投递", "withdrawal_email": withdrawal_status}
