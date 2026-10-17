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
    target_position: Optional[str] = None
    target_company: Optional[str] = None
    version: int = 1
    status: str = "draft"
    match_rate: Optional[int] = None
    score: Optional[int] = None
    is_favorite: bool = False
    thumbnail_url: Optional[str] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

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


class ResumeStats(BaseModel):
    """「我的简历」概览统计（右侧环形图数据）"""
    total: int = 0
    optimized: int = 0
    draft: int = 0
    unoptimized: int = 0
    favorite: int = 0


class FavoriteRequest(BaseModel):
    favorite: bool = True


# ── 简历版本树（P0：原始版 → 各岗位优化版 → 人工/AI 微调链）──

class VersionNode(BaseModel):
    """版本树节点。kind 决定语义：
    - original：原始简历（根节点）
    - optimized：针对某岗位的 AI 优化版（一级子节点）
    - refined：对优化版的逐条修改/微调（可多级链）
    """
    id: str
    kind: str
    title: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    match_score: Optional[int] = None
    status: Optional[str] = None
    refine_count: Optional[int] = None
    parent_record_id: Optional[str] = None
    created_at: Optional[datetime] = None
    children: list["VersionNode"] = []


class ResumeVersionTree(BaseModel):
    """以某条原始简历为根的完整版本树。"""
    root: VersionNode
    optimized_count: int = 0
    refined_count: int = 0