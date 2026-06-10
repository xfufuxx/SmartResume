from pydantic import BaseModel


class MatchRequest(BaseModel):
    resume_id: str
    job_id: str


class MatchResponse(BaseModel):
    match_rate: int
    missing_keywords: list[str] = []