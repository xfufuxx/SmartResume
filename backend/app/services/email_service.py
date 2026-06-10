import smtplib
import logging
from email.mime.text import MIMEText
from email import policy
from app.config import settings

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, code: str) -> bool:
    subject = "智能简历 - 邮箱验证码"
    body = f"""您好！

您的验证码是：{code}

此验证码 5 分钟内有效，请勿泄露给他人。

如非本人操作，请忽略此邮件。

—— 智能简历团队"""

    return _send_email(to_email, subject, body)


def _send_email(to_email: str, subject: str, body: str) -> bool:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(f"[模拟邮件] To: {to_email} | Subject: {subject} | Code: {body[:80]}...")
        return True

    from_addr = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEText(body, "plain", "utf-8")
    msg.policy = policy.SMTP
    msg["From"] = from_addr
    msg["To"] = to_email
    msg["Subject"] = subject

    try:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg, from_addr=from_addr, to_addrs=[to_email])
        server.quit()
        logger.info(f"邮件发送成功: {to_email}")
        return True
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")
        return False