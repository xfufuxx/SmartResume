import uuid
from datetime import date, datetime

from sqlalchemy import String, Text, Date, DateTime, ForeignKey, func, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Application(Base):
    """岗位投递申请：用户针对某个岗位（job_images）发起的一次投递。

    核心约束：
    - 防重复投递：同一用户对同一岗位最多只有一条申请
      （user_id + job_image_id 唯一约束，后端创建前再二次拦截返回 409）。
    - 岗位被永久删除时，其投递申请通过外键级联一并清除（ondelete="CASCADE"）。
    - 投递所用简历被删除时仅解除关联（ondelete="SET NULL"），保留申请记录。
    """

    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_image_id", name="uq_application_user_job"),
        Index("ix_application_user_status", "user_id", "status"),
        Index("ix_application_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    job_image_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_images.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    resume_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True,
    )

    # ── 投递表单（申请人联系方式为必填项）──
    applicant_name: Mapped[str] = mapped_column(String(100), nullable=False, comment="申请人姓名")
    email: Mapped[str] = mapped_column(String(255), nullable=False, comment="联系邮箱")
    phone: Mapped[str] = mapped_column(String(32), nullable=False, comment="联系电话")

    # ── 可选附加信息 ──
    expected_salary: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="期望薪资")
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True, comment="可到岗时间")
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True, comment="求职信 / 备注")

    # 投递状态：submitted(已投递)/viewed(已查看)/interview(面试中)/offer(已录用)/rejected(未通过)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="submitted", server_default="submitted", comment="投递状态",
    )

    # ── 真实触达（阶段1：邮件直投；阶段3：官网表单半自动投递）──
    # channel=None 表示历史记录（仅站内登记）；email=真实邮件投递；
    # manual=引导用户去官方渠道手动投递的记录；form=官网表单半自动投递（预填+用户确认提交）
    channel: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="投递通道: email/manual/form",
    )
    apply_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="官网投递入口 URL（form 通道使用）",
    )
    recipient_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="投递接收方（HR）邮箱",
    )
    delivery_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="外部投递状态: pending/sent/failed/bounced/not_applicable（与 status 站内流程状态相互独立）",
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="邮件实际发送时间")
    provider_message_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="邮件服务商/SMTP 侧消息标识（排障与回执对账用）",
    )
    consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="用户对本次对外投递的明示授权时间（PIPL 单独同意快照）",
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
