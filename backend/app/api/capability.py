"""岗位能力测评：岗位画像库 + 用户自评 + 报告生成 + 岗位匹配排行。

模块边界：
- 与简历评分（/api/scoring）相互独立：那是机器对简历的客观评分，这里是用户对岗位能力的自评画像；
- 报告为生成时快照，历史记录不随后续种子内容调整而变化；
- 测评完成时向消息中心写入一条站内通知（msg_type=job）。
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.capability_assessment import CapabilityAssessment, JobProfile
from app.models.user import User
from app.schemas.capability import (
    AssessmentResponse,
    AssessmentSubmit,
    JobProfileResponse,
    RankingItem,
)
from app.services.capability_assessment import build_report, compute_scores
from app.services.message_service import create_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/capability", tags=["Capability Assessment"])


def _profile_or_404(db_job: JobProfile | None) -> JobProfile:
    if not db_job:
        raise HTTPException(status_code=404, detail="岗位画像不存在")
    return db_job


def _validate_scores(profile: JobProfile, professional_scores: dict, general_scores: dict) -> None:
    """校验自评维度与岗位画像定义完全一致（不多不少），分数范围 1~5 由 schema 保证。"""
    for label, dims, scores in (
        ("专业", profile.professional_dimensions or [], professional_scores),
        ("通识", profile.general_dimensions or [], general_scores),
    ):
        expected = {d["name"] for d in dims}
        if not expected:
            raise HTTPException(status_code=400, detail=f"该岗位未定义{label}能力维度")
        provided = set(scores)
        missing = expected - provided
        extra = provided - expected
        if missing or extra:
            parts = []
            if missing:
                parts.append(f"缺少维度：{'、'.join(sorted(missing))}")
            if extra:
                parts.append(f"未知维度：{'、'.join(sorted(extra))}")
            raise HTTPException(status_code=422, detail=f"{label}能力评分与岗位画像不一致（{'；'.join(parts)}）")


def _to_response(a: CapabilityAssessment, job_title: str, category: str) -> AssessmentResponse:
    return AssessmentResponse(
        id=a.id,
        user_id=a.user_id,
        job_profile_id=a.job_profile_id,
        job_title=job_title,
        category=category,
        professional_scores=a.professional_scores,
        general_scores=a.general_scores,
        overall_match=a.overall_match,
        professional_avg=a.professional_avg,
        general_avg=a.general_avg,
        report=a.report,
        created_at=a.created_at,
    )


# ─────────────────────────────────────────────────────────────
# 岗位画像库
# ─────────────────────────────────────────────────────────────
@router.get("/jobs", response_model=list[JobProfileResponse])
async def list_jobs(
    keyword: str | None = Query(None, max_length=100, description="岗位名称/标签关键词"),
    category: str | None = Query(None, max_length=50, description="岗位分类过滤"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """岗位画像列表（搜索 + 分类过滤，按分类与名称排序）。"""
    stmt = select(JobProfile)
    if keyword:
        kw = f"%{keyword.strip()}%"
        stmt = stmt.where(JobProfile.title.ilike(kw) | JobProfile.category.ilike(kw))
    if category:
        stmt = stmt.where(JobProfile.category == category)
    stmt = stmt.order_by(JobProfile.category, JobProfile.title)
    result = await db.execute(stmt)
    profiles = list(result.scalars().all())

    # 标签匹配在内存中做（JSONB 数组 ilike 兼容性差），数据量为内置岗位量级，可接受
    if keyword:
        kw = keyword.strip().lower()
        profiles = [
            p for p in profiles
            if kw in p.title.lower()
            or kw in (p.category or "").lower()
            or any(kw in str(t).lower() for t in (p.tags or []))
        ]
    return profiles


@router.get("/categories", response_model=list[str])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """全部岗位分类（前端筛选下拉单一数据源）。"""
    result = await db.execute(select(JobProfile.category).distinct())
    return sorted({row[0] for row in result.all() if row[0]})


@router.get("/jobs/{job_profile_id}", response_model=JobProfileResponse)
async def get_job(
    job_profile_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """岗位画像详情（含两套测评维度定义）。"""
    result = await db.execute(select(JobProfile).where(JobProfile.id == job_profile_id))
    return _profile_or_404(result.scalar_one_or_none())


# ─────────────────────────────────────────────────────────────
# 测评提交与记录
# ─────────────────────────────────────────────────────────────
@router.post("/assessments", response_model=AssessmentResponse, status_code=201)
async def create_assessment(
    body: AssessmentSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """提交自评分数 → 生成报告快照 → 写入站内通知。"""
    result = await db.execute(select(JobProfile).where(JobProfile.id == body.job_profile_id))
    profile = _profile_or_404(result.scalar_one_or_none())

    _validate_scores(profile, body.professional_scores, body.general_scores)

    match, prof_avg, gen_avg = compute_scores(body.professional_scores, body.general_scores)
    report = build_report(profile, body.professional_scores, body.general_scores)

    assessment = CapabilityAssessment(
        user_id=user.id,
        job_profile_id=profile.id,
        professional_scores=body.professional_scores,
        general_scores=body.general_scores,
        overall_match=match,
        professional_avg=prof_avg,
        general_avg=gen_avg,
        report=report,
    )
    db.add(assessment)
    await db.flush()

    await create_message(
        db,
        user_id=user.id,
        msg_type="job",
        title=f"「{profile.title}」能力测评完成",
        content=f"整体匹配度 {match:.0f}%，已生成能力补步建议报告，点击查看详情。",
        ref_id=assessment.id,
    )
    await db.commit()
    await db.refresh(assessment)
    return _to_response(assessment, profile.title, profile.category)


@router.get("/assessments", response_model=list[AssessmentResponse])
async def list_assessments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """我的全部测评记录（按时间倒序）。"""
    result = await db.execute(
        select(CapabilityAssessment)
        .where(CapabilityAssessment.user_id == user.id)
        .order_by(CapabilityAssessment.created_at.desc())
    )
    assessments = list(result.scalars().all())
    if not assessments:
        return []

    profile_ids = {a.job_profile_id for a in assessments}
    job_result = await db.execute(select(JobProfile).where(JobProfile.id.in_(profile_ids)))
    profiles = {p.id: p for p in job_result.scalars().all()}
    return [
        _to_response(a, profiles[a.job_profile_id].title, profiles[a.job_profile_id].category)
        if a.job_profile_id in profiles
        else _to_response(a, "已下线的岗位", "")
        for a in assessments
    ]


@router.get("/assessments/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """单次测评报告详情。"""
    result = await db.execute(
        select(CapabilityAssessment).where(
            CapabilityAssessment.id == assessment_id, CapabilityAssessment.user_id == user.id
        )
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="测评记录不存在")
    job_result = await db.execute(select(JobProfile).where(JobProfile.id == assessment.job_profile_id))
    profile = job_result.scalar_one_or_none()
    return _to_response(
        assessment,
        profile.title if profile else "已下线的岗位",
        profile.category if profile else "",
    )


@router.delete("/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CapabilityAssessment).where(
            CapabilityAssessment.id == assessment_id, CapabilityAssessment.user_id == user.id
        )
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="测评记录不存在")
    await db.delete(assessment)
    await db.commit()
    return {"detail": "已删除"}


# ─────────────────────────────────────────────────────────────
# 岗位匹配排行（「我更适合哪些岗位」）
# ─────────────────────────────────────────────────────────────
@router.get("/ranking", response_model=list[RankingItem])
async def get_ranking(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """基于真实测评记录的岗位适合度排行（每个岗位取最近一次测评，按匹配度倒序）。

    仅汇总当前用户自己的数据；同一岗位多次测评会给出与上一次的变化趋势（trend）。
    """
    result = await db.execute(
        select(CapabilityAssessment)
        .where(CapabilityAssessment.user_id == user.id)
        .order_by(CapabilityAssessment.created_at.asc())
    )
    assessments = list(result.scalars().all())
    if not assessments:
        return []

    profile_ids = {a.job_profile_id for a in assessments}
    job_result = await db.execute(select(JobProfile).where(JobProfile.id.in_(profile_ids)))
    profiles = {p.id: p for p in job_result.scalars().all()}

    by_job: dict[str, list[CapabilityAssessment]] = {}
    for a in assessments:
        by_job.setdefault(a.job_profile_id, []).append(a)

    items: list[RankingItem] = []
    for job_id, records in by_job.items():
        profile = profiles.get(job_id)
        latest = records[-1]
        previous = records[-2] if len(records) >= 2 else None
        weak_count = sum(
            1
            for group in ("professional_analysis", "general_analysis")
            for item in (latest.report or {}).get(group, [])
            if item.get("score", 5) <= 2
        )
        if previous is None:
            trend = "flat"
        elif latest.overall_match > previous.overall_match:
            trend = "up"
        elif latest.overall_match < previous.overall_match:
            trend = "down"
        else:
            trend = "flat"
        items.append(RankingItem(
            job_profile_id=job_id,
            job_title=profile.title if profile else "已下线的岗位",
            category=profile.category if profile else "",
            overall_match=latest.overall_match,
            professional_avg=latest.professional_avg,
            general_avg=latest.general_avg,
            weak_dimension_count=weak_count,
            assessment_count=len(records),
            previous_match=previous.overall_match if previous else None,
            trend=trend,
            latest_assessment_id=latest.id,
            assessed_at=latest.created_at,
        ))

    items.sort(key=lambda x: -x.overall_match)
    return items
