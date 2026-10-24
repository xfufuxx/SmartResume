"""简历解析导入 schemas。"""
from pydantic import BaseModel


class ResumeSectionCount(BaseModel):
    key: str
    label: str
    count: int


class ResumeImportParseResponse(BaseModel):
    """parse 端点返回：结构化预览 + 原文 + 摘要（不落库）。"""

    file_type: str
    parsed_json: dict
    raw_text: str
    sections: list[ResumeSectionCount]
    warnings: list[str]


class ResumeImportApplyRequest(BaseModel):
    """apply 端点入参：用户确认后的解析结果。"""

    parsed_json: dict
    raw_text: str | None = None
    file_type: str | None = None
    title: str | None = None


class ResumeImportApplyResponse(BaseModel):
    resume_id: str
    title: str
    message: str
