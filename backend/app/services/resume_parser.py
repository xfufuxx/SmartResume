import json
import base64
import asyncio
import logging
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.prompts.resume_parse import RESUME_PARSE_SYSTEM_PROMPT, RESUME_PARSE_USER_PROMPT

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def _safe_chat_completion(client: AsyncOpenAI, **kwargs):
    """调用 chat completion，带重试和 response_format 自动降级"""
    kwargs.setdefault("timeout", 60.0)
    kwargs.setdefault("temperature", 0.2)  # 简历解析需稳定、可复现，默认低温
    last_error = None
    for attempt in range(3):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            last_error = e
            error_msg = str(e).lower()
            if "response_format" in error_msg or "json_object" in error_msg:
                kwargs.pop("response_format", None)
                logger.warning("API 不支持 response_format，已去掉该参数重试")
                try:
                    return await client.chat.completions.create(**kwargs)
                except Exception as e2:
                    last_error = e2
            if attempt < 2:
                await asyncio.sleep(1 * (attempt + 1))
    raise last_error


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)

        # 如果文本提取为空（图片型 PDF），尝试 OCR 兜底
        if not text.strip():
            logger.info("PyMuPDF 文本提取为空，尝试 OCR 兜底（图片型 PDF）")
            ocr_text = await _ocr_pdf_fallback(doc)
            doc.close()
            return ocr_text

        doc.close()
        return text
    except ImportError:
        raise ImportError("PyMuPDF (fitz) 未安装，请运行 pip install PyMuPDF")


async def _ocr_pdf_fallback(doc) -> str:
    """对图片型 PDF 逐页进行 OCR 识别"""
    all_texts: list[str] = []

    for page_idx, page in enumerate(doc):
        try:
            # 渲染页面为图片
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")

            # 先尝试视觉模型
            try:
                page_text = await _ocr_page_with_vision(img_bytes)
                if page_text and page_text.strip():
                    all_texts.append(page_text)
                    continue
            except Exception as e:
                logger.warning(f"第 {page_idx+1} 页视觉模型 OCR 失败: {e}")

            # 视觉模型失败，尝试本地 OCR
            ocr_result = await _ocr_fallback(img_bytes)
            if ocr_result and not ocr_result.startswith("["):
                all_texts.append(ocr_result)
            else:
                logger.warning(f"第 {page_idx+1} 页 OCR 失败: {ocr_result}")
        except Exception as e:
            logger.warning(f"第 {page_idx+1} 页渲染/OCR 异常: {e}")

    combined = "\n".join(all_texts)
    if not combined.strip():
        raise ValueError(
            "无法从 PDF 中提取文字内容。该 PDF 可能是图片型文档，且 OCR 识别失败。"
            "请确保：1) 视觉模型 API 可用；或 2) 在 .env 中设置 USE_LOCAL_OCR=true 并安装 PaddleOCR。"
        )
    return combined


