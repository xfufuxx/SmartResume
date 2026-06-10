from pydantic import BaseModel
from typing import Optional


class ScoreDimension(BaseModel):
    completeness: int
    keyword_match: int
    quantification: int
    format_readability: int


class ResumeScoreResponse(BaseModel):
    total_score: int
    dimensions: ScoreDimension
    suggestions: list[str] = []


class TrendingJobResponse(BaseModel):
    rank: int
    job_title: str
    category: str
    count: int
    change_percent: Optional[float] = None