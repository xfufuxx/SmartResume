"""投递事件流水：记录一次投递在外部通道（邮件）上的每一次状态变迁。

设计要点：
- 隶属于某条投递申请（applications.id，外键级联删除——撤回投递时事件一并清除）。
- event_type 取值：queued(已入队) / sent(已发送) / failed(发送失败) / bounced(退信) / replied(对方回复)。
- detail 存放人类可读的补充信息（如失败原因、服务商返回），不含简历 PII 原文。
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# 事件类型单一数据源（API 校验与前端展示共用）
DELIVERY_EVENT_TYPES = [
    "queued", "sent", "failed", "bounced", "replied",
    "form_prefilled", "form_submitted", "form_failed",
    "guide_opened", "guide_submitted", "guide_failed",
]
DELIVERY_EVENT_LABELS = {
    "queued": "已加入发送队列",
    "sent": "已投递到对方邮箱",
    "failed": "发送失败",
    "bounced": "被退信",
    "replied": "对方已回复",
    # 阶段3：官网表单半自动投递
    "form_prefilled": "官网表单已预填（待人工确认提交）",
    "form_submitted": "已在官网确认提交",
    "form_failed": "官网提交未完成",
    # 阶段4：平台引导投递
    "guide_opened": "已打开平台岗位页",
    "guide_submitted": "已在平台完成投递（用户回填）",
    "guide_failed": "平台投递未完成（用户回填）",
}


class DeliveryEvent(Base):
    __tablename__ = "delivery_events"
    __table_args__ = (
        Index("ix_delivery_events_app_time", "application_id", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False, comment="queued/sent/failed/bounced/replied")
    detail: Mapped[str | None] = mapped_column(Text, nullable=True, comment="补充信息（失败原因等）")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
