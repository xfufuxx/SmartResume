"""真实投递服务（阶段1：邮件直投通道）。

职责：
- 组装并发送「简历申请」邮件（正文 + 简历 PDF/DOCX 附件）；
- SMTP 未配置时自动降级为 dry-run（与项目 LLM Mock 降级策略一致），
  保证开发/演示环境全链路可跑、事件可追溯，但不真正出网；
- Redis 每日限频（反骚扰），发送结果写入 delivery_events 并回写 applications.delivery_status。

设计约束：
- smtplib 为同步阻塞，统一用 asyncio.to_thread 包裹，不阻塞事件循环；
- 发送在后台任务中执行（API 先返回 201），使用独立数据库会话（async_session_factory）。
"""
import asyncio
import logging
import re
from datetime import datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import policy
from email.utils import formatdate

import smtplib

from app.config import settings

logger = logging.getLogger(__name__)

# 简单邮箱格式校验（与 schemas 保持宽松一致）
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# 从 JD 结构化文本中探测 HR 邮箱（阶段1 的 contact 提取：正则即可，避免依赖 LLM 增加延迟）
_HR_EMAIL_RE = re.compile(
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|cn|net|org|io|co|edu|vip|top|xyz)\b",
    re.IGNORECASE,
)
# 明显不是 HR 邮箱的发件域（示例性黑名单，可按需扩展）
_EXCLUDED_EMAIL_KEYWORDS = ("example.com", "test.com", "noreply", "no-reply", "donotreply")


def is_valid_email(email: str) -> bool:
    return bool(email and _EMAIL_RE.match(email.strip()))


def detect_hr_email(parsed_job_json: dict | None, ocr_text: str | None) -> str | None:
    """从岗位解析结果 / OCR 文本中探测 HR 邮箱；找不到返回 None。

    排除 noreply/example 等明显非人工接收的地址；多命中时取第一个
    （前端会展示给用户确认/修改，误报可被人工纠正）。
    """
    candidates: list[str] = []
    for source in (parsed_job_json or {}, ocr_text or ""):
        if isinstance(source, dict):
            texts: list[str] = list(source.values())
        else:
            texts = [source]
        for t in texts:
            if isinstance(t, str):
                candidates.extend(_HR_EMAIL_RE.findall(t))
    for c in candidates:
        low = c.lower()
        if not any(k in low for k in _EXCLUDED_EMAIL_KEYWORDS):
            return c.strip()
    return None


def smtp_configured() -> bool:
    """SMTP 是否已配置真实凭据；否则发送一律 dry-run。"""
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def build_application_email(
    *,
    applicant_name: str,
    applicant_email: str,
    applicant_phone: str,
    job_title: str,
    company: str,
    cover_letter: str | None,
) -> tuple[str, str]:
    """生成投递邮件的主题与正文（纯文本，正文只含申请必要字段——数据最小化）。"""
    subject = f"应聘申请-{job_title}-{applicant_name}"
    lines = [
        f"您好！",
        "",
        f"我在「智能简历」看到贵司 {company or '贵司'} 的 {job_title} 岗位，特此投递简历，盼回复。",
        "",
        "── 基本信息 ──",
        f"姓名：{applicant_name}",
        f"邮箱：{applicant_email}",
        f"电话：{applicant_phone or '（未填写）'}",
    ]
    if cover_letter:
        lines += ["", "── 附言 ──", cover_letter.strip()]
    lines += [
        "",
        "个人简历详见附件，感谢您百忙之中查阅。",
        "",
        f"{applicant_name}",
        formatdate(localtime=True),
    ]
    return subject, "\n".join(lines)


def _send_email_with_attachments_sync(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, bytes, str]],
) -> tuple[bool, str | None]:
    """同步 SMTP 发送（带附件）。返回 (是否成功, provider_message_id 或失败原因)。

    SMTP 未配置时 dry-run：记日志并返回 (True, "dry-run")，不出网。
    """
    if not smtp_configured():
        logger.info(
            "[投递 dry-run] To=%s Subject=%s 附件数=%d（未配置 SMTP，未真正出网）",
            to_email, subject, len(attachments),
        )
        return True, "dry-run"

    from_addr = settings.SMTP_FROM or settings.SMTP_USER
    msg = MIMEMultipart()
    msg.policy = policy.SMTP
    msg["From"] = f"{settings.DELIVERY_FROM_NAME} <{from_addr}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=False)

    msg.attach(MIMEText(body, "plain", "utf-8"))
    for filename, data, mime_type in attachments:
        maintype, _, subtype = mime_type.partition("/")
        part = MIMEApplication(data, _subtype=subtype or "octet-stream")
        part.add_header("Content-Disposition", "attachment", filename=filename)
        if maintype:
            part.replace_header("Content-Type", f'{maintype}/{subtype}')
        msg.attach(part)

    try:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        refused = server.send_message(msg, from_addr=from_addr, to_addrs=[to_email])
        quit_code = server.noop()
        server.quit()
        if refused:
            return False, f"对方拒收: {refused}"
        msg_id = msg.get("Message-ID")
        return True, (msg_id.strip("<>") if isinstance(msg_id, str) else None) or "sent"
    except Exception as e:  # noqa: BLE001 —— 发送失败需落事件而非抛断流程
        logger.error("投递邮件发送失败 To=%s: %s", to_email, e)
        return False, str(e)


async def send_application_email(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, bytes, str]],
) -> tuple[bool, str | None]:
    """异步包装：线程池中执行同步 SMTP，避免阻塞事件循环。"""
    return await asyncio.to_thread(
        _send_email_with_attachments_sync, to_email, subject, body, attachments
    )


def build_withdrawal_email(
    *,
    applicant_name: str,
    applicant_email: str,
    job_title: str,
    company: str,
) -> tuple[str, str]:
    """生成撤回投递告知邮件（阶段2：用户撤回时礼貌告知对方撤回申请）。"""
    subject = f"撤回申请-{job_title}-{applicant_name}"
    lines = [
        "您好！",
        "",
        f"我此前向贵司 {company or '贵司'} 投递了 {job_title} 岗位的申请，现因个人安排变动，"
        "特此告知撤回该申请，简历可自行删除，无需再作处理。",
        "",
        "感谢您此前的时间与考虑，期待未来有机会再合作。",
        "",
        f"{applicant_name}",
        f"（本邮件由申请人委托「智能简历」发送，联系邮箱：{applicant_email}）",
    ]
    return subject, "\n".join(lines)


# ── Redis 每日限频 ──

_DAILY_LIMIT = settings.DELIVERY_DAILY_LIMIT


async def check_and_consume_daily_quota(redis_client, user_id: str) -> tuple[bool, int]:
    """检查并占用当日投递额度。返回 (是否放行, 今日已用次数)。

    Key 按自然日分桶，次日自动过期（86400s 兜底 TTL）。
    """
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"delivery:count:{user_id}:{today}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, 86400)
    return count <= _DAILY_LIMIT, int(count)


async def release_daily_quota(redis_client, user_id: str) -> None:
    """发送失败时退还当日额度（DECR，且不为负）。"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"delivery:count:{user_id}:{today}"
    try:
        val = int(await redis_client.get(key) or 0)
        if val > 0:
            await redis_client.decr(key)
    except Exception:  # noqa: BLE001 —— 退还失败不影响主流程
        pass
