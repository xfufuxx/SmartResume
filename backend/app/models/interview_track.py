import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InterviewTrack(Base):
    """面试追踪记录：完全由用户手动添加/维护的面试进展。

    设计说明：面试追踪与岗位投递（applications 表）是两套相互独立的数据。
    本表所有字段都由用户在「面试追踪」页面手动录入，系统只负责存储、统计与提醒
    （临近面试）；请勿在此表上做任何「投递 → 面试」的自动推导。
    投递申请请走 /api/applications（含防重复投递等约束）。
    """

    __tablename__ = "interview_tracks"
    __table_args__ = (
        Index("ix_interview_track_user_time", "user_id", "interview_time"),
        Index("ix_interview_track_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    # ── 用户手动填写的基本信息 ──
    company: Mapped[str] = mapped_column(String(255), nullable=False, comment="公司名称（必填）")
    position: Mapped[str] = mapped_column(String(255), nullable=False, comment="应聘职位（必填）")
    location: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="工作地点")
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="面试轮次：笔试/一面/二面/三面/群面/HR 面/终面/其他")
    mode: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="面试方式：现场/线上/电话")
    interviewer: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="面试官 / 联系人")
    interview_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="面试时间")

    # scheduled(待面试) / awaiting(待结果) / passed(已通过) / offer(已获 Offer) / rejected(未通过)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="scheduled", server_default="scheduled", comment="面试进展状态"
    )
    result: Mapped[str | None] = mapped_column(Text, nullable=True, comment="面试复盘 / 结果备注")

    # ── 可选关联项目内既有资产（不强制，纯手动录入时可为空）──
    resume_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("resumes.id"), nullable=True)
    job_image_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("job_images.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
