from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

import redis.asyncio as aioredis

bearer_scheme = HTTPBearer()


async def get_redis():
    """获取 Redis 连接"""
    client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield client
    finally:
        await client.close()


class RateLimiter:
    """基于 Redis 的滑动窗口速率限制器"""

    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(self, request: Request, redis: aioredis.Redis = Depends(get_redis)):
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{request.url.path}:{client_ip}"

        current = await redis.get(key)
        if current is None:
            await redis.setex(key, self.window_seconds, 1)
        else:
            count = int(current)
            if count >= self.max_requests:
                ttl = await redis.ttl(key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"操作过于频繁，请在 {ttl} 秒后重试",
                )
            await redis.incr(key)


async def get_client_info(request: Request) -> dict:
    return {
        "ip_address": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", ""),
    }


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(User).where(User.id == user_id, User.status == "active")
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if current_user.email not in _get_admin_emails():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


ADMIN_EMAILS: set[str] = set()


def _get_admin_emails() -> set[str]:
    return ADMIN_EMAILS


def set_admin_emails(emails: list[str]):
    global ADMIN_EMAILS
    ADMIN_EMAILS = set(e.lower() for e in emails)