import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import Message

TZ_UTC8 = timezone(timedelta(hours=8))


async def create_message(
    db: AsyncSession,
    user_id: str,
    msg_type: str,
    title: str | None = None,
    content: str | None = None,
    ref_id: str | None = None,
) -> Message:
    msg = Message(
        id=str(uuid.uuid4()),
        user_id=user_id,
        msg_type=msg_type,
        title=title,
        content=content,
        ref_id=ref_id,
    )
    db.add(msg)
    await db.flush()
    return msg


async def get_messages(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    page_size: int = 20,
    unread_only: bool = False,
) -> tuple[list[Message], int]:
    from sqlalchemy import func

    base = select(Message).where(Message.user_id == user_id)
    if unread_only:
        base = base.where(Message.is_read == False)

    count_stmt = select(func.count()).select_from(base.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = base.order_by(Message.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    messages = list(result.scalars().all())

    return messages, total


async def mark_as_read(db: AsyncSession, message_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.user_id == user_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        return False
    msg.is_read = True
    await db.flush()
    return True


async def mark_all_read(db: AsyncSession, user_id: str):
    result = await db.execute(
        select(Message).where(Message.user_id == user_id, Message.is_read == False)
    )
    for msg in result.scalars().all():
        msg.is_read = True
    await db.flush()


async def delete_message(db: AsyncSession, message_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.user_id == user_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        return False
    await db.delete(msg)
    await db.flush()
    return True


async def get_unread_count(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func
    stmt = select(func.count()).where(Message.user_id == user_id, Message.is_read == False)
    result = await db.execute(stmt)
    return result.scalar() or 0