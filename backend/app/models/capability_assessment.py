import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, Float, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobProfile(Base):
    """岗位画像库：岗位能力测评的「考纲」。

    每个岗位定义两套测评维度：
    - professional_dimensions：专业能力维度（6~8 项，岗位强相关）；
    - general_dimensions：通识能力维度（职业素养，各岗位大致通用）。

    维度结构（JSONB list[dict]）：
        {
            "name": "沟通表达能力",
            "desc": "该维度衡量什么 / 达标表现",
            "low_tip": "低分时的针对性点评要点",
            "high_tip": "高分时的保持/精进建议",
            "resources": [{"category": "理论", "items": ["..."]}],
            "actions": ["可执行的关键动作", ...],
        }

    系统内置岗位由种子数据播种（is_builtin=True），暂不开放用户自定义。
    """

    __tablename__ = "job_profiles"
    __table_args__ = (
        Index("ix_job_profile_category", "category"),
        Index("ix_job_profile_title", "title"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, comment="岗位名称")
    category: Mapped[str] = mapped_column(String(50), nullable=False, comment="岗位分类（测试/开发/运维/产品/质量/项目/数据/嵌入式）")
    summary: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="岗位一句话定位")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="岗位画像正文")
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, comment="关键词标签（搜索用）")
    professional_dimensions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, comment="专业能力维度定义")
    general_dimensions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, comment="通识能力维度定义")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true", comment="是否系统内置")

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class CapabilityAssessment(Base):
    """一次岗位能力测评记录（用户自评 1~5 分 + 系统生成的报告）。

    设计说明：
    - 分数完全由用户自评提交，系统只做聚合计算与报告生成，不代表任何官方认证；
    - report 为生成时快照（JSONB），历史记录不随后续种子内容修改而变；
    - 与简历评分（scoring）相互独立：那是机器对简历的评分，这是用户对岗位能力的自评。
    """

    __tablename__ = "capability_assessments"
    __table_args__ = (
        Index("ix_capability_assessment_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    job_profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("job_profiles.id"), nullable=False, index=True)

    # 自评分数：{维度名: 1~5}，专业与通识分开存储，报告聚合时使用
    professional_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    general_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    overall_match: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, comment="整体匹配度百分比")
    professional_avg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, comment="专业能力均分（1~5）")
    general_avg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, comment="通识能力均分（1~5）")
    report: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, comment="生成的完整报告快照")

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
