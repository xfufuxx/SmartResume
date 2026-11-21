import json
import base64
import asyncio
import logging
import os
import tempfile
from openai import AsyncOpenAI

from app.config import settings
from app.services import ensure_mock_allowed, has_valid_api_key
from app.prompts.resume_parse import RESUME_PARSE_SYSTEM_PROMPT, RESUME_PARSE_USER_PROMPT
from app.core.llm_policy import (
    check_before_call,
    resolve_model,
    PaidCallBlocked,
)

logger = logging.getLogger(__name__)


class ResumeNoTextError(ValueError):
    """文件中未能提取到任何文字（含视觉模型与本地 OCR 兜底均失败）。

    单独建异常类，便于上传接口区分「文件本身没文字」和「解析服务故障」，
    给用户可操作的建议，而不是笼统甩一句「请尝试更清晰的 PDF」。
    """


# 2026-11-14 实测：这两个文本模型同时支持 image_url 图文输入，且仍在免费额度内。
# 当配置的 LLM_MODEL_VISION 因额度耗尽 / 下架返回 403、404 时按序自动降级。
# 控制台「视觉专用模型」免费额度已耗尽，故视觉链路复用多模态文本模型。
VISION_FALLBACK_MODELS: tuple[str, ...] = ("qwen3.8-flash", "qwen3.8-max-0902")

# 文本层短于此值视为「疑似图片型 PDF」：很多设计工具导出的简历只有页眉/水印
# 等少量文字，光靠 get_text() 会得到几乎空白的内容，必须补 OCR。
MIN_TEXT_LAYER_CHARS = 50

# OCR 页数上限：逐页渲染 + 视觉/本地 OCR 很慢，避免超大扫描件把请求挂死。
MAX_OCR_PAGES = 10

# 视觉模型首次加载本地 OCR 引擎开销大，进程内复用实例。
_OCR_ENGINE = None
_OCR_ENGINE_FAILED = False

_NON_RETRYABLE_STATUS = (400, 401, 403, 404, 422)


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


def _vision_candidates() -> list[str]:
    """视觉模型候选（按优先级去重）。

    1. 先经 llm_policy 解析：开启自动降级时会把已过期/付费模型换成免费替补；
    2. 追加实测可用的多模态模型；
    3. 最后保留配置值兜底（万一静态清单过期但配置模型其实还能用）。
    """
    configured = settings.LLM_MODEL_VISION
    try:
        resolved, note = resolve_model(configured, kind="vision")
        if note:
            logger.info("[视觉模型降级] %s", note)
    except Exception as e:
        logger.warning("视觉模型策略解析失败，改用配置值: %s", e)
        resolved = configured

    ordered = [resolved, *VISION_FALLBACK_MODELS, configured]
    result: list[str] = []
    for model in ordered:
        if model and model not in result:
            result.append(model)
    return result


async def _safe_chat_completion(client: AsyncOpenAI, **kwargs):
    """调用 chat completion，带重试和 response_format 自动降级。

    403/401/404 等确定性错误不重试（模型额度耗尽时重试三次只是白等）。
    """
    kwargs.setdefault("timeout", 60.0)
    kwargs.setdefault("temperature", 0.2)  # 简历解析需稳定、可复现，默认低温
    last_error = None
    for attempt in range(3):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            last_error = e
            status = getattr(e, "status_code", None)
            if status in _NON_RETRYABLE_STATUS:
                raise
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


def _parse_llm_json(content: str | None) -> dict:
    """健壮解析 LLM 返回的 JSON：容忍 markdown 代码块、前后说明文字、空内容。"""
    if not content or not content.strip():
        raise ValueError("模型返回内容为空（可能是思考模型或输出被截断）")
    text = content.strip()
    if text.startswith("```"):
        text = text[3:]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
        text = text.rsplit("```", 1)[0]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        import fitz
    except ImportError as e:
        raise ImportError("PyMuPDF (fitz) 未安装，请运行 pip install PyMuPDF") from e

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise ResumeNoTextError("PDF 无法打开，文件可能已损坏或受密码保护，请重新导出后上传") from e

    try:
        if getattr(doc, "needs_pass", False):
            raise ResumeNoTextError("该 PDF 受密码保护，请先解除密码或另存为无密码版本")
        try:
            text = "\n".join(page.get_text() for page in doc)
        except Exception as e:
            logger.warning("PDF 文本层读取失败，转 OCR 兜底: %s", e)
            text = ""

        if len(text.strip()) >= MIN_TEXT_LAYER_CHARS:
            return text

        # 文本层为空或过短 → 图片型/扫描件，走视觉识别 + 本地 OCR
        logger.info("PDF 文本层仅 %d 字，判定为图片型，启动 OCR 兜底", len(text.strip()))
        ocr_text = await _ocr_pdf_fallback(doc)
        return f"{text}\n{ocr_text}" if text.strip() else ocr_text
    finally:
        doc.close()


