import uuid
import logging
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.config import settings
from app.models.user import User
from app.models.job_image import JobImage
from app.schemas.job import JobImageResponse
from app.services.job_parser import parse_job_from_bytes
from app.services.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload", response_model=JobImageResponse)
async def upload_job_image(
    file: UploadFile = File(...),
    use_ocr: bool = Query(False, description="Force OCR fallback"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ext = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")

    filename = file.filename or f"job.{ext}"

    key = f"job-images/{user.id}/{uuid.uuid4()}.{ext}"
    file_url = await storage.upload_bytes(content, key)

    try:
        result = await parse_job_from_bytes(content, filename, use_ocr_fallback=use_ocr)
    except ValueError as e:
        logger.error(f"岗位图片解析失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"岗位图片解析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"岗位解析服务异常: {type(e).__name__}")

    job_image = JobImage(
        user_id=user.id,
        image_url=file_url,
        parsed_job_json=result["parsed_job_json"],
        ocr_text=result.get("ocr_text"),
    )
    db.add(job_image)
    await db.flush()
    await db.refresh(job_image)
    await db.commit()

    return JobImageResponse(
        id=job_image.id,
        user_id=job_image.user_id,
        image_url=job_image.image_url,
        parsed_job_json=result["parsed_job_json"],
        created_at=job_image.created_at,
    )


@router.get("/", response_model=list[JobImageResponse])
async def list_job_images(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobImage).where(JobImage.user_id == user.id).order_by(JobImage.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobImageResponse)
async def get_job_image(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")
    return JobImageResponse(
        id=job.id,
        user_id=job.user_id,
        image_url=job.image_url,
        parsed_job_json=job.parsed_job_json,
        created_at=job.created_at,
    )


@router.delete("/{job_id}")
async def delete_job_image(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")

    if job.image_url:
        await storage.delete(job.image_url)
    await db.delete(job)
    await db.commit()
    return {"detail": "Deleted"}