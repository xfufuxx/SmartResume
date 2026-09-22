import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Communication(Base):
    """面试追踪 - 沟通消息：用户与某家公司就某次投递的往来记录（电话 / 邮件 / 微信等）。

    设计说明（与全局通知中心 /messages 相互独立）：
    - 这里的每条记录绑定一次「投递 / 一家公司」，是求职过程性信息，
      与面试追踪栏目的「投递记录」「面试进度」并列展示。
    - application_id 可选：关联某条投递记录时，公司 / 职位会从该投递记录自动快照；
      关联的投递被撤回时，外键 ondelete="SET NULL" 仅解除关联、保留沟通内容（快照仍在）。
    """

    __tablename__ = "communications"
    __table_args__ = (
        Index("ix_communication_user_app", "user_id", "application_id"),
        Index("ix_communication_user_contact", "user_id", "contact_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # 公司 / 职位快照（关联投递时自动带出，未关联时由用户填写）
    company: Mapped[str] = mapped_column(String(200), nullable=False, comment="公司名称（快照）")
    position: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="职位（快照）")

    # 方向：out=我→公司，in=公司→我
    direction: Mapped[str] = mapped_column(String(10), nullable=False, comment="out(我→公司)/in(公司→我)")
    # 渠道：phone/email/wechat/other
    channel: Mapped[str] = mapped_column(String(20), nullable=False, comment="phone/email/wechat/other")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="沟通内容")

    contact_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="沟通发生时间（可选，默认现在）",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
