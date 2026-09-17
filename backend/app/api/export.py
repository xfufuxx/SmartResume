"""文档导出：将结构化简历 JSON 导出为 Word（.docx）。

非 AI 功能：仅做 JSON → docx 的格式渲染，便于用户在 Word 中二次编辑。
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.core.errors import app_err
from app.models.user import User
from app.models.resume import Resume
from app.models.optimized_resume import OptimizedResume
from app.services.docx_export import build_docx_from_resume_json

router = APIRouter(prefix="/api/export", tags=["Export"])

_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/optimize/{opt_id}/docx")
async def export_optimized_docx(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise app_err("OPTIMIZATION_NOT_FOUND")

    data = rec.optimized_json or rec.original_json or {}
    docx_bytes = build_docx_from_resume_json(data)
    return Response(
        content=docx_bytes,
        media_type=_DOCX_TYPE,
        headers={"Content-Disposition": f'attachment; filename="resume_{opt_id}.docx"'},
    )


@router.get("/resume/{resume_id}/docx")
async def export_resume_docx(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id, Resume.user_id == user.id, Resume.deleted_at.is_(None)
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise app_err("RESUME_NOT_FOUND")

    data = rec.parsed_json or {}
    docx_bytes = build_docx_from_resume_json(data)
    return Response(
        content=docx_bytes,
        media_type=_DOCX_TYPE,
        headers={"Content-Disposition": f'attachment; filename="resume_{resume_id}.docx"'},
    )
