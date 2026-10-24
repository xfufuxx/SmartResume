"""AI 对话润色 —— 会话与消息模型。

设计边界（与既有 refine 单轮微调的区别）：
- refine：一键指令式微调优化记录（/api/optimization/{id}/refine）；
- 本模块：多轮对话式润色，带会话历史，可针对「优化记录」或「自由文本」，
  AI 输出结构化建议（suggestion），由用户显式应用，不直接改库。

上下文快照：会话创建时冻结目标内容（context_snapshot），
避免会话中途原记录被编辑导致上下文漂移。
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PolishSession(Base):
    __tablename__ = "polish_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    # 目标类型：optimized=某条优化记录；text=自由文本
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    # target_type=optimized 时的记录 ID（text 模式为 NULL）
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # 会话创建时冻结的内容快照（JSON 字符串或纯文本），系统提示词的上下文来源
    context_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PolishMessage(Base):
    __tablename__ = "polish_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("polish_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user / assistant
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # assistant 消息的结构化建议（[{id, target, original, improved, reason}]）；无建议为 NULL
    suggestions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


Index("ix_polish_messages_session_created", PolishMessage.session_id, PolishMessage.created_at)
