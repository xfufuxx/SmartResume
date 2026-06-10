"""
额度服务 — 免费额度检查、VIP配额、消费记录
"""
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.models.user import UserQuota
from app.models.optimized_resume import OptimizedResume

TZ_UTC8 = timezone(timedelta(hours=8))


async def check_and_consume_quota(
    db: AsyncSession,
    user_id: str,
    optimization_record_id: str | None = None,
) -> tuple[bool, str, int]:
    """
    检查并消耗一次优化额度
    返回: (can_use, quota_type, remaining)
    """
    result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = result.scalar_one_or_none()

    if not quota:
        quota = UserQuota(user_id=user_id, daily_limit=3, monthly_limit=50)
        db.add(quota)
        await db.flush()

    today = datetime.now(TZ_UTC8).date()
    if quota.last_reset_date is None or quota.last_reset_date.date() != today:
        quota.daily_used = 0
        quota.last_reset_date = datetime.now(TZ_UTC8)

    if quota.is_paid:
        if quota.monthly_limit <= 0:
            quota.daily_used += 1
            quota.monthly_used += 1
            await db.flush()
            return True, "vip_unlimited", -1
        remaining = quota.monthly_limit - quota.monthly_used
        if remaining <= 0:
            return False, "vip_limit_reached", 0
        quota.daily_used += 1
        quota.monthly_used += 1
        await db.flush()
        return True, "vip_monthly", remaining - 1

    remaining = quota.daily_limit - quota.daily_used
    if remaining <= 0:
        monthly_remaining = quota.monthly_limit - quota.monthly_used
        if monthly_remaining > 0:
            quota.daily_used += 1
            quota.monthly_used += 1
            await db.flush()
            return True, "free_monthly_overflow", monthly_remaining - 1
        return False, "free_daily_limit_reached", 0

    quota.daily_used += 1
    quota.monthly_used += 1
    await db.flush()
    return True, "free_daily", remaining - 1


async def add_quota(db: AsyncSession, user_id: str, amount: int, reason: str = "") -> int:
    result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = result.scalar_one_or_none()
    if not quota:
        quota = UserQuota(user_id=user_id, daily_limit=amount, monthly_limit=amount)
        db.add(quota)
        await db.flush()
        return amount
    quota.daily_limit += amount
    quota.monthly_limit += amount
    await db.flush()
    return quota.daily_limit


def generate_order_no() -> str:
    ts = datetime.now(TZ_UTC8).strftime("%Y%m%d%H%M%S")
    rand = uuid.uuid4().hex[:8].upper()
    return f"SR{ts}{rand}"