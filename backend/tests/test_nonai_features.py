"""非 AI 功能的单元测试（不依赖数据库 / Redis / LLM）。

覆盖：文件签名 URL 代理、magic-bytes 校验、错误码中文化、
ATS 规则化预检、DOCX 生成、日志脱敏。
"""
import io
import os
import time
from urllib.parse import urlparse, parse_qs

import pytest
from fastapi import HTTPException

from app.services import storage
from app.core.errors import app_err
from app.core.file_security import validate_file_magic
from app.services.ats_check import ats_check
from app.services.docx_export import build_docx_from_resume_json
from docx import Document


# ── 1. 文件签名 URL 代理 ────────────────────────────────────────────

def test_sign_and_verify_roundtrip():
    key = "resumes/uid/abc123.pdf"
    url = storage._sign_key(key)
    assert "/api/files/" in url
    q = parse_qs(urlparse(url).query)
    exp = int(q["exp"][0])
    sig = q["sig"][0]
    assert storage.verify_signed_key(key, exp, sig) is True


def test_verify_rejects_tampered_sig():
    key = "resumes/uid/abc123.pdf"
    url = storage._sign_key(key)
    q = parse_qs(urlparse(url).query)
    exp = int(q["exp"][0])
    sig = q["sig"][0]
    assert storage.verify_signed_key(key, exp, sig + "x") is False


def test_verify_rejects_expired():
    key = "resumes/uid/abc123.pdf"
    exp = int(time.time()) - 10**9  # 远过去
    sig = "irrelevant"
    assert storage.verify_signed_key(key, exp, sig) is False


def test_files_endpoint_serves_signed_url():
    """端到端验证签名 URL 代理路由：请求 /api/files/{key} 能被正确解析、签名校验通过并返回文件；篡改签名应 403。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api import files as files_module

    key = "test-route/hello.txt"
    content = b"hello signed url"
    local_path = os.path.join("uploads", key)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    try:
        with open(local_path, "wb") as f:
            f.write(content)
        app = FastAPI()
        app.include_router(files_module.router)
        client = TestClient(app)
        signed = storage._sign_key(key)
        parsed = urlparse(signed)
        path_and_q = parsed.path + "?" + parsed.query
        resp = client.get(path_and_q)
        assert resp.status_code == 200, resp.text
        assert resp.content == content
        # 篡改签名 → 403
        q = parse_qs(parsed.query)
        bad = client.get(parsed.path, params={"exp": q["exp"][0], "sig": "tampered"})
        assert bad.status_code == 403
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


# ── 2. magic-bytes 文件校验 ───────────────────────────────────────

def test_validate_pdf_magic_ok():
    validate_file_magic(b"%PDF-1.4 some content", "pdf")  # 不应抛异常


def test_validate_pdf_magic_rejects_exe():
    with pytest.raises(HTTPException) as exc:
        validate_file_magic(b"MZ\x90\x00\x03\x00fake exe", "pdf")
    assert exc.value.status_code == 400


def test_validate_docx_magic_ok():
    validate_file_magic(b"PK\x03\x04zipcontent", "docx")


def test_validate_png_magic_ok():
    validate_file_magic(b"\x89PNG\r\n\x1a\n", "png")


# ── 3. 错误码中文化 ───────────────────────────────────────────────

def test_app_err_returns_chinese():
    e = app_err("RESUME_NOT_FOUND")
    assert e.status_code == 404
    assert "简历" in e.detail


def test_app_err_formats_kwargs():
    e = app_err("RATE_LIMITED", seconds=30)
    assert "30" in e.detail


# ── 4. ATS 规则化预检 ─────────────────────────────────────────────

def _good_resume():
    return {
        "personal_info": {"name": "张三", "phone": "13800000000", "email": "a@b.com"},
        "summary": "5 年经验",
        "experience": [{"title": "E", "company": "C", "points": ["提升 30% 效率", "服务 5 万用户"]}],
        "education": [{"school": "S"}],
        "skills": ["Python", "Go"],
    }


def test_ats_check_good_resume_passes():
    r = ats_check(_good_resume())
    assert r["score"] >= 70
    assert r["passed"] is True
    assert r["keyword_coverage"] is None


def test_ats_check_missing_contact_reports_error():
    data = {"personal_info": {}, "experience": []}
    r = ats_check(data)
    assert any(i["level"] == "error" for i in r["issues"])


def test_ats_check_keyword_coverage():
    job = {"skills": ["Python", "Rust", "Kubernetes"]}
    r = ats_check(_good_resume(), job)
    cov = r["keyword_coverage"]
    assert cov is not None
    assert "Python" in cov["covered"]
    assert "Rust" in cov["missing"]


# ── 5. DOCX 生成（从 JSON） ───────────────────────────────────────

def test_build_docx_from_json():
    data = _good_resume()
    data["projects"] = [{"name": "P1", "description": "desc", "tech": ["FastAPI"]}]
    b = build_docx_from_resume_json(data)
    assert b[:2] == b"PK"  # docx 本质是 zip
    doc = Document(io.BytesIO(b))
    texts = "\n".join(p.text for p in doc.paragraphs)
    assert "张三" in texts
    assert "Python" in texts


# ── 6. 日志脱敏 ───────────────────────────────────────────────────

def test_log_scrub_masks_phone_and_email():
    from app.core.log_filter import _scrub
    out = _scrub("联系人 13800000000 邮箱 a@b.com")
    assert "138****0000" in out
    # 短邮箱（本地名 ≤2 字符）整体掩码，避免泄露
    assert "***@b.com" in out
    assert "a@b.com" not in out
    assert "13800000000" not in out
