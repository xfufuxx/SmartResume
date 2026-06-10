from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.schemas.matching import MatchRequest, MatchResponse
from app.services.match_calculator import calculate_match

router = APIRouter()


@router.post("/", response_model=MatchResponse)
async def match_resume_with_job(
    body: MatchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="Resume has not been parsed yet")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")
    if not job.parsed_job_json:
        raise HTTPException(status_code=400, detail="Job has not been parsed yet")

    result = await calculate_match(resume.parsed_json, job.parsed_job_json)

    return MatchResponse(
        match_rate=result["match_rate"],
        missing_keywords=result["missing_keywords"],
    )