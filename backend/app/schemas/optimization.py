from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MatchAnalysis(BaseModel):
    match_score: int
    strengths: list[str] = []
    gaps: list[str] = []
    rewrite_strategy: dict = {}


class OptimizeRequest(BaseModel):
    resume_id: Optional[str] = None
    job_image_id: Optional[str] = None
    custom_instructions: Optional[str] = None
    template: Optional[str] = None  # 模板方案: 不传则自动选择


class QuickOptimizeRequest(BaseModel):
    """「我的信息」一键优化：直接传入简历文本和岗位文本"""
    resume_text: str
    job_text: str
    custom_instructions: Optional[str] = None
    template: Optional[str] = "professional"  # professional | simple


class OptimizeResponse(BaseModel):
    id: str
    resume_id: Optional[str] = None
    job_image_id: Optional[str] = None
    match_analysis: Optional[MatchAnalysis] = None
    original_json: Optional[dict] = None
    optimized_json: Optional[dict] = None
    changes_description: Optional[str] = None
    custom_instructions: Optional[str] = None
    pdf_url: Optional[str] = None
    match_score: Optional[int] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    category: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_favorite: bool = False
    satisfaction_score: Optional[int] = None
    feedback_text: Optional[str] = None
    parent_record_id: Optional[str] = None
    refine_count: int = 0
    deleted_at: Optional[datetime] = None
    status: str
    created_at: Optional[datetime] = None


class SatisfactionFeedbackRequest(BaseModel):
    satisfaction_score: int
    feedback_text: Optional[str] = None


class DiffRequest(BaseModel):
    id1: str
    id2: str


class DiffResponse(BaseModel):
    record_a: OptimizeResponse
    record_b: OptimizeResponse
    diff_summary: str