"""面试追踪（手动录入）的请求/响应模型与可选项枚举。"""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# 面试进展状态（前端下拉、统计卡片共用同一套取值）
TRACK_STATUSES = ["scheduled", "awaiting", "passed", "offer", "rejected"]
# 面试轮次
INTERVIEW_STAGES = ["笔试", "一面", "二面", "三面", "群面", "HR 面", "终面", "其他"]
# 面试方式
INTERVIEW_MODES = ["现场", "线上", "电话"]


class InterviewTrackBase(BaseModel):
    company: str = Field(..., min_length=1, max_length=255, description="公司名称")
    position: str = Field(..., min_length=1, max_length=255, description="应聘职位")
    location: str | None = Field(None, max_length=100, description="工作地点")
    stage: str | None = Field(None, max_length=50, description="面试轮次")
    mode: str | None = Field(None, max_length=20, description="面试方式")
    interviewer: str | None = Field(None, max_length=100, description="面试官 / 联系人")
    interview_time: datetime | None = Field(None, description="面试时间")
    status: str = Field("scheduled", description="进展状态")
    result: str | None = Field(None, max_length=5000, description="面试复盘 / 结果备注")
    resume_id: str | None = Field(None, description="关联简历（可选）")
    job_image_id: str | None = Field(None, description="关联岗位（可选）")

    @field_validator("company", "position")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("不能为空")
        return v

    @field_validator("location", "stage", "mode", "interviewer", "result", "resume_id", "job_image_id")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        if v not in TRACK_STATUSES:
            raise ValueError(f"状态必须是 {'/'.join(TRACK_STATUSES)} 之一")
        return v

    @field_validator("stage")
    @classmethod
    def _check_stage(cls, v: str | None) -> str | None:
        if v is not None and v not in INTERVIEW_STAGES:
            raise ValueError(f"面试轮次必须是 {'/'.join(INTERVIEW_STAGES)} 之一")
        return v

    @field_validator("mode")
    @classmethod
    def _check_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in INTERVIEW_MODES:
            raise ValueError(f"面试方式必须是 {'/'.join(INTERVIEW_MODES)} 之一")
        return v


class InterviewTrackCreate(InterviewTrackBase):
    """新建一条面试记录（PUT 全量替换同样使用该结构）。"""


class InterviewTrackUpdate(InterviewTrackBase):
    """编辑面试记录：字段与新建一致，全量提交。"""


class InterviewTrackResponse(InterviewTrackBase):
    id: str
    user_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class InterviewTrackStats(BaseModel):
    """统计结果，全部由用户手动录入的记录实时汇总而来，无任何模拟数据。"""

    total: int = 0
    by_status: dict = {}
    by_stage: dict = {}
    offer_rate: float = 0.0
    pass_rate: float = 0.0
    upcoming_7d: int = 0
