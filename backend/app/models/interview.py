import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InterviewSession(Base):
    """面试会话：quick=旧版一次性押题，chat=模拟押题对话（逐题问答）。"""

    __tablename__ = "interview_sessions"
    __table_args__ = (
        Index("ix_interview_session_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    resume_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("resumes.id"), nullable=True)
    job_image_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_images.id"), nullable=True)

    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 会话标题（模拟押题可自定义；旧会话为空，前端回退到岗位名/通用押题）
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # quick / chat
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="quick", server_default="quick")
    # chat 生命周期：briefing（已开场/未出题）/ asking（出题中，等待作答）/ finished（已复盘）
    # quick 会话为 NULL（前端按 status 兼容旧展示）
    stage: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # pending / processing / completed / failed
    # 注意：chat 会话不跑后台任务，status 恒为 completed，生命周期一律看 stage，
    # 因此不会产生 pending，也无需接入 task_recovery 的超时兜底。
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    overall_advice: Mapped[str | None] = mapped_column(Text, nullable=True, comment="面试总体建议")
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    # 目标题数（chat 会话的软上限；quick 会话为 0）
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # 对话轮次（乐观锁：同一会话并发发送时按 turn_index 比对，防消息交错）
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    summary_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="模拟押题复盘（覆盖度/强项/短板/行动建议）")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewQuestion.order_index",
    )
    messages: Mapped[list["InterviewMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewMessage.order_index",
    )


class InterviewQuestion(Base):
    """面试预测题目：含考察点、答题要点、参考答案，以及用户自己的笔记。"""

    __tablename__ = "interview_questions"
    __table_args__ = (
        Index("ix_interview_question_session", "session_id", "order_index"),
        Index("ix_interview_question_bookmark", "session_id", "is_bookmarked"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("interview_sessions.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    order_index: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="题目分类：技术能力/项目深挖/行为面试/职业规划/岗位匹配")
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="难度：简单/中等/困难")
    question: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str | None] = mapped_column(Text, nullable=True, comment="面试官考察点")
    answer_outline: Mapped[list] = mapped_column(JSONB, nullable=True, comment="答题要点（数组）")
    sample_answer: Mapped[str | None] = mapped_column(Text, nullable=True, comment="参考答案")

    is_bookmarked: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="用户自己的回答草稿")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")


class InterviewMessage(Base):
    """模拟押题的对话消息。

    设计取舍：题目资产（收藏/笔记/题库）仍落在 interview_questions，
    消息表只承载对话流水（开场/提问/作答/点评/复盘）与结构化 payload，
    避免同一份作答在两处双写、导致状态不一致。
    """

    __tablename__ = "interview_messages"
    __table_args__ = (
        Index("ix_interview_message_session_order", "session_id", "order_index"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    role: Mapped[str] = mapped_column(String(20), nullable=False, comment="user / assistant")
    # briefing（开场/总策略）/ question（提问）/ answer（用户作答）/ feedback（点评）/
    # hint（提示）/ summary（复盘）/ note（旧版草稿回放）
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="text", server_default="text")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="结构化块：question/feedback/summary")
    question_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="关联的题目资产 ID")

    # 会话内严格递增序号（不依赖 created_at，避免同事务插入时间戳相同导致顺序不稳）
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["InterviewSession"] = relationship(back_populates="messages")
