from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import MessageResponse
from app.services.message_service import (
    get_messages, mark_as_read, mark_all_read, delete_message, get_unread_count,
)

router = APIRouter()


@router.get("", response_model=dict)
async def list_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    messages, total = await get_messages(db, user.id, page, page_size, unread_only)
    return {
        "items": [
            {
                "id": m.id,
                "msg_type": m.msg_type,
                "title": m.title,
                "content": m.content,
                "ref_id": m.ref_id,
                "is_read": m.is_read,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": await get_unread_count(db, user.id),
    }


@router.put("/{message_id}/read")
async def read_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = await mark_as_read(db, message_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="消息不存在")
    await db.commit()
    return {"detail": "已标记为已读"}


@router.put("/read-all")
async def read_all_messages(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await mark_all_read(db, user.id)
    await db.commit()
    return {"detail": "全部已读"}


@router.delete("/{message_id}")
async def remove_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = await delete_message(db, message_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="消息不存在")
    await db.commit()
    return {"detail": "已删除"}