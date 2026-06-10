from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.schemas.scoring import ResumeScoreResponse, ScoreDimension, TrendingJobResponse
from app.services.scoring_engine import calculate_score

router = APIRouter()


@router.get("/resume/{resume_id}/score", response_model=ResumeScoreResponse)
async def get_resume_score(
    resume_id: str,
    job_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.parsed_json:
        raise HTTPException(status_code=400, detail="Resume has not been parsed yet")

    job_parsed = None
    if job_id:
        job_result = await db.execute(
            select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user.id)
        )
        job = job_result.scalar_one_or_none()
        if job and job.parsed_job_json:
            job_parsed = job.parsed_job_json

    score_data = await calculate_score(resume.parsed_json, job_parsed)
    return ResumeScoreResponse(
        total_score=score_data["total_score"],
        dimensions=ScoreDimension(**score_data["dimensions"]),
        suggestions=score_data["suggestions"],
    )


JOB_CATEGORY_MAP = {
    "前端": ["前端", "前端开发", "web前端", "h5"],
    "后端": ["后端", "java", "python开发", "go开发", "node", "c++开发", "golang"],
    "算法/AI": ["算法", "ai", "机器学习", "深度学习", "nlp", "cv", "大模型", "llm", "人工智能", "数据挖掘"],
    "产品": ["产品经理", "产品", "pm", "product"],
    "运营": ["运营", "新媒体", "内容运营", "用户运营"],
    "设计": ["ui", "ux", "设计", "视觉", "交互"],
    "数据": ["数据分析", "数据工程", "数据仓库", "bi", "etl"],
    "测试": ["测试", "qa", "质量", "测开"],
    "DevOps": ["devops", "运维", "sre", "云原生"],
    "移动端": ["android", "ios", "android开发", "ios开发", "移动端", "flutter", "react native"],
    "全栈": ["全栈", "fullstack", "full stack"],
    "市场/销售": ["市场", "销售", "bd", "商务"],
    "人事/行政": ["hr", "人事", "行政", "招聘"],
}


def _normalize_job_title(title: str) -> str:
    t = title.lower().strip()
    for category, keywords in JOB_CATEGORY_MAP.items():
        for kw in keywords:
            if kw in t:
                return category
    return "其他"


@router.get("/jobs/trending", response_model=list[TrendingJobResponse])
async def get_trending_jobs(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    岗位热度分析 — 基于所有用户匿名汇总的岗位名称
    统计最近N天内上传的岗位类别分布
    """
    from datetime import datetime, timedelta, timezone
    TZ_UTC8 = timezone(timedelta(hours=8))

    cutoff = datetime.now(TZ_UTC8) - timedelta(days=days)
    cutoff_prev = datetime.now(TZ_UTC8) - timedelta(days=days * 2)

    current_result = await db.execute(
        select(JobImage.parsed_job_json)
        .where(JobImage.created_at >= cutoff)
    )
    current_jobs = current_result.scalars().all()

    prev_result = await db.execute(
        select(JobImage.parsed_job_json)
        .where(
            JobImage.created_at >= cutoff_prev,
            JobImage.created_at < cutoff,
        )
    )
    prev_jobs = prev_result.scalars().all()

    current_counter: dict[str, int] = {}
    for job_json in current_jobs:
        if job_json and isinstance(job_json, dict):
            title = job_json.get("title", "") or ""
            category = _normalize_job_title(title)
            current_counter[category] = current_counter.get(category, 0) + 1

    prev_counter: dict[str, int] = {}
    for job_json in prev_jobs:
        if job_json and isinstance(job_json, dict):
            title = job_json.get("title", "") or ""
            category = _normalize_job_title(title)
            prev_counter[category] = prev_counter.get(category, 0) + 1

    sorted_categories = sorted(current_counter.items(), key=lambda x: -x[1])

    result: list[TrendingJobResponse] = []
    for rank, (category, count) in enumerate(sorted_categories[:5], start=1):
        prev_count = prev_counter.get(category, 0)
        if prev_count > 0:
            change = round((count - prev_count) / prev_count * 100, 1)
        else:
            change = None
        result.append(TrendingJobResponse(
            rank=rank,
            job_title=category,
            category=category,
            count=count,
            change_percent=change,
        ))

    return result