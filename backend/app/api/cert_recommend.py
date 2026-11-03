"""证书与学习方向推荐 API：基于简历 + 目标岗位 JD 的差距分析 → 证书/课程推荐。"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import RateLimiter, get_current_user, get_db
from app.core.errors import app_err
from app.models.job_image import JobImage
from app.models.resume import Resume
from app.models.user import User
from app.services.cert_recommend import recommend_certs

router = APIRouter(prefix="/api/certs", tags=["Cert Recommend"])

_certs_limiter = RateLimiter(max_requests=3, window_seconds=60)


class CertRecommendRequest(BaseModel):
    resume_id: str
    job_id: str
    existing_certifications: str | None = Field(default=None, max_length=2000)
    time_budget: str | None = Field(default=None, max_length=100)
    budget: str | None = Field(default=None, max_length=100)


@router.post("/recommend")
async def create_cert_recommendation(
    body: CertRecommendRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rl: None = Depends(_certs_limiter),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")
    if not resume.parsed_json:
        raise app_err("PARSE_BEFORE_OPTIMIZE")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise app_err("JOB_NOT_FOUND")
    if not job.parsed_job_json:
        raise app_err("PARSE_BEFORE_OPTIMIZE")

    return await recommend_certs(
        resume.parsed_json,
        job.parsed_job_json,
        existing_certifications=body.existing_certifications,
        time_budget=body.time_budget,
        budget=body.budget,
    )
