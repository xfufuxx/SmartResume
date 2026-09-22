from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MustHave(BaseModel):
    skills: list[str] = []
    experience: Optional[str] = None
    education: Optional[str] = None


class NiceToHave(BaseModel):
    skills: list[str] = []
    qualifications: list[str] = []


class JobParseResult(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    salary_range: Optional[str] = None
    location: Optional[str] = None
    must_have: MustHave = MustHave()
    nice_to_have: NiceToHave = NiceToHave()
    responsibilities: list[str] = []
    soft_skills: list[str] = []
    industry: Optional[str] = None
    original_text: str = ""


class JobImageResponse(BaseModel):
    id: str
    user_id: str
    image_url: str
    parsed_job_json: Optional[dict] = None
    title: Optional[str] = None
    company: Optional[str] = None
    category: Optional[str] = None
    is_primary: bool = False
    is_favorite: bool = False
    user_remark: Optional[str] = None
    status: str = "投递中"
    deleted_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobUpdateRequest(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    user_remark: Optional[str] = None


class JobCreateRequest(BaseModel):
    """手动创建职位（无需图片）：前端填写字段直接入库"""
    title: str
    company: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    user_remark: Optional[str] = None
    image_url: Optional[str] = None
    parsed_job_json: Optional[dict] = None


class JobBatchCreateRequest(BaseModel):
    """批量创建职位（用于导入职位确认后落库）"""
    jobs: list[JobCreateRequest]


class JobBatchActionRequest(BaseModel):
    ids: list[str]