import json
import base64
import logging
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.prompts.job_parse import JOB_PARSE_SYSTEM_PROMPT, JOB_PARSE_FROM_OCR_PROMPT

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def _safe_chat_completion(client: AsyncOpenAI, **kwargs):
    """调用 chat completion，自动处理 response_format 不兼容的情况"""
    try:
        return await client.chat.completions.create(**kwargs)
    except Exception as e:
        error_msg = str(e).lower()
        if "response_format" in error_msg or "json_object" in error_msg:
            kwargs.pop("response_format", None)
            logger.warning("API 不支持 response_format，已去掉该参数重试")
            return await client.chat.completions.create(**kwargs)
        raise


async def parse_job_from_bytes(content: bytes, filename: str = "", use_ocr_fallback: bool = False) -> dict:
    if not has_valid_api_key():
        return _mock_job_parse()

    b64 = base64.b64encode(content).decode("utf-8")
    ext = filename.split(".")[-1].lower() if filename else "png"
    mime = f"image/{ext.replace('jpg', 'jpeg')}"

    # 强制使用 OCR 模式
    if use_ocr_fallback:
        ocr_text = await _ocr_extract(content)
        if ocr_text.startswith("[") and "未启用" in ocr_text:
            raise ValueError(
                "本地 OCR 未启用。请在 .env 中设置 USE_LOCAL_OCR=true（需安装 paddleocr），"
                "或使用支持 vision 的模型。"
            )
        resp = await _safe_chat_completion(
            _get_client(),
            model=settings.LLM_MODEL_TEXT,
            messages=[
                {"role": "user", "content": JOB_PARSE_FROM_OCR_PROMPT.format(ocr_text=ocr_text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
        return {"ocr_text": ocr_text, "parsed_job_json": parsed}

    # 默认路径：尝试 vision 模型
    try:
        data_url = f"data:{mime};base64,{b64}"
        resp = await _get_client().chat.completions.create(
            model=settings.LLM_MODEL_VISION,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": JOB_PARSE_SYSTEM_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
        return {"parsed_job_json": parsed, "ocr_text": None}
    except Exception as e:
        error_msg = str(e).lower()
        logger.warning(f"视觉模型调用失败，尝试 OCR fallback: {e}")
        # API Key / 认证错误 → 直接报错，不尝试 fallback
        if "401" in error_msg or "invalid_key" in error_msg or "unauthorized" in error_msg or "api_key" in error_msg:
            raise ValueError(
                f"LLM API Key 无效或已过期，请检查 backend/.env 中的 LLM_API_KEY。原始错误: {e}"
            )
        # vision 失败，尝试 OCR fallback
        ocr_text = await _ocr_extract(content)
        if ocr_text.startswith("[") and ("未启用" in ocr_text or "未安装" in ocr_text):
            # OCR 也不可用，抛出明确错误
            raise ValueError(
                f"无法解析岗位图片：视觉模型不支持当前 API，本地 OCR 也未启用。"
                f"请在 .env 中设置 USE_LOCAL_OCR=true（需安装 paddleocr），"
                f"或使用支持 vision 的模型（如 gpt-4o）。原始错误: {e}"
            )
        resp = await _safe_chat_completion(
            _get_client(),
            model=settings.LLM_MODEL_TEXT,
            messages=[
                {"role": "user", "content": JOB_PARSE_FROM_OCR_PROMPT.format(ocr_text=ocr_text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
        return {"ocr_text": ocr_text, "parsed_job_json": parsed}


async def _ocr_extract(image_bytes: bytes) -> str:
    if not settings.USE_LOCAL_OCR:
        return "[本地OCR未启用，请在 .env 中设置 USE_LOCAL_OCR=true 并安装 paddleocr]"
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        result = ocr.ocr(tmp_path, cls=True)
        os.unlink(tmp_path)
        lines = []
        if result and result[0]:
            for line in result[0]:
                lines.append(line[1][0])
        return "\n".join(lines)
    except ImportError:
        return "[PaddleOCR 未安装，请运行 pip install paddleocr paddlepaddle 或启用 USE_LOCAL_OCR]"
    except Exception as e:
        return f"[OCR failed: {e}]"


_MOCK_JOB_JSON = {
    "title": "高级 Python 后端工程师",
    "company": "某头部互联网公司",
    "salary_range": "30K-50K",
    "location": "北京",
    "must_have": {
        "skills": ["Python", "FastAPI / Django", "PostgreSQL", "Redis", "Docker"],
        "experience": "3-5年",
        "education": "本科及以上",
    },
    "nice_to_have": {
        "skills": ["Kubernetes", "消息队列", "微服务架构"],
        "qualifications": ["有高并发系统经验", "开源项目贡献者"],
    },
    "responsibilities": ["负责后端核心系统设计与开发", "参与系统架构优化，提升系统性能和稳定性", "编写技术文档，指导初中级工程师"],
    "soft_skills": ["沟通能力", "团队合作", "主动性强"],
    "industry": "互联网",
    "original_text": "[Mock Mode] 模拟岗位需求文本",
}


def _mock_job_parse() -> dict:
    return {"parsed_job_json": _MOCK_JOB_JSON, "ocr_text": None}
