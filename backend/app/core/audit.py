import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.user import AuditLog


async def write_audit_log(
    db: AsyncSession,
    user_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
):
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    await db.flush()


async def clean_expired_logs(db: AsyncSession, days: int = 90):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = AuditLog.__table__.delete().where(AuditLog.created_at < cutoff)
    await db.execute(stmt)
    await db.commit()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()