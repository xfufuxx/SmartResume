"""AI 职业照接口：上传自拍 → 生成职业照（参考 JadeAI linkedin-photo）。

安全与配额
----------
- 需要登录（get_current_user）；Key 由用户前端提供、随请求上传，**服务端不落库**。
- 每用户每日生成上限 ``settings.AI_PHOTO_DAILY_LIMIT``（Redis 自然日分桶），
  防刷上游额度；生成失败时退还额度（与投递额度同模式）。
"""
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from redis.asyncio import Redis

from app.config import settings
from app.core.deps import get_current_user, get_redis
from app.models.user import User
from app.services import ai_photo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai-photo", tags=["AI Photo"])


class AiPhotoGenerateRequest(BaseModel):
    image: str
    prompt: str
    requirements: str | None = None
    aspectRatio: str | None = "1:1"
    apiKey: str


async def _check_and_consume_quota(redis: Redis, user_id: str) -> tuple[bool, int]:
    """检查并占用当日生成额度。Key 按自然日分桶，86400s 兜底 TTL。"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"aiphoto:count:{user_id}:{today}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    return count <= settings.AI_PHOTO_DAILY_LIMIT, int(count)


async def _release_quota(redis: Redis, user_id: str) -> None:
    """生成失败时退还当日额度（DECR，且不为负）。"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"aiphoto:count:{user_id}:{today}"
    try:
        val = int(await redis.get(key) or 0)
        if val > 0:
            await redis.decr(key)
    except Exception:  # noqa: BLE001 —— 退还失败不影响主流程
        pass


@router.post("/generate", summary="生成 AI 职业照")
async def generate_ai_photo(
    body: AiPhotoGenerateRequest,
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """把上传的自拍照转换成职业照。

    - ``image``：照片 dataURL（前端已压缩到长边 1024px）
    - ``prompt``：基础提示词（前端默认提供，可编辑）
    - ``aspectRatio``：1:1 / 3:4 / 2:3 / 4:3
    - ``apiKey``：用户自带的 Gemini API Key（不落库）

    错误码：``invalid_key``（Key 无效）/ ``safety_filtered``（被安全拦截）/
    ``generate_failed``（其它上游失败，detail 带可读原因）。
    """
    allowed, used = await _check_and_consume_quota(redis, user.id)
    if not allowed:
        return {
            "error": "quota_exceeded",
            "detail": f"今日生成次数已达上限（{settings.AI_PHOTO_DAILY_LIMIT} 次），明天再试",
            "used": used,
        }

    try:
        result = await ai_photo.generate_professional_photo(
            image=body.image,
            prompt=body.prompt,
            requirements=body.requirements,
            aspect_ratio=body.aspectRatio,
            api_key=body.apiKey,
        )
    except ai_photo.AiPhotoError as e:
        # 上游明确拒绝（Key 无效/安全拦截）不消耗用户额度
        await _release_quota(redis, user.id)
        return {"error": e.code, "detail": e.message}
    except Exception as e:  # noqa: BLE001 —— 未知异常也要退还额度并显式失败
        logger.error("[AI职业照] 生成异常 user=%s: %s: %s", user.id, type(e).__name__, e)
        await _release_quota(redis, user.id)
        return {"error": "generate_failed", "detail": "生成服务异常，请稍后重试"}

    return {"image": result.image, "text": result.text, "used": used}
