from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BatchOptimizeRequest(BaseModel):
    source_resume_id: str
    job_ids: list[str]


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str
    total_jobs: int
    completed_jobs: int
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class BatchJobTaskResponse(BaseModel):
    id: str
    job_image_id: str
    status: str
    optimization_record_id: Optional[str] = None
    error_message: Optional[str] = None