"""
AI 职业照生成服务（参考 JadeAI `linkedin-photo` 功能，按本项目栈等价实现）。

能力
----
把用户上传的 casual selfie 通过图像编辑模型转换成「职业照/领英照」：
保持人物身份（脸型/肤色/发型），重打光（三点影棚光）、换背景（中性渐变）、
修着装（整洁专业），输出可下载/可直接用作简历头像的图片。

设计要点（与 JadeAI 对齐，且适配本项目）
----
1. **用户自带 API Key**：Key 由前端存在 localStorage，每次生成随请求上传，
   服务端不落库、不记日志——密钥绝不进数据库（PIPL/最小必要原则）。
2. **Provider 抽象**：目前实现 Gemini（Nano Banana 图像编辑）；
   :data:`GEMINI_MODEL` 可经 settings 覆盖。后续接百炼图像编辑模型时
   只需新增一个 provider 函数，API 层不变。
3. **显式错误分类**：invalid_key / safety_filtered / generate_failed，
   前端按码给文案，不把上游原始响应丢给用户。
4. **参数后处理**：宽高比与「额外要求」在服务端拼进最终提示词
   （JadeAI 同款做法），前端只传基础提示词，避免客户端绕过校验。
"""

from __future__ import annotations

import base64
import binascii
import logging
from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

__all__ = [
    "AiPhotoError",
    "AiPhotoResult",
    "GEMINI_ENDPOINT",
    "parse_data_url",
    "build_final_prompt",
    "generate_professional_photo",
]

#: Gemini 生成式图像接口（Nano Banana 系；JadeAI 使用的同族端点）
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

#: 合法宽高比（与前端 Segmented 选项一致；1:1 时不追加提示词，保持提示词干净）
ASPECT_RATIOS: tuple[str, ...] = ("1:1", "3:4", "2:3", "4:3")

#: 解码后图片大小上限（Gemini inlineData 限制 + 防滥用）
_MAX_IMAGE_BYTES = 8 * 1024 * 1024

#: 上游超时（秒）。图像生成通常 10-30s，留足余量但不无限挂死请求
_UPSTREAM_TIMEOUT = 120.0

ErrorCode = Literal["invalid_key", "safety_filtered", "generate_failed"]


class AiPhotoError(Exception):
    """AI 职业照生成的显式失败（code 供前端分流文案）。"""

    def __init__(self, code: ErrorCode, message: str, *, status: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class AiPhotoResult:
    """生成结果：图片以 dataURL 形式返回（与上传形态对称，前端可直接用于 <img>）。"""

    image: str
    text: str | None = None


def parse_data_url(image: str) -> tuple[str, str]:
    """把 dataURL 拆成 (mimeType, base64)。

    容错：不是标准 dataURL 时按 JPEG 裸 base64 处理（JadeAI 同款宽容策略）。

    Raises:
        AiPhotoError: 不是字符串 / 为空 / base64 解码失败 / 超过大小上限
    """
    if not isinstance(image, str) or not image.strip():
        raise AiPhotoError("generate_failed", "图片数据为空", status=400)

    raw = image.strip()
    mime = "image/jpeg"
    b64 = raw
    if raw.startswith("data:"):
        # data:image/png;base64,XXXX
        head, _, data = raw.partition(",")
        if not data:
            raise AiPhotoError("generate_failed", "图片数据格式不正确", status=400)
        semi = head.find(";")
        if semi > 5:
            mime = head[5:semi]
        b64 = data

    try:
        decoded = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError) as e:
        raise AiPhotoError("generate_failed", f"图片 base64 解码失败: {e}", status=400) from e

    if len(decoded) > _MAX_IMAGE_BYTES:
        raise AiPhotoError(
            "generate_failed",
            f"图片过大（解码后 {len(decoded) // 1024}KB，上限 {_MAX_IMAGE_BYTES // 1024 // 1024}MB）",
            status=400,
        )
    if not decoded:
        raise AiPhotoError("generate_failed", "图片内容为空", status=400)

    return mime, b64


