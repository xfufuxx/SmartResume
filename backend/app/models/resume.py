import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func, Boolean, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=True)
    original_file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    parsed_json: Mapped[dict] = mapped_column(JSONB, nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    # ── 以下为「我的简历」列表页展示所需字段（UI 逆向补充） ──
    target_position: Mapped[str] = mapped_column(String(128), nullable=True, comment="目标职位（UI：卡片副标题）")
    target_company: Mapped[str] = mapped_column(String(128), nullable=True, comment="目标公司（UI：卡片副标题）")
    version: Mapped[int] = mapped_column(Integer, default=1, comment="当前版本号（UI：标题 v1/v2/v3）")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft", comment="状态 draft/optimized（UI：状态标签与筛选）")
    match_rate: Mapped[int] = mapped_column(Integer, nullable=True, comment="匹配度 0-100（UI：卡片匹配度）")
    score: Mapped[int] = mapped_column(Integer, nullable=True, comment="简历评分 0-100（UI：卡片彩色圆环）")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏（UI：卡片星标）")
    thumbnail_url: Mapped[str] = mapped_column(String(1024), nullable=True, comment="缩略图地址（UI：卡片预览图）")
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="最后修改时间（UI：卡片时间）")

    user: Mapped["User"] = relationship(back_populates="resumes")
    optimized_resumes: Mapped[list["OptimizedResume"]] = relationship(back_populates="resume", cascade="all, delete-orphan")