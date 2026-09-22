"""邮件模板（阶段2）：投递附言/正文的用户自定义模板。

设计：
- 每用户独立（user_id 外键），互不可见；
- 首次使用时由 API 惰性播种两条内置默认模板（正式版/简洁版），用户可改可删；
- 模板 body 支持占位符：{job_title} {company} {applicant_name}，应用时由前端/后端替换；
- is_default 仅是「用户默认选中」标记（每个用户至多一条 True，保存新默认时取消旧默认）。
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="模板名称")
    body: Mapped[str] = mapped_column(Text, nullable=False, comment="模板正文（支持 {job_title}/{company}/{applicant_name} 占位符）")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="是否为该用户默认模板")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
