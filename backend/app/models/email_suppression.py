"""邮件发送抑制名单（suppression list）。

用途（阶段2 反骚扰闭环）：
- 退信（bounce）地址自动进入名单，后续投递直接拒绝，尊重对方服务器信号；
- 用户可手动添加/移除（PIPL 用户控制权），也可查询名单内容。

约束：名单按 (user_id, email) 唯一——同一用户对同一地址只记一条；
不同用户互不影响（张三被某 HR 拒收不影响李四投递）。
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmailSuppression(Base):
    __tablename__ = "email_suppressions"
    __table_args__ = (
        UniqueConstraint("user_id", "email", name="uq_suppression_user_email"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # bounce=退信自动加入 / manual=用户手动加入
    reason: Mapped[str] = mapped_column(String(20), nullable=False, default="bounce")
    detail: Mapped[str | None] = mapped_column(Text, nullable=True, comment="加入原因补充（退信摘要等）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    REASONS = ("bounce", "manual")
    REASON_LABELS = {"bounce": "退信自动加入", "manual": "手动加入"}
