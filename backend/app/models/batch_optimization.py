import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BatchOptimization(Base):
    __tablename__ = "batch_optimizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    source_resume_id: Mapped[str] = mapped_column(String(36), ForeignKey("resumes.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    total_jobs: Mapped[int] = mapped_column(Integer, default=0)
    completed_jobs: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)



class BatchJobTask(Base):
    __tablename__ = "batch_job_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batch_optimizations.id"), nullable=False, index=True)
    job_image_id: Mapped[str] = mapped_column(String(36), ForeignKey("job_images.id"), nullable=False)
    optimization_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("optimized_resumes.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())