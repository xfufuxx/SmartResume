"""简历解析导入 —— 纯函数助手（校验 + 解析结果摘要）。

职责边界：本模块只做「文件 → 校验 → 摘要」的确定性逻辑；
LLM 解析复用 `app.services.resume_parser`（PDF/docx/图片 → 结构化 JSON），
不在本模块重复实现。
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

#: 与 POST /api/resumes/upload 保持一致的接受列表（解析导入同源）
ACCEPTED_IMPORT_EXTS = ("pdf", "docx", "png", "jpg", "jpeg", "webp")


def validate_import_file(filename: str, content: bytes) -> str | None:
    """扩展名 + 大小预检。通过返回 None，不通过返回错误信息（调用方转 400）。"""
    ext = filename.split(".")[-1].lower() if filename else "unknown"
    if ext not in ACCEPTED_IMPORT_EXTS:
        return f"不支持的文件类型：{ext}。支持 PDF / DOCX / PNG / JPG / WebP"
    from app.config import settings

    if len(content) > settings.MAX_UPLOAD_SIZE:
        limit_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
        return f"文件超过大小上限（{limit_mb}MB）"
    return None


#: 摘要区块：key → (中文标题, parsed_json 中的字段名)
_SECTION_SPEC: list[tuple[str, str, str]] = [
    ("personal_info", "个人信息", "personal_info"),
    ("summary", "个人简介", "summary"),
    ("experience", "工作经历", "experience"),
    ("education", "教育背景", "education"),
    ("skills", "技能特长", "skills"),
    ("projects", "项目经历", "projects"),
]


def _count(value) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        return len(value)
    if isinstance(value, str) and value.strip():
        return 1
    return 0


def summarize_parsed(parsed: dict) -> dict:
    """把解析结果汇总成「区块计数 + 缺失提醒」，供前端预览与导入前确认。

    返回：
    {
      "sections": [{"key": "experience", "label": "工作经历", "count": 3}, ...],
      "warnings": ["未识别到邮箱，请导入后检查", ...],
    }
    """
    parsed = parsed or {}
    sections = []
    for key, label, field in _SECTION_SPEC:
        count = _count(parsed.get(field))
        sections.append({"key": key, "label": label, "count": count})

    warnings: list[str] = []
    pi = parsed.get("personal_info") or {}
    if not isinstance(pi, dict):
        pi = {}
    if not (pi.get("name") or "").strip():
        warnings.append("未识别到姓名，请导入后补充")
    if not (pi.get("email") or "").strip() and not (pi.get("phone") or "").strip():
        warnings.append("未识别到邮箱/电话，请导入后补充联系方式")
    if _count(parsed.get("experience")) == 0 and _count(parsed.get("education")) == 0:
        warnings.append("未识别到工作/教育经历，可能是扫描版文件，建议更换清晰原稿")
    if _count(parsed.get("skills")) == 0:
        warnings.append("未识别到技能列表，请导入后补充")

    return {"sections": sections, "warnings": warnings}