async def _ocr_pdf_fallback(doc) -> str:
    """对图片型 PDF 逐页识别：视觉模型优先，本地 OCR 兜底。"""
    import fitz  # noqa: F401  (doc 由调用方传入，保持类型一致)

    all_texts: list[str] = []
    pages = min(doc.page_count, MAX_OCR_PAGES)
    if doc.page_count > MAX_OCR_PAGES:
        logger.warning("PDF 共 %d 页，仅识别前 %d 页", doc.page_count, MAX_OCR_PAGES)

    for page_idx in range(pages):
        page = doc[page_idx]
        try:
            img_bytes = page.get_pixmap(dpi=200).tobytes("png")
            try:
                page_text = await _vision_chat(img_bytes, "请从这张简历图片中提取所有文字内容，保持原有的格式和结构。")
                if page_text and page_text.strip():
                    all_texts.append(page_text)
                    continue
            except Exception as e:
                logger.warning("第 %d 页视觉识别失败，转本地 OCR: %s", page_idx + 1, e)

            local = await _ocr_fallback(img_bytes)
            if local and local.strip():
                all_texts.append(local)
            else:
                logger.warning("第 %d 页本地 OCR 也无结果", page_idx + 1)
        except Exception as e:
            logger.warning("第 %d 页渲染/OCR 异常: %s", page_idx + 1, e)

    combined = "\n".join(all_texts).strip()
    if not combined:
        raise ResumeNoTextError(
            "这份 PDF 没有可识别的文字层（扫描件或图片导出），且自动文字识别未能取得内容。"
        )
    return combined


async def _vision_chat(img_bytes: bytes, prompt: str) -> str:
    """按候选列表调用视觉模型；额度耗尽/模型下架时自动切换到下一个。"""
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64}"
    client = _get_client()
    last_error: Exception | None = None

    for model in _vision_candidates():
        try:
            # 计费守卫：仅免费额度模式下，跳过已过期/付费模型而不是直接发请求
            check_before_call(model, "简历图片识别")
        except PaidCallBlocked as e:
            logger.info("视觉模型 %s 被计费策略跳过: %s", model, e)
            continue
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }],
                temperature=0.2,
                max_tokens=4096,
                timeout=60.0,
            )
            content = resp.choices[0].message.content or ""
            if not content.strip():
                raise ValueError("视觉模型返回空内容")
            logger.info("视觉识别成功: model=%s, %d 字", model, len(content))
            return content
        except Exception as e:
            last_error = e
            status = getattr(e, "status_code", None)
            msg = str(e).lower()
            switchable = status in (401, 403, 404, 429) or any(
                kw in msg for kw in ("quota", "not exist", "unauthorized", "403", "404")
            )
            logger.warning("视觉模型 %s 调用失败(%s)，%s", model, type(e).__name__,
                           "切换下一候选" if switchable else "不再降级")
            if not switchable:
                raise
    if last_error:
        raise last_error
    raise ResumeNoTextError("没有可用的视觉识别模型")


async def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
        import io
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError as e:
        raise ImportError("python-docx 未安装，请运行 pip install python-docx") from e


async def extract_text_from_image(file_bytes: bytes) -> str:
    try:
        text = await _vision_chat(file_bytes, "请从图片中提取所有文字内容，保持原有结构。")
        if text and text.strip():
            return text
    except Exception as e:
        logger.warning("视觉模型识别失败，转本地 OCR: %s", e)

    local = await _ocr_fallback(file_bytes)
    if local and local.strip():
        return local
    raise ResumeNoTextError("图片中未能识别出文字，请上传文字清晰的图片，或改用带文字层的 PDF / Word 文档")


def _parse_ocr_result(result) -> str:
    """兼容 PaddleOCR 3.x（list[dict] + rec_texts）与 2.x（嵌套 list）返回结构。"""
    lines: list[str] = []
    if not result:
        return ""
    for item in result:
        if isinstance(item, dict):
            texts = item.get("rec_texts")
            if isinstance(texts, (list, tuple)):
                lines.extend(str(t).strip() for t in texts if t and str(t).strip())
            continue
        if isinstance(item, (list, tuple)):
            for line in item:
                if isinstance(line, (list, tuple)) and len(line) >= 2:
                    rec = line[1]
                    text = rec[0] if isinstance(rec, (list, tuple)) and rec else rec
                    if isinstance(text, str) and text.strip():
                        lines.append(text.strip())
    return "\n".join(lines).strip()


