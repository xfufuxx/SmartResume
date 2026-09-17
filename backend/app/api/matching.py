from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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


class RankRequest(BaseModel):
    resume_id: str
    limit: int | None = None


@router.post("/rank")
async def rank_jobs_for_resume(
    body: RankRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """一份简历 × 全部已解析岗位：批量算匹配度并按从高到低排序。

    纯规则引擎，不消耗 AI 额度，可以放心反复调用。
    """
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="该简历尚未解析完成")

    jobs = (
        await db.execute(
            select(JobImage)
            .where(JobImage.user_id == user.id, JobImage.deleted_at.is_(None))
            .order_by(JobImage.created_at.desc())
        )
    ).scalars().all()

    items: list[dict] = []
    skipped = 0
    for j in jobs:
        if not j.parsed_job_json:
            skipped += 1
            continue
        r = await calculate_match(resume.parsed_json, j.parsed_job_json)
        parsed = j.parsed_job_json or {}
        items.append({
            "job_id": j.id,
            "title": j.title or parsed.get("title") or "未命名岗位",
            "company": j.company or parsed.get("company") or "",
            "category": j.category or "其他",
            "match_rate": r["match_rate"],
            "missing_keywords": r["missing_keywords"],
            "is_favorite": bool(j.is_favorite),
        })

    items.sort(key=lambda x: x["match_rate"], reverse=True)
    if body.limit:
        items = items[: body.limit]

    scored = [i["match_rate"] for i in items]
    return {
        "resume_id": resume.id,
        "resume_title": resume.title or "简历",
        "total_jobs": len(jobs),
        "matched_jobs": len(items),
        "skipped_jobs": skipped,
        "best_rate": max(scored) if scored else 0,
        "avg_rate": round(sum(scored) / len(scored), 1) if scored else 0,
        "items": items,
    }
