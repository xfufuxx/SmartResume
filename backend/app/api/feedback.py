import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.feedback import Feedback
from app.models.optimized_resume import OptimizedResume
from app.schemas.feedback import (
    FeedbackCreate, FeedbackResponse, FeedbackStatsResponse, OUTCOME_OPTIONS,
)

router = APIRouter()


@router.post("/", response_model=FeedbackResponse)
async def create_feedback(
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.outcome not in OUTCOME_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"outcome must be one of: {', '.join(OUTCOME_OPTIONS)}",
        )

    opt_result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.id == body.optimization_record_id,
            OptimizedResume.user_id == user.id,
        )
    )
    opt = opt_result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="优化记录不存在")

    existing = await db.execute(
        select(Feedback).where(
            Feedback.user_id == user.id,
            Feedback.optimization_record_id == body.optimization_record_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该优化记录已有投递反馈，不可重复添加")

    feedback = Feedback(
        user_id=user.id,
        optimization_record_id=body.optimization_record_id,
        outcome=body.outcome,
    )
    db.add(feedback)
    await db.flush()
    await db.refresh(feedback)
    await db.commit()

    return FeedbackResponse(
        id=feedback.id,
        user_id=feedback.user_id,
        optimization_record_id=feedback.optimization_record_id,
        outcome=feedback.outcome,
        created_at=feedback.created_at,
    )


@router.get("/stats", response_model=FeedbackStatsResponse)
async def get_feedback_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feedbacks_result = await db.execute(
        select(Feedback).where(Feedback.user_id == user.id)
    )
    feedbacks = feedbacks_result.scalars().all()

    total = len(feedbacks)
    outcome_counts: dict[str, int] = {}
    for fb in feedbacks:
        outcome_counts[fb.outcome] = outcome_counts.get(fb.outcome, 0) + 1

    interview_count = outcome_counts.get("interview", 0)
    offer_count = outcome_counts.get("offer", 0)
    interview_rate = round(interview_count / total * 100, 1) if total > 0 else 0.0
    offer_rate = round(offer_count / total * 100, 1) if total > 0 else 0.0

    opt_ids = [fb.optimization_record_id for fb in feedbacks]
    opt_result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id.in_(opt_ids))
    ) if opt_ids else None
    opt_map = {}
    if opt_result:
        for opt in opt_result.scalars().all():
            opt_map[opt.id] = opt

    version_success: dict[str, dict] = {}
    for fb in feedbacks:
        opt = opt_map.get(fb.optimization_record_id)
        if not opt or not opt.resume_id:
            continue
        version_key = opt.resume_id
        if version_key not in version_success:
            version_success[version_key] = {"total": 0, "interview": 0, "offer": 0, "resume_title": ""}
        version_success[version_key]["total"] += 1
        if fb.outcome in ("interview", "fail_round1", "fail_round2", "offer"):
            version_success[version_key]["interview"] += 1
        if fb.outcome == "offer":
            version_success[version_key]["offer"] += 1

    version_comparison = []
    for vid, stats in version_success.items():
        total_v = stats["total"]
        version_comparison.append({
            "resume_id": vid,
            "total_applications": total_v,
            "interview_rate": round(stats["interview"] / total_v * 100, 1) if total_v > 0 else 0.0,
            "offer_rate": round(stats["offer"] / total_v * 100, 1) if total_v > 0 else 0.0,
        })

    return FeedbackStatsResponse(
        total_applications=total,
        interview_rate=interview_rate,
        offer_rate=offer_rate,
        outcome_breakdown=outcome_counts,
        version_comparison=version_comparison,
    )


@router.get("/", response_model=list[FeedbackResponse])
async def list_feedbacks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Feedback)
        .where(Feedback.user_id == user.id)
        .order_by(Feedback.created_at.desc())
    )
    feedbacks = result.scalars().all()
    return [
        FeedbackResponse(
            id=fb.id, user_id=fb.user_id,
            optimization_record_id=fb.optimization_record_id,
            outcome=fb.outcome, created_at=fb.created_at,
        )
        for fb in feedbacks
    ]