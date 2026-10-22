from datetime import datetime, timedelta, timezone
from jose import jwt

# 兼容 shim：bcrypt >= 4.1 移除了 __about__，passlib 1.7.4 读取时会打印
# 一段无害但刺眼的 AttributeError 堆栈。这里补上即可消除噪音。
import types as _types

import bcrypt as _bcrypt

if not hasattr(_bcrypt, "__about__"):
    _bcrypt.__about__ = _types.SimpleNamespace(
        __version__=getattr(_bcrypt, "__version__", "unknown")
    )

from passlib.hash import bcrypt as bcrypt_handler  # noqa: E402

from app.config import settings  # noqa: E402


def hash_password(password: str) -> str:
    return bcrypt_handler.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt_handler.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def create_refresh_token(user_id: str, device_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire, "type": "refresh", "device_id": device_id}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])


def decode_refresh_token(token: str) -> dict:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token")
    return payload
