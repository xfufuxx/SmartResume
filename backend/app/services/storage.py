import os
import time
import hmac
import hashlib
import asyncio
import logging
from urllib.parse import urlparse, parse_qs

from fastapi import UploadFile
from app.config import settings

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.config import Config as BotoConfig
    HAS_S3 = True
except ImportError:
    HAS_S3 = False


def _sign_key(key: str) -> str:
    """为存储 key 生成带过期时间的 HMAC 签名，返回完整的代理访问 URL。

    生成的 URL 形如：{BACKEND_URL}/api/files/{key}?exp={exp}&sig={sig}
    前端 <img> / <a download> 直接复用该 URL 即可，无需额外鉴权头，
    适合浏览器原生资源加载（PIPL 合规：简历原件不再以公开静态目录暴露）。
    """
    exp = int(time.time()) + settings.FILE_URL_TTL
    raw = f"{key}:{exp}".encode("utf-8")
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return f"{settings.BACKEND_URL}/api/files/{key}?exp={exp}&sig={sig}"


def verify_signed_key(key: str, exp: int, sig: str) -> bool:
    """校验签名 URL 的合法性（过期或签名不符均返回 False）。"""
    try:
        if int(time.time()) > exp:
            return False
    except (TypeError, ValueError):
        return False
    raw = f"{key}:{exp}".encode("utf-8")
    expected = hmac.new(settings.SECRET_KEY.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def resign_file_url(url: str | None) -> str | None:
    """把存储的文件地址统一重签为有效的签名代理 URL（刷新过期时间）。

    兼容三种历史形态：
    - 完整签名 URL（{BACKEND_URL}/api/files/{key}?exp=&sig=）→ 提取 key 重签；
    - 旧版静态路径（.../uploads/{key}）→ 提取 key 走签名代理；
    - 相对路径（uploads/{key} 或裸 key，如演示种子数据）→ 直接重签。
    无法识别时原样返回。
    """
    if not url:
        return url
    if url.startswith("http"):
        path = urlparse(url).path
        if "/api/files/" in path:
            key = path.split("/api/files/", 1)[-1]
        elif "/uploads/" in path:
            key = path.split("/uploads/", 1)[-1]
        else:
            return url
    elif url.startswith("uploads/"):
        key = url[len("uploads/"):]
    elif url.startswith("/"):
        key = url.lstrip("/")
    else:
        key = url
    return _sign_key(key)


class StorageService:
    def __init__(self):
        self.s3_client = None
        if HAS_S3 and settings.AWS_ACCESS_KEY_ID:
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                endpoint_url=settings.S3_ENDPOINT,
                region_name=settings.S3_REGION,
                config=BotoConfig(signature_version="s3v4"),
            )

    async def upload(self, file: UploadFile, key: str) -> str:
        content = await file.read()
        return await self.upload_bytes(content, key)

    async def upload_bytes(self, data: bytes, key: str, content_type: str = "application/pdf") -> str:
        if self.s3_client:
            await asyncio.to_thread(
                self.s3_client.put_object,
                Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type,
            )
            # S3 场景应使用 presigned URL；此处本地开发默认走本地存储分支。
            return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

        local_path = f"uploads/{key}"
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        async with __import__("aiofiles").open(local_path, "wb") as f:
            await f.write(data)
        # 关键改动：返回签名代理 URL，而非公开静态地址
        return _sign_key(key)

    async def delete(self, key: str):
        if self.s3_client:
            await asyncio.to_thread(
                self.s3_client.delete_object,
                Bucket=settings.S3_BUCKET, Key=key,
            )
            return

        # key 可能是完整 URL（http://.../api/files/... 或 http://.../uploads/...）或相对路径
        local_key = key
        if key.startswith("http"):
            parsed = urlparse(key)
            path = parsed.path
            if "/api/files/" in path:
                local_key = path.split("/api/files/", 1)[-1]
                # 去除查询串
                local_key = local_key.split("?", 1)[0]
            elif "/uploads/" in path:
                local_key = path.split("/uploads/", 1)[-1]
            else:
                local_key = os.path.basename(path)
        elif key.startswith("uploads/"):
            local_key = key[len("uploads/"):] if key.startswith("uploads/") else key
        elif key.startswith("/"):
            local_key = key.lstrip("/")

        local_path = f"uploads/{local_key}"
        if os.path.exists(local_path):
            os.remove(local_path)


storage = StorageService()
