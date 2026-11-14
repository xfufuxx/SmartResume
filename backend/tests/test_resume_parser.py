"""简历上传/解析链路回归测试（2026-11-14「上传 PDF 无效」修复）。

背景：图片型 PDF 的文本层为空 → OCR 兜底，而当时
  1) 配置的视觉模型免费额度耗尽返回 403；
  2) 本地 OCR 仍按 PaddleOCR 2.x API 调用（show_log / use_angle_cls），
     在 3.5.0 上直接抛 Unknown argument；
  3) 上传接口把全部异常吞成「请尝试更清晰的 PDF」这一句误导文案。
本文件锁定修复后的行为，防止回退。
"""
import asyncio
import json

import pytest

from app.services import resume_parser as rp
from app.core.errors import ERRORS, app_err
from app.core.llm_policy import PaidCallBlocked
from app.api.resumes import _classify_parse_error


def _pdf_with_text(text: str) -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=595, height=300)
    y = 60
    for line in text.splitlines():
        page.insert_text((50, y), line, fontsize=11)
        y += 20
    data = doc.tobytes()
    doc.close()
    return data


def _image_only_pdf() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=595, height=300)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 40))
    pix.set_rect(pix.irect, (255, 255, 255))
    page.insert_image(fitz.Rect(50, 50, 500, 250), pixmap=pix)
    data = doc.tobytes()
    doc.close()
    return data


# ── PaddleOCR 返回结构兼容 ──────────────────────────────────────

def test_parse_ocr_result_paddleocr_3x():
    result = [{"input_path": "x.png", "rec_texts": ["张三", "软件工程师"], "rec_scores": [0.99, 0.98]}]
    assert rp._parse_ocr_result(result) == "张三\n软件工程师"


def test_parse_ocr_result_paddleocr_2x():
    result = [[
        [[[0, 0], [1, 0], [1, 1], [0, 1]], ("张三", 0.99)],
        [[[0, 0], [1, 0], [1, 1], [0, 1]], ("软件工程师", 0.98)],
    ]]
    assert rp._parse_ocr_result(result) == "张三\n软件工程师"


def test_parse_ocr_result_empty():
    assert rp._parse_ocr_result(None) == ""
    assert rp._parse_ocr_result([{"rec_texts": []}]) == ""


# ── LLM JSON 健壮解析 ───────────────────────────────────────────

def test_parse_llm_json_plain():
    assert rp._parse_llm_json('{"name": "张三"}') == {"name": "张三"}


def test_parse_llm_json_markdown_fence():
    assert rp._parse_llm_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_llm_json_surrounding_text():
    assert rp._parse_llm_json('好的，结果如下：{"b": 2} 完毕') == {"b": 2}


def test_parse_llm_json_rejects_empty_and_garbage():
    with pytest.raises(ValueError):
        rp._parse_llm_json(None)
    with pytest.raises(ValueError):
        rp._parse_llm_json("   ")
    with pytest.raises(json.JSONDecodeError):
        rp._parse_llm_json("完全不是 JSON")


# ── 视觉模型候选 / 降级 ─────────────────────────────────────────

def test_vision_candidates_include_working_fallbacks(monkeypatch):
    monkeypatch.setattr(rp.settings, "LLM_MODEL_VISION", "already-expired-model")
    candidates = rp._vision_candidates()
    assert "qwen3.8-flash" in candidates
    assert "qwen3.8-max-0902" in candidates
    assert len(candidates) == len(set(candidates)), "候选列表必须去重"
    assert candidates, "至少应有一个候选"


def test_non_retryable_error_is_not_retried():
    calls = {"n": 0}

    class _Completions:
        async def create(self, **kwargs):
            calls["n"] += 1
            err = RuntimeError("403 Free quota exhausted")
            err.status_code = 403
            raise err

    class _Client:
        def __init__(self):
            self.chat = type("_Chat", (), {})()
            self.chat.completions = _Completions()

    with pytest.raises(RuntimeError):
        asyncio.run(rp._safe_chat_completion(_Client(), model="m", messages=[]))
    assert calls["n"] == 1, "403 属确定性错误，不应白等三次重试"


# ── PDF 文本层判定 ──────────────────────────────────────────────

