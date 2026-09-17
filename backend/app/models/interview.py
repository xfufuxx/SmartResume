import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InterviewSession(Base):
    """AI 面试预测会话：一次「简历 + 岗位」的押题结果。"""

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

    # pending / processing / completed / failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    overall_advice: Mapped[str | None] = mapped_column(Text, nullable=True, comment="面试总体建议")
    question_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewQuestion.order_index",
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