async def _ocr_page_with_vision(img_bytes: bytes) -> str:
    """使用视觉模型识别单页图片中的文字"""
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64}"

    client = _get_client()
    resp = await client.chat.completions.create(
        model=settings.LLM_MODEL_VISION,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请从这张简历图片中提取所有文字内容，保持原有的格式和结构。"},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        temperature=0.2,
        max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


async def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
        import io
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        raise ImportError("python-docx 未安装，请运行 pip install python-docx")


async def extract_text_from_image(file_bytes: bytes) -> str:
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model=settings.LLM_MODEL_VISION,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请从图片中提取所有文字内容。"},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            temperature=0.2,
            max_tokens=4096,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        error_msg = str(e).lower()
        logger.warning(f"视觉模型调用失败: {e}")
        # API Key / 认证错误 → 直接报错，不尝试 fallback
        if "401" in error_msg or "invalid_key" in error_msg or "unauthorized" in error_msg or "api_key" in error_msg:
            raise ValueError(
                f"LLM API Key 无效或已过期，请检查 backend/.env 中的 LLM_API_KEY。原始错误: {e}"
            )
        # 视觉不支持 → 尝试 OCR fallback
        if any(kw in error_msg for kw in ["image input", "vision", "not support", "unsupported"]):
            ocr_result = await _ocr_fallback(file_bytes)
            if not ocr_result.startswith("["):
                return ocr_result
        # 其他错误也尝试 OCR fallback
        ocr_result = await _ocr_fallback(file_bytes)
        if not ocr_result.startswith("["):
            return ocr_result
        # OCR 也不可用，抛出明确错误
        raise ValueError(
            f"无法解析图片内容：视觉模型调用失败，本地 OCR 未启用。"
            f"请在 .env 中设置 USE_LOCAL_OCR=true（需安装 paddleocr），或使用支持 vision 的模型。"
            f"原始错误: {e}"
        )


async def _ocr_fallback(image_bytes: bytes) -> str:
    if not settings.USE_LOCAL_OCR:
        return "[本地OCR未启用]"
    try:
        from paddleocr import PaddleOCR
        ocr = await asyncio.to_thread(PaddleOCR, use_angle_cls=True, lang="ch", show_log=False)
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        result = await asyncio.to_thread(ocr.ocr, tmp_path, cls=True)
        os.unlink(tmp_path)
        lines = []
        if result and result[0]:
            for line in result[0]:
                lines.append(line[1][0])
        return "\n".join(lines) if lines else "[OCR 未能提取到文字]"
    except ImportError:
        return "[OCR 不可用，请安装 PaddleOCR 或使用视觉模型解析]"
    except Exception as e:
        return f"[OCR 提取失败: {e}]"


async def parse_resume_from_bytes(content: bytes, filename: str = "") -> dict:
    if not has_valid_api_key():
        return _mock_resume_parse()
    ext = filename.split(".")[-1].lower() if filename else ""

    if ext == "pdf":
        raw_text = await extract_text_from_pdf(content)
    elif ext == "docx":
        raw_text = await extract_text_from_docx(content)
    elif ext in ("png", "jpg", "jpeg", "webp"):
        raw_text = await extract_text_from_image(content)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    # 检查提取的文本是否为空
    if not raw_text or not raw_text.strip():
        raise ValueError(
            f"简历内容为空，无法解析。{ext.upper()} 文件可能为纯图片格式，"
            "请确保：1) 视觉模型 API 可用；2) 或在 .env 中设置 USE_LOCAL_OCR=true 并安装 PaddleOCR"
        )

    try:
        client = _get_client()
        resp = await _safe_chat_completion(
            client,
            model=settings.LLM_MODEL_TEXT,
            messages=[
                {"role": "system", "content": RESUME_PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": RESUME_PARSE_USER_PROMPT.format(raw_text=raw_text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
        return {"raw_text": raw_text, "parsed_json": parsed}
    except Exception as e:
        error_msg = str(e).lower()
        if any(kw in error_msg for kw in ["401", "invalid_key", "unauthorized", "api_key", "invalid api key"]):
            logger.warning("LLM API Key 无效，使用 Mock 数据代替")
            return _mock_resume_parse()
        raise


_MOCK_RESUME_JSON = {
    "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"},
    "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。",
    "experience": [
        {
            "company": "星辰科技",
            "title": "高级后端工程师",
            "start": "2021-03",
            "end": "2024-12",
            "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"],
        },
        {
            "company": "云帆软件",
            "title": "后端开发工程师",
            "start": "2019-07",
            "end": "2021-02",
            "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"],
        },
    ],
    "education": [{"school": "华中科技大学", "degree": "本科", "major": "计算机科学与技术", "start": "2015-09", "end": "2019-06"}],
    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"],
    "projects": [
        {"name": "智能简历优化平台", "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"]},
    ],
}


async def parse_resume_text(text: str) -> dict:
    """直接解析简历文本（无需文件），返回 parsed_json"""
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY 未配置或未生效，无法解析简历。请检查 backend/.env 中的 LLM_API_KEY。")

    if not text or not text.strip():
        raise ValueError("简历文本为空，无法解析")

    try:
        client = _get_client()
        resp = await _safe_chat_completion(
            client,
            model=settings.LLM_MODEL_TEXT,
            messages=[
                {"role": "system", "content": RESUME_PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": RESUME_PARSE_USER_PROMPT.format(raw_text=text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:
        error_msg = str(e).lower()
        if any(kw in error_msg for kw in ["401", "invalid_key", "unauthorized", "api_key", "invalid api key"]):
            logger.warning("LLM API Key 无效，parse_resume_text 使用 Mock 数据代替")
            return _MOCK_RESUME_JSON
        raise


def _mock_resume_parse() -> dict:
    return {"raw_text": "[Mock Mode] 模拟简历文本内容", "parsed_json": _MOCK_RESUME_JSON}
