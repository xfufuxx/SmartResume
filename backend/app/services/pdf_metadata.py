"""
PDF 文档属性（元数据）注入。

背景：
- Playwright 的 page.pdf() 不提供 metadata 参数，导出的 PDF 只有 Chromium 默认属性；
- WeasyPrint 会读取 HTML 中的 <meta name="author/description/keywords/dcterms.created">；
- ReportLab 回退路径同理需要在构建时写入。

本模块统一收口：在 PDF 字节流产出后，用 PyMuPDF（fitz，已在 requirements）
set_metadata() 写入模板名 / 模板 ID / 模板版本 / 生成时间 / 作者等属性。
任何一步失败都只记录日志并返回原始字节，绝不影响主流程（保底可出文件）。
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# 北京时间（UTC+8）
_TZ_CN = timezone(timedelta(hours=8))


@dataclass
class PdfMetadata:
    """PDF 文档属性（对应 PDF /Info 字典）。"""

    # ── 必填：模板信息 ──
    template_name: str            # 模板展示名（如「专业分栏」）
    template_id: str              # 模板 key（如 professional / jade-classic）
    template_version: str = "1.0.0"

    # ── 选填 ──
    title: str = ""               # 文档标题（缺省由 template_name 派生）
    author: str = ""              # 作者 / 生产者
    subject: str = ""             # 主题
    keywords: list[str] = field(default_factory=list)
    creator: str = ""             # 创建工具
    producer: str = "SmartResume PDF Engine"
    generated_at: datetime | None = None  # 生成时间（缺省取当前北京时间）

    def keyword_list(self) -> list[str]:
        """关键词：业务词 + 机器可读的模板标识（便于归档/检索时反查模板）。"""
        base = list(self.keywords) if self.keywords else ["简历", "resume"]
        base.append(f"template-id={self.template_id}")
        base.append(f"template-version={self.template_version}")
        return base

    def to_fitz_dict(self) -> dict:
        """转换为 PyMuPDF set_metadata() 接受的字典（PDF 日期格式）。"""
        now = self.generated_at or datetime.now(_TZ_CN)
        title = self.title or f"{self.template_name}简历"
        subject = self.subject or f"由智能简历平台生成 · 模板: {self.template_name}"
        keywords = ", ".join(self.keyword_list())
        return {
            "title": title,
            "author": self.author or "智能简历",
            "subject": subject,
            "keywords": keywords,
            "creator": self.creator or "SmartResume",
            "producer": self.producer,
            # PDF 规范日期格式 D:YYYYMMDDHHmmSS+08'00'
            "creationDate": _pdf_date(now),
            "modDate": _pdf_date(now),
        }


def _pdf_date(dt: datetime) -> str:
    """格式化为 PDF 日期字符串：D:YYYYMMDDHHmmSS+08'00'"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_TZ_CN)
    dt = dt.astimezone(_TZ_CN)
    return "D:{}{:02d}{:02d}{:02d}{:02d}{:02d}+08'00'".format(
        dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second
    )


def _now_iso() -> str:
    return datetime.now(_TZ_CN).isoformat(timespec="seconds")


def inject_pdf_metadata(pdf_bytes: bytes, meta: PdfMetadata) -> bytes:
    """
    将文档属性写入 PDF（PyMuPDF 后处理）。

    Args:
        pdf_bytes: 原始 PDF 字节流
        meta: 元数据

    Returns:
        注入属性后的 PDF 字节流；失败时原样返回（不抛异常）。
    """
    if not pdf_bytes:
        return pdf_bytes

    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("[PDF元数据] PyMuPDF 不可用，跳过属性注入")
        return pdf_bytes

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            doc.set_metadata(meta.to_fitz_dict())
            buf = io.BytesIO()
            doc.save(buf, garbage=3, deflate=True)
            out = buf.getvalue()
            logger.info(
                f"[PDF元数据] 注入完成: title={meta.title or meta.template_name} "
                f"id={meta.template_id} v{meta.template_version} ({len(pdf_bytes)}→{len(out)} bytes)"
            )
            return out
        finally:
            doc.close()
    except Exception as e:
        logger.warning(f"[PDF元数据] 注入失败（不影响主流程）: {type(e).__name__}: {e}")
        return pdf_bytes


# ── HTML <meta> 注入（WeasyPrint 路径会读取这些标签） ─────────────────

_META_NAME_MAP = {
    "title": "title",
    "author": "author",
    "subject": "description",
    "keywords": "keywords",
}


def build_meta_tags(meta: PdfMetadata) -> str:
    """
    生成注入 HTML <head> 的 <meta> 标签串（WeasyPrint 路径直接读取）。

    WeasyPrint 支持的属性来源：
      - <title>                → /Title
      - <meta name=author>     → /Author
      - <meta name=description>→ /Subject
      - <meta name=keywords>   → /Keywords
      - <meta name=dcterms.created> → /CreationDate
      - <meta name=dcterms.modified>→ /ModDate
    """
    now = meta.generated_at or datetime.now(_TZ_CN)
    now_iso = now.astimezone(_TZ_CN).isoformat(timespec="seconds")
    title = meta.title or f"{meta.template_name}简历"
    keywords = ", ".join(meta.keyword_list())
    subject = meta.subject or f"由智能简历平台生成 · 模板: {meta.template_name}"
    return (
        f"<title>{_escape(title)}</title>\n"
        f'<meta name="author" content="{_escape(meta.author or "智能简历")}">\n'
        f'<meta name="description" content="{_escape(subject)}">\n'
        f'<meta name="keywords" content="{_escape(keywords)}">\n'
        f'<meta name="dcterms.created" content="{now_iso}">\n'
        f'<meta name="dcterms.modified" content="{now_iso}">\n'
        f'<meta name="template-id" content="{_escape(meta.template_id)}">\n'
        f'<meta name="template-version" content="{_escape(meta.template_version)}">'
    )


def inject_html_meta(html: str, meta: PdfMetadata) -> str:
    """把 <meta> 标签注入 HTML <head>（幂等：已含 template-id 时跳过）。"""
    if not html:
        return html
    if 'name="template-id"' in html:
        return html
    tags = build_meta_tags(meta)
    # 优先插到第一个 <head ...> 之后；没有 <head> 则插到 <html> 之后；再不行插到最前
    m = re.search(r"<head[^>]*>", html, flags=re.IGNORECASE)
    if m:
        idx = m.end()
        return html[:idx] + "\n" + tags + html[idx:]
    m = re.search(r"<html[^>]*>", html, flags=re.IGNORECASE)
    if m:
        idx = m.end()
        head = "<head>" + tags + "</head>"
        return html[:idx] + "\n" + head + html[idx:]
    return tags + "\n" + html


def _escape(s: str) -> str:
    """最小限度 HTML 属性转义。"""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
