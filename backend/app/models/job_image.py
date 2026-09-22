import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class JobImage(Base):
    __tablename__ = "job_images"
    __table_args__ = (
        Index("ix_job_images_user_deleted", "user_id", "deleted_at"),
        Index("ix_job_images_user_category", "user_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    image_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    parsed_job_json: Mapped[dict] = mapped_column(JSONB, nullable=True)
    ocr_text: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # ── 岗位库管理字段 ──
    title: Mapped[str] = mapped_column(String(200), nullable=True, comment="岗位标题")
    company: Mapped[str] = mapped_column(String(200), nullable=True, comment="公司名称")
    category: Mapped[str] = mapped_column(String(50), nullable=True, comment="分类: 产品/开发/运营/设计/市场/销售/其他")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否为默认岗位")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏")
    user_remark: Mapped[str] = mapped_column(Text, nullable=True, comment="用户备注")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="投递中", server_default="投递中",
        comment="投递状态: 投递中/面试中/已录用/已拒绝",
    )
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, comment="软删除时间")

    user: Mapped["User"] = relationship(back_populates="job_images")
    optimized_resumes: Mapped[list["OptimizedResume"]] = relationship(back_populates="job_image", cascade="all, delete-orphan")
