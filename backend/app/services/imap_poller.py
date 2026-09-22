"""IMAP 回执轮询服务（阶段2：投递追踪与回执闭环）。

职责：
- 连接发件邮箱的 IMAP 收件箱，拉取近期邮件；
- 识别两类回执并匹配到具体投递记录：
  1) 退信（bounce）：mailer-daemon/postmaster 发来、multipart/report 投递状态报告、
     或主题含 Undeliverable/Mail Delivery Failed 等关键词 → 投递标记 bounced，
     收件地址进入 suppression 名单（反骚扰：尊重对方服务器信号）；
  2) HR 回复：In-Reply-To/References 引用我们发出的 Message-ID（= applications.provider_message_id）
     → 写 delivery_events(replied) + 生成 Communication(direction="in", channel="email")
     自动出现在面试追踪「沟通消息」时间线。

可测试性设计：`match_inbox_messages(messages, tracked)` 是纯函数（不做 IO），
回归脚本直接 import 单测退信/回复匹配；`fetch_recent_messages_sync` 是唯一触网层。
"""
import email
import imaplib
import logging
import re
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime

from app.config import settings

logger = logging.getLogger(__name__)

# 单次轮询最多处理的邮件数（防止首次连接全箱下载）
MAX_FETCH = 50

# 退信识别特征
_BOUNCE_SENDERS = ("mailer-daemon", "postmaster", "mail-daemon", "bounces", "noreply@")
_BOUNCE_SUBJECTS = (
    "undeliver", "delivery status notification", "mail delivery failed",
    "failure notice", "delivery failure", "returned mail", "退信", "投递失败",
)

_MSGID_RE = re.compile(r"<([^<>\s]+)>")


def imap_configured() -> bool:
    """IMAP 是否已配置真实凭据；未配置时轮询接口返回 enabled:false。"""
    return bool(settings.IMAP_HOST and settings.IMAP_USER and settings.IMAP_PASSWORD)


def _decode_subject(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:  # noqa: BLE001
        return raw or ""


def _extract_body_text(msg: email.message.Message, limit: int = 500) -> str:
    """提取纯文本正文片段（截断供事件/沟通快照展示，避免全量入库）。"""
    try:
        parts = msg.walk() if msg.is_multipart() else [msg]
        for part in parts:
            if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    try:
                        return payload.decode(charset, errors="replace").strip()[:limit]
                    except LookupError:
                        return payload.decode("utf-8", errors="replace").strip()[:limit]
    except Exception:  # noqa: BLE001 —— 解析失败不影响匹配流程
        pass
    return ""


def _is_bounce(msg: email.message.Message, subject: str, from_: str) -> bool:
    from_low = (from_ or "").lower()
    if any(k in from_low for k in _BOUNCE_SENDERS):
        return True
    if msg.get_content_type() == "multipart/report" and (msg.get_param("report-type") or "") == "delivery-status":
        return True
    subj_low = subject.lower()
    return any(k in subj_low for k in _BOUNCE_SUBJECTS)


def _all_references(msg: email.message.Message) -> set[str]:
    """收集 In-Reply-To + References 里出现的全部 Message-ID（去尖括号）。"""
    ids: set[str] = set()
    for header in ("In-Reply-To", "References"):
        raw = msg.get(header)
        if raw:
            ids.update(_MSGID_RE.findall(str(raw)) or [str(raw).strip().strip("<>")])
    return ids


def fetch_recent_messages_sync() -> list[dict]:
    """同步 IMAP 拉取收件箱近期邮件（imaplib 阻塞，调用方须在 to_thread 中执行）。

    返回统一形态的 dict 列表：message_id / in_reply_to / references / from /
    subject / date / is_bounce / body_snippet。
    """
    conn = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
    try:
        conn.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        conn.select(settings.IMAP_FOLDER, readonly=True)
        status, data = conn.search(None, "ALL")
        if status != "OK":
            return []
        ids = data[0].split()[-MAX_FETCH:]
        messages: list[dict] = []
        for mid in ids:
            status, msg_data = conn.fetch(mid, "(RFC822)")
            if status != "OK" or not msg_data or msg_data[0] is None:
                continue
            raw = msg_data[0][1]
            try:
                msg = email.message_from_bytes(raw)
            except Exception:  # noqa: BLE001
                continue
            from_ = str(msg.get("From", ""))
            subject = _decode_subject(msg.get("Subject"))
            date_raw = msg.get("Date")
            try:
                occurred = parsedate_to_datetime(date_raw) if date_raw else datetime.now(timezone.utc)
            except Exception:  # noqa: BLE001
                occurred = datetime.now(timezone.utc)
            messages.append({
                "message_id": (msg.get("Message-ID") or "").strip().strip("<>"),
                "in_reply_to": (msg.get("In-Reply-To") or "").strip().strip("<>"),
                "references": sorted(_all_references(msg)),
                "from": from_,
                "subject": subject,
                "date": occurred,
                "is_bounce": _is_bounce(msg, subject, from_),
                "body_snippet": _extract_body_text(msg),
            })
        return messages
    finally:
        try:
            conn.logout()
        except Exception:  # noqa: BLE001
            pass


def match_inbox_messages(
    messages: list[dict],
    tracked: list[dict],
) -> list[dict]:
    """纯函数：把收件箱邮件匹配到投递记录，产出回执动作列表。

    参数
    ----
    messages: fetch_recent_messages_sync 的返回（或测试构造的同形数据）。
    tracked:  待匹配的投递记录列表，形如
              {application_id, provider_message_id, recipient_email}。

    返回动作列表，元素形如：
      {"action": "bounced"|"replied", "application_id", "source_message_id",
       "snippet", "occurred_at"}
    已由调用方负责按 source_message_id 去重（避免重复处理同一封邮件）。

    匹配规则：
    - 回复：邮件 In-Reply-To/References 引用了某条投递的 provider_message_id
      （真实 Message-ID；dry-run 等占位值不可能被引用，天然不匹配）。
    - 退信：is_bounce 且能定位归属——优先 References 引用匹配，
      否则退信报告中的收件地址与投递 recipient_email 一致（X-Failed-Recipients
      或正文出现的地址）。
    """
    by_msg_id = {
        t["provider_message_id"]: t
        for t in tracked
        if t.get("provider_message_id") and t["provider_message_id"] not in ("dry-run", "sent")
    }
    by_recipient: dict[str, dict] = {}
    for t in tracked:
        if t.get("recipient_email"):
            by_recipient[t["recipient_email"].strip().lower()] = t

    actions: list[dict] = []
    for m in messages:
        refs = set(m.get("references") or [])
        if m.get("in_reply_to"):
            refs.add(m["in_reply_to"])
        matched: dict | None = None

        if refs:
            for rid in refs:
                if rid in by_msg_id:
                    matched = by_msg_id[rid]
                    break

        if m.get("is_bounce") and matched is None:
            # 退信报告常在正文/头中携带原始收件地址
            text = m.get("body_snippet") or ""
            for addr, t in by_recipient.items():
                if addr in text.lower() or addr in (m.get("subject") or "").lower():
                    matched = t
                    break

        if matched is None:
            continue

        action_type = "bounced" if m.get("is_bounce") else "replied"
        # 同一封邮件既是退信又引用了我们的 Message-ID：退信语义优先
        actions.append({
            "action": action_type,
            "application_id": matched["application_id"],
            "source_message_id": m.get("message_id") or "",
            "snippet": (m.get("body_snippet") or m.get("subject") or "")[:400],
            "occurred_at": m.get("date"),
        })
    return actions