def _get_ocr_engine():
    """构造并缓存 PaddleOCR 实例（首次加载模型约需数十秒，务必复用）。"""
    global _OCR_ENGINE, _OCR_ENGINE_FAILED
    if _OCR_ENGINE is not None or _OCR_ENGINE_FAILED:
        return _OCR_ENGINE
    from paddleocr import PaddleOCR
    try:
        # 3.x：use_angle_cls / show_log 已移除；默认 mkldnn 在部分 paddle 版本
        # 会抛 ConvertPirAttribute2RuntimeAttribute NotImplementedError，需关闭。
        _OCR_ENGINE = PaddleOCR(lang="ch", enable_mkldnn=False)
    except TypeError:
        # 2.x 兼容
        _OCR_ENGINE = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    return _OCR_ENGINE


async def _ocr_fallback(image_bytes: bytes) -> str:
    """本地 OCR。成功返回文字，不可用/失败返回空串（不再用 [xxx] 标记，便于调用方判断）。"""
    global _OCR_ENGINE_FAILED
    if not settings.USE_LOCAL_OCR:
        return ""
    tmp_path = None
    try:
        engine = await asyncio.to_thread(_get_ocr_engine)
        if engine is None:
            return ""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        result = await asyncio.to_thread(engine.ocr, tmp_path)
        return _parse_ocr_result(result)
    except ImportError:
        logger.warning("PaddleOCR 未安装，本地 OCR 不可用")
        _OCR_ENGINE_FAILED = True
        return ""
    except Exception as e:
        logger.warning("本地 OCR 失败: %s: %s", type(e).__name__, e)
        return ""
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


async def parse_resume_from_bytes(content: bytes, filename: str = "") -> dict:
    if not has_valid_api_key():
        ensure_mock_allowed("简历解析")
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

    if not raw_text or not raw_text.strip():
        raise ResumeNoTextError(f"{ext.upper()} 中没有可读取的文字内容")

    try:
        client = _get_client()
        model, note = resolve_model(settings.LLM_MODEL_TEXT)
        if note:
            logger.warning("[模型降级] %s", note)
        check_before_call(model, "简历解析", retry_budget=3)
        resp = await _safe_chat_completion(
            client,
            model=model,
            messages=[
                {"role": "system", "content": RESUME_PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": RESUME_PARSE_USER_PROMPT.format(raw_text=raw_text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        parsed = _parse_llm_json(resp.choices[0].message.content)
        return {"raw_text": raw_text, "parsed_json": parsed}
    except PaidCallBlocked:
        raise
    except Exception as e:
        error_msg = str(e).lower()
        if any(kw in error_msg for kw in ["401", "invalid_key", "unauthorized", "api_key", "invalid api key"]):
            logger.warning("LLM API Key 无效，使用 Mock 数据代替")
            ensure_mock_allowed("简历解析")
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
    "certificates": ["CET-6", "软考中级·软件设计师"],
    "projects": [
        {"name": "智能简历优化平台", "role": "核心开发", "start": "2023-03", "end": "2023-12", "points": ["基于 FastAPI + React 构建简历解析与优化系统，支持 PDF 生成", "接入视觉模型实现简历版面识别，解析准确率达 95%"]},
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
        model, note = resolve_model(settings.LLM_MODEL_TEXT)
        if note:
            logger.warning("[模型降级] %s", note)
        check_before_call(model, "简历文本解析", retry_budget=3)
        resp = await _safe_chat_completion(
            client,
            model=model,
            messages=[
                {"role": "system", "content": RESUME_PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": RESUME_PARSE_USER_PROMPT.format(raw_text=text)},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )
        return _parse_llm_json(resp.choices[0].message.content)
    except Exception as e:
        error_msg = str(e).lower()
        if any(kw in error_msg for kw in ["401", "invalid_key", "unauthorized", "api_key", "invalid api key"]):
            logger.warning("LLM API Key 无效，parse_resume_text 使用 Mock 数据代替")
            ensure_mock_allowed("简历解析")
            return _MOCK_RESUME_JSON
        raise


def _mock_resume_parse() -> dict:
    return {"raw_text": "[Mock Mode] 模拟简历文本内容", "parsed_json": _MOCK_RESUME_JSON}