def build_final_prompt(prompt: str, aspect_ratio: str | None, requirements: str | None) -> str:
    """组装最终提示词：基础提示词 + 宽高比 + 额外要求（JadeAI 同款策略）。"""
    final = (prompt or "").strip()
    if not final:
        raise AiPhotoError("generate_failed", "提示词不能为空", status=400)

    ratio = (aspect_ratio or "").strip()
    if ratio and ratio != "1:1":
        if ratio not in ASPECT_RATIOS:
            raise AiPhotoError("generate_failed", f"不支持的宽高比: {ratio}", status=400)
        final += f"\n\nOutput image aspect ratio: {ratio} (width:height)."

    extra = (requirements or "").strip()
    if extra:
        final += f"\n\nAdditional requirements: {extra}"

    return final


def _extract_result(data: dict) -> AiPhotoResult:
    """从 Gemini 响应里提取图片与文本（兼容 camelCase / snake_case）。"""
    candidates = data.get("candidates") or []
    if not candidates:
        raise AiPhotoError("generate_failed", "上游未返回候选结果")

    candidate = candidates[0]
    finish_reason = candidate.get("finishReason") or candidate.get("finish_reason")
    if finish_reason == "SAFETY":
        raise AiPhotoError("safety_filtered", "图片被安全策略拦截，请更换照片或调整要求", status=400)

    parts = (candidate.get("content") or {}).get("parts") or []
    result_image: str | None = None
    result_text: str | None = None
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            data_b64 = inline.get("data") or ""
            if data_b64:
                result_image = f"data:{mime};base64,{data_b64}"
        if part.get("text"):
            result_text = part["text"]

    if not result_image:
        # 无图但有文本：通常是模型拒绝了请求，把文本带回前端便于排查
        hint = (result_text or "").strip()[:200]
        raise AiPhotoError("generate_failed", f"上游未返回图片{('：' + hint) if hint else ''}")

    return AiPhotoResult(image=result_image, text=result_text)


async def generate_professional_photo(
    *,
    image: str,
    prompt: str,
    requirements: str | None = None,
    aspect_ratio: str | None = "1:1",
    api_key: str,
    model: str | None = None,
) -> AiPhotoResult:
    """调用图像编辑模型生成职业照。

    Args:
        image: 用户照片的 dataURL（或裸 base64）
        prompt: 基础提示词（身份保持/影棚光/背景/着装的专业化描述）
        requirements: 用户追加要求（可选）
        aspect_ratio: 输出宽高比（1:1/3:4/2:3/4:3）
        api_key: 用户自带的上游 Key（Gemini API Key）
        model: 覆盖默认模型（settings.AI_PHOTO_MODEL）

    Returns:
        AiPhotoResult（image 为 dataURL）

    Raises:
        AiPhotoError: invalid_key / safety_filtered / generate_failed
    """
    if not api_key or not api_key.strip():
        raise AiPhotoError("invalid_key", "未提供 API Key", status=400)

    mime, b64 = parse_data_url(image)
    final_prompt = build_final_prompt(prompt, aspect_ratio, requirements)
    use_model = (model or settings.AI_PHOTO_MODEL).strip()
    url = GEMINI_ENDPOINT.format(model=use_model)

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": final_prompt},
                    {"inlineData": {"mimeType": mime, "data": b64}},
                ],
            },
        ],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }

    try:
        async with httpx.AsyncClient(timeout=_UPSTREAM_TIMEOUT) as client:
            resp = await client.post(
                url,
                params={"key": api_key.strip()},
                json=payload,
                headers={"Content-Type": "application/json"},
            )
    except httpx.TimeoutException as e:
        raise AiPhotoError("generate_failed", "上游生成超时，请重试", status=504) from e
    except httpx.HTTPError as e:
        raise AiPhotoError("generate_failed", f"上游连接失败: {type(e).__name__}", status=502) from e

    if resp.status_code >= 400:
        body = resp.text[:300]
        logger.warning("[AI职业照] 上游错误 status=%s body=%s", resp.status_code, body)
        if resp.status_code in (400, 403):
            raise AiPhotoError("invalid_key", "API Key 无效或已过期", status=400)
        raise AiPhotoError("generate_failed", f"上游返回 {resp.status_code}", status=502)

    try:
        data = resp.json()
    except ValueError as e:
        raise AiPhotoError("generate_failed", "上游响应不是合法 JSON", status=502) from e

    return _extract_result(data)
