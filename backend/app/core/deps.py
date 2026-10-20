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

# 模块级单例：避免「每请求新建 + 关闭连接」带来的额外 RTT 与连接抖动
_redis_client: "aioredis.Redis | None" = None


def _get_redis_client() -> "aioredis.Redis":
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=50,
            socket_keepalive=True,
        )
    return _redis_client


async def get_redis():
    """获取 Redis 连接（单例，请求结束不关闭）"""
    yield _get_redis_client()


def get_client_ip(request: Request) -> str:
    """取真实客户端 IP。

    生产链路是 用户 → nginx(容器) → backend(容器)，request.client.host 只能看到
    nginx 的 Docker 内网 IP——**所有用户看到的都是同一个值**。限流若按它做 key，
    就变成「全站共享 3 次/分钟」：几个人同时注册就把额度挤爆，自己多点几次也 429
    （表现就是「点了获取验证码没反应」，因为旧前端把 429 吞了）。

    nginx 已在 /api/ 设置 X-Forwarded-For $proxy_add_x_forwarded_for，
    其格式为 <客户端自带的(可伪造), ..., nginx 追加的真实对端 IP>；
    backend 端口未对宿主暴露（仅 nginx 可达），取**最后一跳**即为真实客户端且防伪造。
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """基于 Redis 的滑动窗口速率限制器"""

    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(self, request: Request, redis: aioredis.Redis = Depends(get_redis)):
        client_ip = get_client_ip(request)
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
        "ip_address": get_client_ip(request),
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