"""岗位能力测评的请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# 自评分数取值（1~5 星）
SCORE_MIN = 1
SCORE_MAX = 5


class AssessmentSubmit(BaseModel):
    """提交一次岗位能力测评（用户自评 1~5 分）。"""

    job_profile_id: str = Field(..., min_length=1, description="岗位画像 ID")
    professional_scores: dict[str, int] = Field(..., description="专业能力自评：{维度名: 1~5}")
    general_scores: dict[str, int] = Field(..., description="通识能力自评：{维度名: 1~5}")

    @field_validator("professional_scores", "general_scores")
    @classmethod
    def _check_scores(cls, v: dict[str, int]) -> dict[str, int]:
        if not v:
            raise ValueError("至少需要一个维度评分")
        for name, score in v.items():
            if not name or not name.strip():
                raise ValueError("维度名不能为空")
            if not isinstance(score, int) or not (SCORE_MIN <= score <= SCORE_MAX):
                raise ValueError(f"维度「{name}」的评分必须是 {SCORE_MIN}~{SCORE_MAX} 的整数")
        return {k.strip(): score for k, score in v.items()}


class JobProfileResponse(BaseModel):
    id: str
    title: str
    category: str
    summary: str | None = None
    description: str | None = None
    tags: list = []
    professional_dimensions: list = []
    general_dimensions: list = []
    is_builtin: bool = True
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AssessmentResponse(BaseModel):
    id: str
    user_id: str
    job_profile_id: str
    job_title: str = ""
    category: str = ""
    professional_scores: dict = {}
    general_scores: dict = {}
    overall_match: float = 0.0
    professional_avg: float = 0.0
    general_avg: float = 0.0
    report: dict = {}
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RankingItem(BaseModel):
    """岗位匹配排行项：当前用户某岗位的最近一次测评结果。"""

    job_profile_id: str
    job_title: str
    category: str
    overall_match: float
    professional_avg: float
    general_avg: float
    weak_dimension_count: int = 0
    assessment_count: int = 1
    previous_match: float | None = None
    trend: str = "flat"  # up / down / flat
    latest_assessment_id: str = ""
    assessed_at: datetime | None = None
