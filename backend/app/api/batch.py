from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.batch import BatchOptimizeRequest, BatchStatusResponse
from app.services.batch_optimizer import start_batch, get_batch_status

router = APIRouter()


@router.post("/batch-optimize", response_model=BatchStatusResponse)
async def batch_optimize(
    body: BatchOptimizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if len(body.job_ids) < 1 or len(body.job_ids) > 5:
        raise HTTPException(status_code=400, detail="job_ids 数量必须在 1-5 之间")

    try:
        batch_id = await start_batch(
            db=db,
            user_id=user.id,
            source_resume_id=body.source_resume_id,
            job_image_ids=body.job_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return BatchStatusResponse(
        batch_id=batch_id,
        status="pending",
        total_jobs=len(body.job_ids),
        completed_jobs=0,
    )


@router.get("/batch/{batch_id}/status", response_model=BatchStatusResponse)
async def check_batch_status(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    status = await get_batch_status(batch_id, user.id, db)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])

    return BatchStatusResponse(
        batch_id=status["batch_id"],
        status=status["status"],
        total_jobs=status["total_jobs"],
        completed_jobs=status["completed_jobs"],
        created_at=status.get("created_at"),
        completed_at=status.get("completed_at"),
    )