from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ResumeParseResult(BaseModel):
    personal_info: dict = {}
    summary: str = ""
    experience: list[dict] = []
    education: list[dict] = []
    skills: list[str] = []
    projects: list[dict] = []


class ResumeResponse(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None
    original_file_url: str
    file_type: str
    parsed_json: Optional[dict] = None
    raw_text: Optional[str] = None
    is_primary: bool = False
    deleted_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ResumeUploadResponse(BaseModel):
    id: str
    parsed_json: Optional[dict] = None
    original_file_url: str = ""
    file_type: str = ""
    message: str


class ResumeCreateRequest(BaseModel):
    title: Optional[str] = None
    source_resume_id: Optional[str] = None


class ResumeUpdateRequest(BaseModel):
    title: Optional[str] = None


class ResumeBatchDeleteRequest(BaseModel):
    ids: list[str]