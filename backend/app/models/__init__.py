from app.models.user import User, UserDevice, Message, AuditLog, ResumeTemplate, UserQuota
from app.models.admin import (
    Admin, AdminLog, PromptTemplate, ModelRouting, AIModelCallLog,
    IndustryKeyword, ATSRule, Order, SupportTicket, TicketReply, QuotaPackage,
)
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume
from app.models.verification_code import VerificationCode
# LEGACY：feedbacks 表为历史「投递反馈」数据，路由已下线（项目不具备投递能力）。
# 保留模型注册以免误删已有数据，但不再有任何写入入口，新功能一律不要依赖它。
from app.models.feedback import Feedback
from app.models.batch_optimization import BatchOptimization, BatchJobTask
from app.models.interview import InterviewSession, InterviewQuestion
from app.models.interview_track import InterviewTrack
from app.models.application import Application
from app.models.communication import Communication
from app.models.delivery_event import DeliveryEvent
from app.models.email_suppression import EmailSuppression
from app.models.email_template import EmailTemplate

__all__ = [
    "User", "UserDevice", "Message", "AuditLog", "ResumeTemplate", "UserQuota",
    "Admin", "AdminLog", "PromptTemplate", "ModelRouting", "AIModelCallLog",
    "IndustryKeyword", "ATSRule", "Order", "SupportTicket", "TicketReply", "QuotaPackage",
    "Resume", "JobImage", "OptimizedResume", "VerificationCode", "Feedback",
    "BatchOptimization", "BatchJobTask",
    "InterviewSession", "InterviewQuestion", "InterviewTrack",
    "Application", "Communication", "DeliveryEvent",
    "EmailSuppression", "EmailTemplate",
]
