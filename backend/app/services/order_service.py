"""
订单退款处理服务
处理退款流程：创建退款记录 → 收回VIP权益 → 更新订单状态
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.admin import Order, QuotaPackage
from app.models.user import User, UserQuota

TZ_UTC8 = timezone(timedelta(hours=8))


async def process_refund(
    db: AsyncSession,
    order_id: str,
    admin_id: str,
    reason: str = "",
) -> dict:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError("订单不存在")
    if order.status != "success":
        raise ValueError(f"订单状态为 {order.status}，无法退款")
    if order.paid_at and (datetime.now(TZ_UTC8) - order.paid_at).days > 30:
        raise ValueError("超过30天退款期")

    pkg_result = await db.execute(
        select(QuotaPackage).where(QuotaPackage.package_type == order.package_type)
    )
    pkg = pkg_result.scalar_one_or_none()

    quota_result = await db.execute(select(UserQuota).where(UserQuota.user_id == order.user_id))
    quota = quota_result.scalar_one_or_none()
    if quota and pkg:
        if pkg.package_type in ("monthly_vip", "yearly_vip", "quarterly_vip"):
            quota.is_paid = False
        elif pkg.package_type.startswith("topup"):
            quota.daily_limit = 3
            quota.monthly_limit = 50

    order.status = "refunded"
    order.refund_reason = reason
    order.refunded_by = admin_id
    order.refunded_at = datetime.now(TZ_UTC8)

    await db.flush()
    await db.refresh(order)

    return {
        "order_no": order.order_no,
        "status": order.status,
        "refunded_at": order.refunded_at.isoformat() if order.refunded_at else None,
    }