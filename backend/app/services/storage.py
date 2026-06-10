import os
import asyncio
import aiofiles
from fastapi import UploadFile
from app.config import settings

try:
    import boto3
    from botocore.config import Config as BotoConfig
    HAS_S3 = True
except ImportError:
    HAS_S3 = False


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
        if self.s3_client:
            await asyncio.to_thread(
                self.s3_client.put_object,
                Bucket=settings.S3_BUCKET, Key=key, Body=content,
            )
            return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

        local_path = f"uploads/{key}"
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        async with aiofiles.open(local_path, "wb") as f:
            await f.write(content)
        return f"{settings.BACKEND_URL}/uploads/{key}"

    async def upload_bytes(self, data: bytes, key: str, content_type: str = "application/pdf") -> str:
        if self.s3_client:
            await asyncio.to_thread(
                self.s3_client.put_object,
                Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type,
            )
            return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

        local_path = f"uploads/{key}"
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        async with aiofiles.open(local_path, "wb") as f:
            await f.write(data)
        return f"{settings.BACKEND_URL}/uploads/{key}"

    async def delete(self, key: str):
        if self.s3_client:
            await asyncio.to_thread(
                self.s3_client.delete_object,
                Bucket=settings.S3_BUCKET, Key=key,
            )
        else:
            # key 可能是完整 URL（http://...）或相对路径（uploads/...）
            if key.startswith("http"):
                # 从完整 URL 中提取相对路径
                local_path = key.split("/uploads/", 1)[-1]
                local_path = f"uploads/{local_path}"
            elif key.startswith("uploads/"):
                local_path = key
            else:
                local_path = f"uploads/{key}"
            if os.path.exists(local_path):
                os.remove(local_path)


storage = StorageService()