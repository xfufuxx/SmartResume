"""面试追踪：完全由用户手动录入的面试进展记录。

本模块只做「存储 + 查询 + 统计」，不包含任何从投递流程自动派生面试记录的逻辑。
面试追踪与岗位投递（/api/applications）相互独立。所有记录均由用户在 /interviews 页面手动添加、编辑、删除。
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.interview_track import InterviewTrack
from app.models.job_image import JobImage
from app.models.resume import Resume
from app.models.user import User
from app.schemas.interview_track import (
    INTERVIEW_MODES,
    INTERVIEW_STAGES,
    TRACK_STATUSES,
    InterviewTrackCreate,
    InterviewTrackResponse,
    InterviewTrackStats,
    InterviewTrackUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview-tracks", tags=["Interview Tracks"])

TZ_UTC8 = timezone(timedelta(hours=8))


async def _check_owned_refs(
    db: AsyncSession,
    user: User,
    resume_id: str | None,
    job_image_id: str | None,
) -> None:
    """校验可选关联的简历/岗位属于当前用户，避免越权引用他人数据。"""
    if resume_id:
        r = await db.execute(
            select(Resume.id).where(Resume.id == resume_id, Resume.user_id == user.id)
        )
        if r.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="关联的简历不存在")
    if job_image_id:
        j = await db.execute(
            select(JobImage.id).where(JobImage.id == job_image_id, JobImage.user_id == user.id)
        )
        if j.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="关联的岗位不存在")


async def _get_owned_track(db: AsyncSession, user: User, track_id: str) -> InterviewTrack:
    result = await db.execute(
        select(InterviewTrack).where(
            InterviewTrack.id == track_id, InterviewTrack.user_id == user.id
        )
    )
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=404, detail="面试记录不存在")
    return track


@router.get("/options")
async def get_options():
    """前端表单下拉用的可选项（单一数据源，避免前后端枚举漂移）。"""
    return {
        "statuses": TRACK_STATUSES,
        "stages": INTERVIEW_STAGES,
        "modes": INTERVIEW_MODES,
    }


@router.post("/", response_model=InterviewTrackResponse, status_code=201)
async def create_track(
    body: InterviewTrackCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """手动新增一条面试记录。"""
    await _check_owned_refs(db, user, body.resume_id, body.job_image_id)

    track = InterviewTrack(user_id=user.id, **body.model_dump())
    db.add(track)
    await db.flush()
    await db.refresh(track)
    await db.commit()
    return track


@router.get("/", response_model=list[InterviewTrackResponse])
async def list_tracks(
    status: str | None = Query(None, description="按状态过滤"),
    keyword: str | None = Query(None, max_length=100, description="公司/职位/地点关键词"),
    start: datetime | None = Query(None, description="面试时间起（含）"),
    end: datetime | None = Query(None, description="面试时间止（含）"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户的面试记录（按面试时间倒序，未填时间的按创建时间倒序兜底）。"""
    stmt = select(InterviewTrack).where(InterviewTrack.user_id == user.id)
    if status:
        if status not in TRACK_STATUSES:
            raise HTTPException(status_code=400, detail=f"状态必须是 {'/'.join(TRACK_STATUSES)} 之一")
        stmt = stmt.where(InterviewTrack.status == status)
    if keyword:
        kw = f"%{keyword.strip()}%"
        stmt = stmt.where(
            InterviewTrack.company.ilike(kw)
            | InterviewTrack.position.ilike(kw)
            | InterviewTrack.location.ilike(kw)
        )
    if start:
        stmt = stmt.where(InterviewTrack.interview_time.isnot(None), InterviewTrack.interview_time >= start)
    if end:
        stmt = stmt.where(InterviewTrack.interview_time.isnot(None), InterviewTrack.interview_time <= end)

    stmt = stmt.order_by(
        InterviewTrack.interview_time.desc().nullslast(),
        InterviewTrack.created_at.desc(),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/stats", response_model=InterviewTrackStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """基于真实录入记录的统计（无模拟数据）。"""
    result = await db.execute(
        select(InterviewTrack).where(InterviewTrack.user_id == user.id)
    )
    tracks = list(result.scalars().all())

    total = len(tracks)
    by_status: dict[str, int] = {s: 0 for s in TRACK_STATUSES}
    by_stage: dict[str, int] = {s: 0 for s in INTERVIEW_STAGES}
    for t in tracks:
        if t.status in by_status:
            by_status[t.status] += 1
        if t.stage in by_stage:
            by_stage[t.stage] += 1

    offer_count = by_status.get("offer", 0)
    pass_count = offer_count + by_status.get("passed", 0)

    now = datetime.now(TZ_UTC8)
    horizon = now + timedelta(days=7)
    upcoming = 0
    for t in tracks:
        if t.status != "scheduled" or not t.interview_time:
            continue
        ts = t.interview_time if t.interview_time.tzinfo else t.interview_time.replace(tzinfo=TZ_UTC8)
        if now <= ts <= horizon:
            upcoming += 1

    return InterviewTrackStats(
        total=total,
        by_status=by_status,
        by_stage=by_stage,
        offer_rate=round(offer_count / total * 100, 1) if total else 0.0,
        pass_rate=round(pass_count / total * 100, 1) if total else 0.0,
        upcoming_7d=upcoming,
    )


@router.get("/{track_id}", response_model=InterviewTrackResponse)
async def get_track(
    track_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _get_owned_track(db, user, track_id)


@router.put("/{track_id}", response_model=InterviewTrackResponse)
async def update_track(
    track_id: str,
    body: InterviewTrackUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """编辑面试记录（全量覆盖表单字段）。"""
    track = await _get_owned_track(db, user, track_id)
    await _check_owned_refs(db, user, body.resume_id, body.job_image_id)

    for field, value in body.model_dump().items():
        setattr(track, field, value)
    await db.commit()
    await db.refresh(track)
    return track


@router.delete("/{track_id}")
async def delete_track(
    track_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = await _get_owned_track(db, user, track_id)
    await db.delete(track)
    await db.commit()
    return {"detail": "已删除"}
