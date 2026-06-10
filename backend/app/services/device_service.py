import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import UserDevice
from app.core.audit import hash_token

TZ_UTC8 = timezone(timedelta(hours=8))


async def register_device(
    db: AsyncSession,
    user_id: str,
    device_id: str,
    device_name: str | None = None,
    platform: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    refresh_token: str | None = None,
) -> UserDevice:
    existing_result = await db.execute(
        select(UserDevice).where(
            UserDevice.user_id == user_id,
            UserDevice.device_id == device_id,
            UserDevice.is_revoked == False,
        )
    )
    existing = existing_result.scalar_one_or_none()

    token_hash = hash_token(refresh_token) if refresh_token else None

    if existing:
        existing.last_active = datetime.now(TZ_UTC8)
        existing.ip_address = ip_address or existing.ip_address
        existing.user_agent = user_agent or existing.user_agent
        if token_hash:
            existing.refresh_token_hash = token_hash
        if platform:
            existing.platform = platform
        await db.flush()
        return existing

    device = UserDevice(
        id=str(uuid.uuid4()),
        user_id=user_id,
        device_id=device_id,
        device_name=device_name,
        platform=platform,
        ip_address=ip_address,
        user_agent=user_agent,
        refresh_token_hash=token_hash,
        last_active=datetime.now(TZ_UTC8),
        is_revoked=False,
    )
    db.add(device)
    await db.flush()
    return device


async def revoke_device(db: AsyncSession, device_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(UserDevice).where(
            UserDevice.id == device_id,
            UserDevice.user_id == user_id,
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        return False
    device.is_revoked = True
    device.refresh_token_hash = None
    await db.flush()
    return True


async def revoke_all_devices(db: AsyncSession, user_id: str):
    result = await db.execute(
        select(UserDevice).where(
            UserDevice.user_id == user_id,
            UserDevice.is_revoked == False,
        )
    )
    for device in result.scalars().all():
        device.is_revoked = True
        device.refresh_token_hash = None
    await db.flush()


async def is_refresh_token_valid(db: AsyncSession, user_id: str, token_hash: str) -> UserDevice | None:
    result = await db.execute(
        select(UserDevice).where(
            UserDevice.user_id == user_id,
            UserDevice.refresh_token_hash == token_hash,
            UserDevice.is_revoked == False,
        )
    )
    return result.scalar_one_or_none()


async def get_user_devices(db: AsyncSession, user_id: str) -> list[UserDevice]:
    result = await db.execute(
        select(UserDevice)
        .where(UserDevice.user_id == user_id)
        .order_by(UserDevice.last_active.desc())
    )
    return list(result.scalars().all())


async def update_device_activity(db: AsyncSession, device_id: str, user_id: str):
    result = await db.execute(
        select(UserDevice).where(
            UserDevice.id == device_id,
            UserDevice.user_id == user_id,
            UserDevice.is_revoked == False,
        )
    )
    device = result.scalar_one_or_none()
    if device:
        device.last_active = datetime.now(TZ_UTC8)
        await db.flush()