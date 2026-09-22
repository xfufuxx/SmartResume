"""面试追踪 - 沟通消息：记录用户与某家公司就某次投递的往来（电话 / 邮件 / 微信等）。

与全局通知中心 /messages 相互独立：这里是对「某次投递 / 某公司」的过程性沟通记录，
可在面试追踪栏目中与投递记录、面试进度并列查看。

字段边界：
- 关联投递（application_id）可选；关联时公司 / 职位从投递记录自动快照。
- 投递被撤回时，外键 ondelete="SET NULL" 仅解除关联、保留沟通内容（公司 / 职位快照仍在）。
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.communication import Communication
from app.models.application import Application
from app.models.job_image import JobImage
from app.models.user import User
from app.schemas.communication import (
    COMMUNICATION_CHANNELS,
    COMMUNICATION_CHANNEL_LABELS,
    COMMUNICATION_DIRECTIONS,
    COMMUNICATION_DIRECTION_LABELS,
    CommunicationCreate,
    CommunicationResponse,
    CommunicationStats,
    CommunicationUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/communications", tags=["Communications"])


async def _get_owned(db: AsyncSession, user: User, comm_id: str) -> Communication:
    result = await db.execute(
        select(Communication).where(Communication.id == comm_id, Communication.user_id == user.id)
    )
    comm = result.scalar_one_or_none()
    if not comm:
        raise HTTPException(status_code=404, detail="沟通记录不存在")
    return comm


async def _snapshot_company_position(
    db: AsyncSession, user: User, application_id: str | None, company: str | None, position: str | None,
) -> tuple[str, str | None]:
    """解析公司 / 职位：优先用传入值；若关联了投递且未传，则从投递记录对应的岗位快照带出。"""
    company = (company or "").strip() or None
    position = (position or "").strip() or None
    if application_id:
        app = await db.execute(
            select(Application).where(Application.id == application_id, Application.user_id == user.id)
        )
        app = app.scalar_one_or_none()
        if app is None:
            raise HTTPException(status_code=404, detail="关联的投递记录不存在")
        if not company or not position:
            job = await db.execute(select(JobImage).where(JobImage.id == app.job_image_id))
            job = job.scalar_one_or_none()
            if job:
                company = company or job.company or None
                position = position or job.title or None
    if not company:
        raise HTTPException(status_code=422, detail="请填写公司名称，或在「关联投递」中选择一条投递记录")
    return company, position


@router.get("/options")
async def get_options():
    """前端表单下拉用的可选项（方向 / 渠道枚举单一数据源）。"""
    return {
        "directions": COMMUNICATION_DIRECTIONS,
        "direction_labels": COMMUNICATION_DIRECTION_LABELS,
        "channels": COMMUNICATION_CHANNELS,
        "channel_labels": COMMUNICATION_CHANNEL_LABELS,
    }


@router.post("/", response_model=CommunicationResponse, status_code=201)
async def create_communication(
    body: CommunicationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """新增一条沟通记录（可关联投递，自动带出公司 / 职位）。"""
    company, position = await _snapshot_company_position(db, user, body.application_id, body.company, body.position)
    comm = Communication(
        user_id=user.id,
        application_id=body.application_id,
        company=company,
        position=position,
        direction=body.direction,
        channel=body.channel,
        content=body.content.strip(),
        contact_at=body.contact_at or datetime.now(timezone.utc),
    )
    db.add(comm)
    await db.flush()
    await db.refresh(comm)
    await db.commit()
    return CommunicationResponse.model_validate(comm)


@router.get("/", response_model=list[CommunicationResponse])
async def list_communications(
    application_id: str | None = Query(None, description="按关联投递过滤"),
    company: str | None = Query(None, max_length=200, description="按公司名模糊过滤"),
    keyword: str | None = Query(None, max_length=100, description="内容 / 公司关键词"),
    direction: str | None = Query(None, description="out / in"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列出当前用户的沟通记录（按沟通时间倒序，无时间则按创建时间倒序）。"""
    stmt = select(Communication).where(Communication.user_id == user.id)
    if application_id:
        stmt = stmt.where(Communication.application_id == application_id)
    if company:
        stmt = stmt.where(Communication.company.ilike(f"%{company.strip()}%"))
    if direction and direction in COMMUNICATION_DIRECTIONS:
        stmt = stmt.where(Communication.direction == direction)
    if keyword:
        kw = f"%{keyword.strip()}%"
        stmt = stmt.where(Communication.content.ilike(kw) | Communication.company.ilike(kw))
    stmt = stmt.order_by(Communication.contact_at.desc().nullslast(), Communication.created_at.desc())
    result = await db.execute(stmt)
    return [CommunicationResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/stats", response_model=CommunicationStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """基于真实沟通记录的统计（无模拟数据）。"""
    dir_res = await db.execute(
        select(Communication.direction, func.count())
        .where(Communication.user_id == user.id)
        .group_by(Communication.direction)
    )
    ch_res = await db.execute(
        select(Communication.channel, func.count())
        .where(Communication.user_id == user.id)
        .group_by(Communication.channel)
    )
    by_direction: dict[str, int] = {d: 0 for d in COMMUNICATION_DIRECTIONS}
    by_channel: dict[str, int] = {c: 0 for c in COMMUNICATION_CHANNELS}
    total = 0
    for d, cnt in dir_res.all():
        if d in by_direction:
            by_direction[d] = cnt
        total += cnt
    for c, cnt in ch_res.all():
        if c in by_channel:
            by_channel[c] = cnt
    return CommunicationStats(total=total, by_direction=by_direction, by_channel=by_channel)


@router.get("/{communication_id}", response_model=CommunicationResponse)
async def get_communication(
    communication_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return CommunicationResponse.model_validate(await _get_owned(db, user, communication_id))


@router.put("/{communication_id}", response_model=CommunicationResponse)
async def update_communication(
    communication_id: str,
    body: CommunicationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """更新沟通：可改关联投递、公司 / 职位、方向、渠道、内容、时间。"""
    comm = await _get_owned(db, user, communication_id)
    # 重新解析公司 / 职位快照（仅当本次提交涉及这两个字段）
    if body.application_id is not None or body.company is not None or body.position is not None:
        company, position = await _snapshot_company_position(
            db, user, body.application_id, body.company, body.position,
        )
        comm.application_id = body.application_id
        comm.company = company
        comm.position = position
    if body.direction is not None:
        comm.direction = body.direction
    if body.channel is not None:
        comm.channel = body.channel
    if body.content is not None:
        comm.content = body.content.strip()
    if body.contact_at is not None:
        comm.contact_at = body.contact_at
    await db.commit()
    await db.refresh(comm)
    return CommunicationResponse.model_validate(comm)


@router.delete("/{communication_id}")
async def delete_communication(
    communication_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除一条沟通记录。"""
    comm = await _get_owned(db, user, communication_id)
    await db.delete(comm)
    await db.commit()
    return {"detail": "已删除沟通记录"}
