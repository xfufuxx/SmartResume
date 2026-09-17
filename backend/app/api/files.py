"""文件访问代理：所有简历原件 / 生成 PDF 均经由此端点下发。

原先以 `app.mount("/uploads", StaticFiles(...))` 公开挂载，任何知道 URL 的人
都能直连下载他人简历 PII（PIPL 红线）。现改为签名 URL 代理：
- storage 层在上传时返回 `{BACKEND_URL}/api/files/{key}?exp=&sig=` 签名地址；
- 本端点校验签名与过期时间，通过后以 FileResponse 返回文件。
签名 URL 仅对持有者可见（通过 API 响应下发），且到期自动失效，等同 S3 presigned URL。
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.services.storage import verify_signed_key

logger = logging.getLogger(__name__)
router = APIRouter()

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("/api/files/{key:path}")
async def serve_file(key: str, exp: int = Query(...), sig: str = Query(...)):
    # 防目录穿越
    if ".." in key or key.startswith("/") or key.startswith("\\"):
        raise HTTPException(status_code=400, detail="非法文件路径")

    if not verify_signed_key(key, exp, sig):
        raise HTTPException(status_code=403, detail="链接无效或已过期，请重新打开页面获取最新链接")

    local_path = os.path.join("uploads", key)
    if not os.path.isfile(local_path):
        raise HTTPException(status_code=404, detail="文件不存在或已被删除")

    ext = os.path.splitext(key)[1].lower()
    content_type = _CONTENT_TYPES.get(ext, "application/octet-stream")
    return FileResponse(
        local_path,
        media_type=content_type,
        filename=os.path.basename(local_path),
        content_disposition_type="inline",
    )
