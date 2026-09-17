"""日志脱敏过滤器：在日志输出前对 PII（手机号、邮箱、姓名片段）做掩码处理。

PIPL 要求对个人敏感信息最小化暴露，日志中直接打印简历原文 / 联系方式属合规风险。
通过 logging.Filter 在记录生成阶段对 msg 与 args 做统一脱敏。
"""
import re
import logging

_PHONE_RE = re.compile(r"(?<!\d)(1[3-9]\d{9})(?!\d)")
_EMAIL_RE = re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")

_MASK_TOKEN = "***"


def _mask_phone(m: re.Match) -> str:
    num = m.group(1)
    return num[:3] + "****" + num[-4:]


def _mask_email(m: re.Match) -> str:
    local, _, domain = m.group(1).partition("@")
    if len(local) <= 2:
        return _MASK_TOKEN + "@" + domain
    return local[0] + _MASK_TOKEN + local[-1] + "@" + domain


def _scrub(text: str) -> str:
    if not text:
        return text
    text = _PHONE_RE.sub(_mask_phone, text)
    text = _EMAIL_RE.sub(_mask_email, text)
    return text


class SensitiveFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _scrub(record.msg)
        if record.args:
            try:
                record.args = tuple(
                    _scrub(a) if isinstance(a, str) else a for a in record.args
                )
            except Exception:
                # 脱敏失败不应影响正常日志
                pass
        return True


_installed = False


def install_sensitive_log_filter():
    """幂等地为 root logger 安装脱敏过滤器（避免重复安装）。"""
    global _installed
    if _installed:
        return
    root = logging.getLogger()
    # 同时覆盖 uvicorn / 业务 logger
    for target in (root, logging.getLogger("uvicorn"), logging.getLogger("app")):
        target.addFilter(SensitiveFilter())
    _installed = True
