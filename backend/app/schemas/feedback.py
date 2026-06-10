from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


OUTCOME_OPTIONS = ["no_reply", "interview", "fail_round1", "fail_round2", "offer"]


class FeedbackCreate(BaseModel):
    optimization_record_id: str
    outcome: str = Field(..., description="one of: no_reply, interview, fail_round1, fail_round2, offer")


class FeedbackResponse(BaseModel):
    id: str
    user_id: str
    optimization_record_id: str
    outcome: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackStatsResponse(BaseModel):
    total_applications: int = 0
    interview_rate: float = 0.0
    offer_rate: float = 0.0
    outcome_breakdown: dict = {}
    version_comparison: list[dict] = []