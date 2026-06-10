import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.optimized_resume import OptimizedResume
from app.schemas.refine import RefineRequest, RefineResponse
from app.services.refine_handler import refine_optimization

router = APIRouter()
MAX_REFINE_COUNT = 3


@router.post("/optimization/{opt_id}/refine", response_model=RefineResponse)
async def refine_optimization_record(
    opt_id: str,
    body: RefineRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    opt_result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.id == opt_id,
            OptimizedResume.user_id == user.id,
        )
    )
    record = opt_result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="优化记录不存在")

    if not record.optimized_json:
        raise HTTPException(status_code=400, detail="该记录没有优化结果")

    if record.refine_count >= MAX_REFINE_COUNT:
        raise HTTPException(status_code=400, detail=f"每个优化记录最多允许 {MAX_REFINE_COUNT} 次微调")

    original_text = json.dumps(record.original_json or {}, ensure_ascii=False, indent=2)
    suggested_text = json.dumps(record.optimized_json, ensure_ascii=False, indent=2)

    refined = await refine_optimization(
        original_text=original_text,
        suggested_text=suggested_text,
        instruction=body.instruction,
    )

    try:
        refined_json = json.loads(refined)
    except json.JSONDecodeError:
        refined_json = record.optimized_json
        refined = sorted_text = refined
    else:
        sorted_text = json.dumps(refined_json, ensure_ascii=False, indent=2)

    refined_record = OptimizedResume(
        user_id=user.id,
        resume_id=record.resume_id,
        job_image_id=record.job_image_id,
        original_json=record.original_json,
        optimized_json=refined_json,
        match_score=record.match_score,
        job_title=record.job_title,
        company=record.company,
        category=record.category,
        thumbnail_url=record.thumbnail_url,
        parent_record_id=record.id,
        refine_count=0,
        status="completed",
    )
    db.add(refined_record)

    record.refine_count += 1

    await db.flush()
    await db.refresh(refined_record)
    await db.commit()

    return RefineResponse(
        id=refined_record.id,
        original_text=original_text,
        suggested_text=suggested_text,
        refined_text=refined,
        refine_count=record.refine_count,
    )