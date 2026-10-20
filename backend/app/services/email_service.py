import smtplib
import logging
from email.mime.text import MIMEText
from email.utils import formataddr
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
    # 带显示名的 From（如「智能简历 <xxx@qq.com>」），避免收件方直接看到裸 QQ 号；
    # 显示名可在 backend/.env 用 SMTP_FROM_NAME 自定义。
    # 必须用 formataddr 把中文显示名编码成 RFC2047 encoded-word（=?utf-8?b?...?=），
    # 直接写中文会被 QQ SMTP 以 550 "From header is missing or invalid" 拒绝。
    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, from_addr))
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