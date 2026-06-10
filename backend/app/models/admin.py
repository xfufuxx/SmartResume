import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, Boolean, Text, Integer, DECIMAL, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="super_admin")
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    last_login_ip: Mapped[str] = mapped_column(String(45), nullable=True)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=True)
    target_id: Mapped[str] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    scene: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    gray_ratio: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ModelRouting(Base):
    __tablename__ = "model_routing"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    api_endpoint: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=True)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60)
    rate_limit_per_hour: Mapped[int] = mapped_column(Integer, default=1000)
    max_consecutive_failures: Mapped[int] = mapped_column(Integer, default=5)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    failover_to: Mapped[str] = mapped_column(String(36), ForeignKey("model_routing.id"), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tier: Mapped[str] = mapped_column(String(16), default="free")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIModelCallLog(Base):
    __tablename__ = "ai_model_call_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_template_name: Mapped[str] = mapped_column(String(64), nullable=True)
    prompt_version: Mapped[int] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    is_success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float] = mapped_column(DECIMAL(10, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IndustryKeyword(Base):
    __tablename__ = "industry_keywords"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    keyword: Mapped[str] = mapped_column(String(128), nullable=False)
    industry: Mapped[str] = mapped_column(String(32), nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="hard_skill")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ATSRule(Base):
    __tablename__ = "ats_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    package_type: Mapped[str] = mapped_column(String(32), nullable=False)
    package_name: Mapped[str] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    refund_reason: Mapped[str] = mapped_column(Text, nullable=True)
    refunded_by: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="medium")
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)
    attachments: Mapped[dict] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    assigned_to: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    resolution: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class TicketReply(Base):
    __tablename__ = "ticket_replies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("support_tickets.id"), nullable=False, index=True)
    admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("admins.id"), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class QuotaPackage(Base):
    __tablename__ = "quota_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    package_type: Mapped[str] = mapped_column(String(32), nullable=False)
    price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=True)
    quota_amount: Mapped[int] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())