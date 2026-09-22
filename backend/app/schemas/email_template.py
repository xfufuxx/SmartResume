"""邮件模板 schemas（阶段2）。"""
from datetime import datetime

from pydantic import BaseModel, Field


class EmailTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="模板名称")
    body: str = Field(..., min_length=1, max_length=10000, description="模板正文（支持 {job_title}/{company}/{applicant_name} 占位符）")
    is_default: bool = Field(False, description="设为我的默认模板")


class EmailTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    body: str | None = Field(None, min_length=1, max_length=10000)
    is_default: bool | None = None


class EmailTemplateResponse(BaseModel):
    id: str
    name: str
    body: str
    is_default: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
