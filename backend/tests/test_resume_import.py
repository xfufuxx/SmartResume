"""简历解析导入 —— 纯函数助手单测（校验 + 摘要）。

LLM 解析链路（resume_parser）由既有测试覆盖，此处只测本模块新增的
确定性逻辑；API 层（parse/apply）由 scripts/verify_resume_import.py E2E 覆盖。
"""
import pytest

from app.services.resume_import import summarize_parsed, validate_import_file

_FULL_PARSED = {
    "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"},
    "summary": "五年后端经验",
    "experience": [
        {"company": "A", "title": "高级工程师", "points": ["p1"]},
        {"company": "B", "title": "工程师", "points": ["p2"]},
    ],
    "education": [{"school": "华中科技大学", "degree": "本科"}],
    "skills": ["Python", "FastAPI"],
    "projects": [{"name": "智能简历平台", "points": ["p"]}],
}


# ── validate_import_file ────────────────────────────────────────


def test_validate_accepts_supported_types():
    for name in ("a.pdf", "a.docx", "a.png", "a.jpg", "a.jpeg", "a.webp"):
        assert validate_import_file(name, b"x" * 1024) is None


def test_validate_rejects_unknown_ext():
    err = validate_import_file("a.txt", b"x" * 1024)
    assert err and "不支持" in err


def test_validate_rejects_oversize(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE", 1024)
    err = validate_import_file("a.pdf", b"x" * 2048)
    assert err and "上限" in err


# ── summarize_parsed ────────────────────────────────────────────


def test_summarize_full_resume_counts():
    out = summarize_parsed(_FULL_PARSED)
    counts = {s["key"]: s["count"] for s in out["sections"]}
    # count 语义 = 条目数（工作经历 2 段 / 技能 2 项 / 项目 1 个）
    assert counts["experience"] == 2
    assert counts["education"] == 1
    assert counts["skills"] == 2
    assert counts["projects"] == 1
    assert counts["summary"] == 1
    assert out["warnings"] == []


def test_summarize_warns_missing_contact():
    out = summarize_parsed({"personal_info": {"name": "李明"}})
    assert any("邮箱/电话" in w for w in out["warnings"])


def test_summarize_warns_no_experience_and_education():
    out = summarize_parsed({"personal_info": {"name": "李明", "email": "a@b.com"}})
    assert any("工作/教育经历" in w for w in out["warnings"])


def test_summarize_warns_no_skills():
    out = summarize_parsed({
        "personal_info": {"name": "李明", "email": "a@b.com"},
        "experience": [{"company": "A"}],
    })
    assert any("技能" in w for w in out["warnings"])


def test_summarize_empty_is_safe():
    out = summarize_parsed({})
    assert all(s["count"] == 0 for s in out["sections"])
    assert len(out["warnings"]) >= 3  # 姓名 + 联系方式 + 经历


def test_summarize_handles_none_like_values():
    out = summarize_parsed({"personal_info": None, "summary": "  ", "skills": None})
    counts = {s["key"]: s["count"] for s in out["sections"]}
    assert counts["personal_info"] == 0
    assert counts["summary"] == 0