def test_text_pdf_skips_ocr(monkeypatch):
    async def _must_not_run(doc):
        raise AssertionError("带完整文字层的 PDF 不应触发 OCR")

    monkeypatch.setattr(rp, "_ocr_pdf_fallback", _must_not_run)
    text = ("ZHANG SAN Senior Software Engineer\n"
            "Python FastAPI PostgreSQL Redis Docker\n"
            "5 years backend experience, Team lead")
    out = asyncio.run(rp.extract_text_from_pdf(_pdf_with_text(text)))
    assert "ZHANG SAN" in out
    assert "FastAPI" in out


def test_short_text_layer_triggers_ocr(monkeypatch):
    called = {"n": 0}

    async def _fake_ocr(doc):
        called["n"] += 1
        return "OCR 识别出的正文内容"

    monkeypatch.setattr(rp, "_ocr_pdf_fallback", _fake_ocr)
    out = asyncio.run(rp.extract_text_from_pdf(_image_only_pdf()))
    assert called["n"] == 1
    assert "OCR 识别出的正文内容" in out


def test_corrupt_pdf_raises_actionable_error():
    with pytest.raises(rp.ResumeNoTextError):
        asyncio.run(rp.extract_text_from_pdf(b"%PDF-this-is-not-a-real-pdf"))


def test_local_ocr_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr(rp.settings, "USE_LOCAL_OCR", False)
    assert asyncio.run(rp._ocr_fallback(b"\x89PNG")) == ""


# ── 错误分类与文案 ──────────────────────────────────────────────

def test_legacy_misleading_wording_removed():
    for code in ("RESUME_PARSE_FAILED", "RESUME_PARSE_NO_TEXT", "RESUME_PARSE_LLM_FAILED"):
        assert "更清晰的 PDF" not in ERRORS[code][1]


def test_app_err_detail_override():
    assert app_err("RESUME_PARSE_FAILED", detail="具体可操作原因").detail == "具体可操作原因"
    assert app_err("RESUME_PARSE_FAILED").detail == ERRORS["RESUME_PARSE_FAILED"][1]
    assert app_err("RATE_LIMITED", seconds=12).detail.endswith("12 秒后重试")


def test_classify_no_text_error_keeps_own_reason():
    code, detail = _classify_parse_error(rp.ResumeNoTextError("该 PDF 受密码保护"))
    assert code == "RESUME_PARSE_NO_TEXT"
    assert "密码" in detail


def test_classify_quota_error():
    code, detail = _classify_parse_error(PaidCallBlocked("免费额度已用尽"))
    assert code == "RESUME_PARSE_LLM_FAILED"
    assert detail and "额度" in detail


def test_classify_403_is_not_blamed_on_pdf_quality():
    code, detail = _classify_parse_error(RuntimeError("403 Free quota exhausted"))
    assert code == "RESUME_PARSE_LLM_FAILED"
    assert detail and "额度" in detail


def test_classify_generic_error_does_not_leak_raw_message():
    code, detail = _classify_parse_error(
        RuntimeError("sk-secret-key-abc / C:\\internal\\path\\app.py")
    )
    assert code == "RESUME_PARSE_FAILED"
    assert detail is None, "上游原始异常串只进日志，不得透传给前端"


# ── PDF 页数校验：防止损坏 PDF 触发 500 ──────────────────────────

def test_validate_pdf_pages_corrupt_pdf_does_not_raise():
    """旧代码 `except app_err:` 把函数当异常类，任何打不开的 PDF 都会
    抛 TypeError → 500。修复后应静默放行，由解析层给出 400 友好提示。"""
    from app.core.file_security import validate_pdf_pages
    validate_pdf_pages(b"%PDF-1.4\nnot a real pdf")


def test_validate_pdf_pages_rejects_over_limit():
    import fitz
    from fastapi import HTTPException
    from app.core.file_security import MAX_PDF_PAGES, validate_pdf_pages

    doc = fitz.open()
    for _ in range(MAX_PDF_PAGES + 1):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    with pytest.raises(HTTPException) as ei:
        validate_pdf_pages(data)
    assert ei.value.status_code == 400
    assert "页数过多" in ei.value.detail
