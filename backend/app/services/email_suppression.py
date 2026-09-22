"""邮件抑制名单（suppression）读写助手（阶段2）。

原则：
- 退信地址必须自动入名单，尊重对方服务器的拒收信号（反骚扰合规要求）；
- 发送前一律先查名单，命中即拒绝并落事件；
- 用户对手上名单有完整控制权（查询/手动加入/移除，PIPL 用户控制权）。
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_suppression import EmailSuppression

logger = logging.getLogger(__name__)


async def is_suppressed(db: AsyncSession, user_id: str, email_addr: str | None) -> EmailSuppression | None:
    """查询地址是否在当前用户的发送抑制名单中（命中返回记录）。"""
    if not email_addr:
        return None
    result = await db.execute(
        select(EmailSuppression).where(
            EmailSuppression.user_id == user_id,
            EmailSuppression.email == email_addr.strip().lower(),
        )
    )
    return result.scalar_one_or_none()


async def suppress_email(
    db: AsyncSession,
    user_id: str,
    email_addr: str | None,
    reason: str = "bounce",
    detail: str | None = None,
) -> EmailSuppression | None:
    """把地址加入名单（幂等：已存在时更新原因备注而不报错）。"""
    if not email_addr:
        return None
    email_norm = email_addr.strip().lower()
    existing = await is_suppressed(db, user_id, email_norm)
    if existing:
        if detail:
            existing.detail = detail
        return existing
    entry = EmailSuppression(user_id=user_id, email=email_norm, reason=reason, detail=detail)
    db.add(entry)
    return entry
