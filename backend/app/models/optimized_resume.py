import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func, Index, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class OptimizedResume(Base):
    __tablename__ = "optimized_resumes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    resume_id: Mapped[str] = mapped_column(String(36), ForeignKey("resumes.id"), nullable=False)
    job_image_id: Mapped[str] = mapped_column(String(36), ForeignKey("job_images.id"), nullable=False)
    original_json: Mapped[dict] = mapped_column(JSONB, nullable=True)
    optimized_json: Mapped[dict] = mapped_column(JSONB, nullable=True)
    match_score: Mapped[int] = mapped_column(Integer, nullable=True)
    pdf_url: Mapped[str] = mapped_column(String(1024), nullable=True)
    changes_description: Mapped[str] = mapped_column(Text, nullable=True)
    custom_instructions: Mapped[str] = mapped_column(Text, nullable=True)
    job_title: Mapped[str] = mapped_column(String(255), nullable=True)
    company: Mapped[str] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=True)
    thumbnail_url: Mapped[str] = mapped_column(String(1024), nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    satisfaction_score: Mapped[int] = mapped_column(Integer, nullable=True)
    feedback_text: Mapped[str] = mapped_column(Text, nullable=True)
    parent_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("optimized_resumes.id"), nullable=True)
    refine_count: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed", server_default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="optimized_resumes")
    resume: Mapped["Resume"] = relationship(back_populates="optimized_resumes")
    job_image: Mapped["JobImage"] = relationship(back_populates="optimized_resumes")
    refined_versions: Mapped[list["OptimizedResume"]] = relationship(
        "OptimizedResume", remote_side=[id], back_populates="parent_record", lazy="selectin"
    )
    parent_record: Mapped["OptimizedResume"] = relationship(
        "OptimizedResume", remote_side=[parent_record_id], back_populates="refined_versions"
    )

    __table_args__ = (
        Index("ix_optimized_user_resume", "user_id", "resume_id"),
        Index("ix_optimized_user_job", "user_id", "job_image_id"),
        Index("ix_optimized_deleted", "user_id", "deleted_at"),
        Index("ix_optimized_category", "user_id", "category"),
    )