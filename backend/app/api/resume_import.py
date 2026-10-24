"""简历解析导入 API —— 上传文件 → 预览结构化结果 → 确认导入。

与 POST /api/resumes/upload 的边界：
- upload：上传即落库（简历档案，含原件存储），面向「存档管理」；
- 本模块 parse：只解析不落库（预览），apply：按确认结果落库，
  面向「把旧简历灌进优化流程」，导入后立即可用于一键优化。

数据流：
  POST /api/resume-import/parse  (multipart) → { parsed_json, raw_text, summary }
  用户确认 →
  POST /api/resume-import/apply  (json)      → { resume_id } + 写入 saved_texts
"""
import logging

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.core.crypto import encrypt_field
from app.core.deps import get_current_user
from app.core.errors import app_err
from app.core.file_security import validate_file_magic, validate_pdf_pages
from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume_import import (
    ResumeImportApplyRequest,
    ResumeImportApplyResponse,
    ResumeImportParseResponse,
)
from app.services.resume_import import summarize_parsed, validate_import_file
from app.services.resume_parser import parse_resume_from_bytes
from app.services.text_formatter import format_resume_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume-import", tags=["Resume Import"])

MAX_RESUMES = 10  # 与 resumes.py 保持一致（简历档案总数上限）


@router.post("/parse", response_model=ResumeImportParseResponse)
async def parse_resume_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """解析上传的简历文件，返回结构化预览（不落库、不建档案）。"""
    content = await file.read()
    filename = file.filename or ""
    ext = filename.split(".")[-1].lower() if filename else "unknown"

    invalid = validate_import_file(filename, content)
    if invalid:
        logger.info("简历导入预检拒绝: %s", invalid)
        raise app_err("FILE_TYPE_INVALID")
    # 真实文件类型校验（防改扩展名上传恶意文件）
    validate_file_magic(content, ext)
    if ext == "pdf":
        validate_pdf_pages(content)

    try:
        result = await parse_resume_from_bytes(content, filename)
    except ValueError as e:
        logger.error("简历导入解析失败: %s", e)
        raise app_err("RESUME_PARSE_FAILED")
    except Exception as e:  # noqa: BLE001
        logger.error("简历导入解析异常: %s", e, exc_info=True)
        raise app_err("RESUME_PARSE_FAILED")

    parsed = result.get("parsed_json") or {}
    summary = summarize_parsed(parsed)
    return ResumeImportParseResponse(
        file_type=ext,
        parsed_json=parsed,
        raw_text=result.get("raw_text") or "",
        sections=summary["sections"],
        warnings=summary["warnings"],
    )


@router.post("/apply", response_model=ResumeImportApplyResponse)
async def apply_resume_import(
    body: ResumeImportApplyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """确认导入：把解析结果落成简历档案，并写入一键优化可用的简历文本。"""
    count_result = await db.execute(
        select(func.count(Resume.id)).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
        )
    )
    if (count_result.scalar() or 0) >= MAX_RESUMES:
        raise app_err("RESUME_LIMIT_REACHED")

    parsed = body.parsed_json or {}
    raw_text = body.raw_text or ""

    resume = Resume(
        user_id=user.id,
        title=(body.title or "").strip() or "导入的简历",
        # 导入链路不存储原件（parse 阶段未落盘）；原件存档请用 /api/resumes/upload
        original_file_url=None,
        file_type=body.file_type,
        parsed_json=parsed,
        raw_text=raw_text,
    )
    # PII 加密存储（raw_text 含姓名/电话/邮箱，PIPL 第 51 条）
    if resume.raw_text:
        try:
            resume.raw_text = encrypt_field(resume.raw_text)
        except Exception:  # noqa: BLE001
            logger.warning("导入 raw_text 加密失败，将以明文存储")

    resume_text = format_resume_text(parsed)
    if resume_text:
        merged = {**(user.saved_texts or {}), "resume_text": resume_text}
        user.saved_texts = merged

    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    return ResumeImportApplyResponse(
        resume_id=resume.id,
        title=resume.title or "导入的简历",
        message="导入成功，已可用于一键优化",
    )
