import json
import os
import logging
from io import BytesIO
from typing import TYPE_CHECKING, Mapping
from jinja2 import Environment, FileSystemLoader
from app.config import settings

if TYPE_CHECKING:
    from app.services.pdf_metadata import PdfMetadata

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
FONTS_DIR = os.path.join(os.path.dirname(__file__), "..", "fonts")
os.makedirs(TEMPLATE_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)


env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def _ensure_template(template_name: str = "professional.html") -> None:
    """确认模板文件存在；缺失即抛错（模板是随代码发布的产物，缺失=部署事故）。

    历史实现会在缺失时把内置默认模板写盘「自愈」——拼错模板名会静默产出
    错误模板的 PDF，且在只读文件系统（容器/ECS）上直接崩，故移除该行为。
    """
    template_path = os.path.join(TEMPLATE_DIR, template_name)
    if not os.path.exists(template_path):
        from app.services.template_meta import is_registered

        if not is_registered(template_name):
            logger.warning("[PDF生成] 未注册的模板: %s（请检查 template_meta / templates 目录）", template_name)
        raise FileNotFoundError(f"模板文件不存在: {template_name}")


def _register_cn_font() -> str:
    """注册中文字体，返回可用的字体名"""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    cn_font_name = "ChineseFont"
    candidates = [
        os.path.join(FONTS_DIR, "NotoSansSC-Regular.ttf"),
        os.path.join(FONTS_DIR, "NotoSansSC-Bold.ttf"),
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\simfang.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
    ]
    for font_path in candidates:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont(cn_font_name, font_path))
                return cn_font_name
            except Exception:
                continue
    return "Helvetica"


def _build_fallback_pdf(resume: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm, cm
    from reportlab.lib.colors import HexColor, white, Color
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        ListFlowable, ListItem, HRFlowable,
    )
    from reportlab.graphics.shapes import Drawing, Rect, String

    cn = _register_cn_font()
    BLUE = HexColor("#2c6fbb")
    LIGHT_BLUE = HexColor("#eef3fb")
    DARK = HexColor("#1a1a1a")
    GRAY = HexColor("#666666")
    LIGHT_GRAY = HexColor("#f5f5f5")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=15 * mm, bottomMargin=15 * mm,
        leftMargin=20 * mm, rightMargin=20 * mm,
    )

    styles = getSampleStyleSheet()

    # ── 样式定义 ──
    title_style = ParagraphStyle(
        "ResumeTitle", fontName=cn, fontSize=22, leading=28,
        textColor=DARK, spaceAfter=2 * mm, alignment=TA_CENTER,
    )
    contact_style = ParagraphStyle(
        "Contact", fontName=cn, fontSize=10, leading=14,
        textColor=GRAY, spaceAfter=4 * mm, alignment=TA_CENTER,
    )
    section_style = ParagraphStyle(
        "Section", fontName=cn, fontSize=13, leading=18,
        textColor=BLUE, spaceBefore=6 * mm, spaceAfter=2 * mm,
    )
    body_style = ParagraphStyle(
        "Body", fontName=cn, fontSize=10, leading=16,
        textColor=DARK, spaceAfter=2 * mm,
    )
    bold_body = ParagraphStyle(
        "BoldBody", parent=body_style, fontName=cn, fontSize=10.5,
    )
    sub_style = ParagraphStyle(
        "Sub", fontName=cn, fontSize=9, leading=13,
        textColor=GRAY, spaceAfter=1 * mm,
    )
    bullet_style = ParagraphStyle(
        "Bullet", parent=body_style, leftIndent=12 * mm,
        bulletIndent=6 * mm, spaceAfter=1 * mm,
    )

    def section_header(title: str):
        """带蓝色下划线的章节标题"""
        return [
            Spacer(1, 2 * mm),
            Paragraph(f"<b>{title}</b>", section_style),
            HRFlowable(
                width="100%", thickness=1.5, color=BLUE,
                spaceBefore=0, spaceAfter=3 * mm,
            ),
        ]

    elements = []
    pi = resume.get("personal_info") or {}

    # ── 姓名 ──
    elements.append(Paragraph(pi.get("name", "姓名"), title_style))

    # ── 联系方式 ──
    contact_parts = []
    if pi.get("email"):
        contact_parts.append(f"✉ {pi['email']}")
    if pi.get("phone"):
        contact_parts.append(f"☎ {pi['phone']}")
    if pi.get("address"):
        contact_parts.append(f"⌂ {pi['address']}")
    if pi.get("linkedin"):
        contact_parts.append(pi["linkedin"])
    if pi.get("github"):
        contact_parts.append(pi["github"])
    if contact_parts:
        elements.append(Paragraph(" &nbsp;|&nbsp; ".join(contact_parts), contact_style))

    # ── 分割线 ──
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GRAY, spaceAfter=2 * mm))

    # ── 个人总结 ──
    summary = resume.get("summary")
    if summary:
        elements.extend(section_header("个人总结"))
        elements.append(Paragraph(summary, body_style))

    # ── 工作经历 ──
    experience = resume.get("experience", [])
    if experience:
        elements.extend(section_header("工作经历"))
        for exp in experience:
            title_line = f"<b>{exp.get('title', '')}</b>"
            if exp.get("company"):
                title_line += f" @ {exp.get('company', '')}"
            elements.append(Paragraph(title_line, bold_body))
            period = f"{exp.get('start', '')} - {exp.get('end', '')}"
            if period.strip(" -"):
                elements.append(Paragraph(period, sub_style))
            points = exp.get("points", [])
            for p in points:
                elements.append(Paragraph(f"• {p}", bullet_style))
            elements.append(Spacer(1, 2 * mm))

    # ── 教育背景 ──
    education = resume.get("education", [])
    if education:
        elements.extend(section_header("教育背景"))
        for edu in education:
            school_line = f"<b>{edu.get('school', '')}</b>"
            elements.append(Paragraph(school_line, bold_body))
            parts = [edu.get("degree", ""), edu.get("major", "")]
            degree = " - ".join(p for p in parts if p)
            period = f"{edu.get('start', '')} - {edu.get('end', '')}"
            sub_parts = [p for p in [degree, period] if p.strip(" -")]
            if sub_parts:
                elements.append(Paragraph(" | ".join(sub_parts), sub_style))
            elements.append(Spacer(1, 1 * mm))

    # ── 技能（带标签样式）──
    skills = resume.get("skills", [])
    if skills:
        elements.extend(section_header("技能"))
        # 用表格模拟标签样式
        skill_text = " &nbsp;&nbsp;".join(
            f'<font color="{BLUE}">■</font> {s}' for s in skills
        )
        elements.append(Paragraph(skill_text, body_style))

    # ── 项目经历 ──
    projects = resume.get("projects", [])
    if projects:
        elements.extend(section_header("项目经历"))
        for proj in projects:
            proj = proj or {}
            head = " · ".join(x for x in [proj.get("name", ""), proj.get("role", "")] if x)
            period = " - ".join(x for x in [proj.get("start", "") or "", proj.get("end", "") or ""] if x)
            if period:
                head = f"{head}（{period}）" if head else period
            elements.append(Paragraph(f"<b>{head}</b>", bold_body))
            for point in proj.get("points") or []:
                if point:
                    elements.append(Paragraph(str(point), body_style))
            if proj.get("description"):
                elements.append(Paragraph(proj["description"], body_style))
            tech = proj.get("tech", [])
            if tech:
                elements.append(Paragraph(f"技术栈：{', '.join(tech)}", sub_style))
            elements.append(Spacer(1, 2 * mm))

    doc.build(elements)
    return buf.getvalue()


def _build_pdf_metadata(template_name: str, *, theme_config: Mapping | None = None) -> "PdfMetadata":
    """按模板文件名构建 PDF 文档属性（模板名/ID/版本/生成时间/主题摘要）。"""
    from app.services.pdf_metadata import PdfMetadata
    from app.services.resume_theme import normalize_theme_config, theme_summary
    from app.services.template_meta import get_template_meta

    meta = get_template_meta(template_name)
    if meta:
        md = PdfMetadata(
            template_name=meta.name,
            template_id=meta.id,
            template_version=meta.version,
            author=meta.author,
        )
    else:
        # 未登记的模板：用文件名兜底，仍保证有属性
        key = template_name.replace(".html", "")
        md = PdfMetadata(template_name=key, template_id=key, template_version="1.0.0")

    if theme_config:
        try:
            theme = normalize_theme_config(
                theme_config,
                template_id=meta.id if meta else None,
                text_defaults=meta.text_defaults if meta else None,
                page_margin_mm=(meta.layout_features.page_margin_y_mm if meta else None),
            )
            md.keywords.append(theme_summary(theme))
        except Exception:  # noqa: BLE001 —— 主题摘要失败不影响主流程
            logger.warning("[PDF元数据] 主题摘要追加失败", exc_info=True)
    return md


def render_template_html(
    template_name: str,
    resume_json: dict,
    *,
    theme_config: Mapping | None = None,
) -> str:
    """渲染模板 HTML 并注入打印基座 + 主题变量（PDF 导出与 iframe 预览共用同一份 HTML）。

    打印基座由 ``template_meta.layout_features`` 驱动（@page 边距、条目级分页保护、
    深色侧栏跨页延续……），注入位置在模板私有样式之后，见 ``app/services/print_css.py``。

    主题（``theme_config``）经 ``resume_theme.normalize_theme_config`` 与模板默认合并后，
    以 ``--tpl-*`` CSS 变量注入：模板私有样式里的硬编码值已改为
    ``var(--tpl-primary, <原值>)``，因此**无用户主题时输出与改造前逐像素一致**。

    同时保证 ``<meta name="template-id">`` 存在：历史上靠每个模板手写，12 套老模板
    全部漏写。改为渲染时统一补，模板源文件不再需要维护该标记。
    """
    from dataclasses import replace

    from app.services.print_css import inject_print_css
    from app.services.resume_theme import normalize_theme_config
    from app.services.template_meta import get_template_meta

    meta = get_template_meta(template_name)
    features = meta.layout_features if meta else None

    # 主题：模板默认 ← 用户定制（预览与导出同一定值函数）
    theme = normalize_theme_config(
        theme_config,
        template_id=meta.id if meta else None,
        text_defaults=meta.text_defaults if meta else None,
        page_margin_mm=(features.page_margin_y_mm if features else None),
    )
    # 页边距覆盖：全幅头部模板的 margin 固定为 0（边距会把背景条推离纸边，视觉事故），
    # 用户设置的 marginMm 仅对非全幅模板生效（前端对全幅模板禁用该滑块）。
    if theme_config and theme.marginMm != (features.page_margin_y_mm if features else 15.0):
        if features and features.full_bleed_header:
            logger.info(
                "[主题] 模板 %s 为全幅头部，忽略用户页边距 %.1fmm（保持 margin: 0）",
                meta.id if meta else template_name, theme.marginMm,
            )
        elif features:
            features = replace(
                features,
                page_margin_y_mm=theme.marginMm,
                page_margin_x_mm=theme.marginMm,
            )

    # avatar_style 进渲染上下文：模板头部的职业照宏（_avatar.html）按它决定
    # 圆形 / 一寸照形状。简历数据本身不含该字段（它在 theme_config 列上），
    # 与主题变量同一来源，保证预览与导出形状一致。
    template = env.get_template(template_name)
    html = template.render(resume=resume_json, avatar_style=theme.avatarStyle)

    html = inject_print_css(html, features, theme=theme.css_variables())

    if meta and '<meta name="template-id"' not in html:
        marker = f'<meta name="template-id" content="{meta.id}">'
        lowered = html.lower()
        idx = lowered.find("</head>")
        html = html[:idx] + marker + "\n" + html[idx:] if idx != -1 else marker + html

    return html


def generate_pdf_sync(
    resume_json: dict,
    template_name: str = "professional.html",
    inject_metadata: bool = True,
    theme_config: Mapping | None = None,
) -> bytes:
    """同步生成 PDF（在线程池中使用，避免阻塞事件循环）

    渲染策略：
    1. Playwright (Chromium) — 完整 CSS 支持，无 GTK3 依赖，Windows 友好
    2. WeasyPrint — 备选方案
    3. ReportLab — 最终回退（纯 Python，无外部依赖）

    Args:
        resume_json: 简历结构化数据
        template_name: 模板文件名（如 professional.html）
        inject_metadata: 是否注入 PDF 文档属性（模板名/ID/版本/生成时间/主题摘要）
        theme_config: 用户主题定制（与模板默认合并后注入 --tpl-* 变量）
    """
    _ensure_template(template_name)
    html = render_template_html(template_name, resume_json, theme_config=theme_config)

    pdf_metadata = _build_pdf_metadata(template_name, theme_config=theme_config) if inject_metadata else None
    if pdf_metadata is not None:
        # HTML <meta> 注入：WeasyPrint 路径直接读取；Playwright 路径由
        # html_to_pdf 的 metadata 参数在 page.pdf() 后处理
        from app.services.pdf_metadata import inject_html_meta
        html = inject_html_meta(html, pdf_metadata)

    # 策略 1：Playwright (Chromium) — 支持完整 CSS，Windows 无需 GTK3
    try:
        from app.services.resume_renderer import html_to_pdf
        logger.info(f"[PDF生成] 使用 Playwright 渲染 {template_name}")
        result = html_to_pdf(html, base_url=TEMPLATE_DIR, metadata=pdf_metadata)
        logger.info(f"[PDF生成] Playwright 成功: {len(result)} bytes")
        return result
    except (ImportError, OSError) as e:
        logger.warning(f"[PDF生成] Playwright 不可用: {e}")
    except Exception as e:
        logger.error(f"[PDF生成] Playwright 渲染失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 2：WeasyPrint — 需要 GTK3 系统库（读取 HTML <meta> 写入文档属性）
    if settings.USE_WEASYPRINT:
        try:
            from weasyprint import HTML
            return HTML(string=html, base_url=TEMPLATE_DIR).write_pdf()
        except (ImportError, OSError):
            pass

    # 策略 3：ReportLab — 纯 Python，无外部依赖
    return _build_fallback_pdf(resume_json)


async def generate_pdf(
    resume_json: dict,
    template_name: str = "professional.html",
    inject_metadata: bool = True,
    theme_config: Mapping | None = None,
) -> bytes:
    """异步接口，直接使用 Playwright 异步 API，避免 Windows 上的 NotImplementedError

    Args:
        resume_json: 简历结构化数据
        template_name: 模板文件名（如 professional.html）
        inject_metadata: 是否注入 PDF 文档属性（模板名/ID/版本/生成时间/主题摘要）
        theme_config: 用户主题定制（与模板默认合并后注入 --tpl-* 变量，见 resume_theme）
    """
    _ensure_template(template_name)
    html = render_template_html(template_name, resume_json, theme_config=theme_config)

    pdf_metadata = _build_pdf_metadata(template_name, theme_config=theme_config) if inject_metadata else None
    if pdf_metadata is not None:
        from app.services.pdf_metadata import inject_html_meta
        html = inject_html_meta(html, pdf_metadata)

    # 策略 1：Playwright 异步 API — 避免 sync_playwright 在线程池中的 Windows 兼容问题
    try:
        from app.services.resume_renderer import html_to_pdf_async
        logger.info(f"[PDF生成] 使用 Playwright 异步渲染 {template_name}")
        result = await html_to_pdf_async(html, base_url=TEMPLATE_DIR, metadata=pdf_metadata)
        logger.info(f"[PDF生成] Playwright 异步成功: {len(result)} bytes")
        return result
    except (ImportError, OSError) as e:
        logger.warning(f"[PDF生成] Playwright 不可用: {e}")
    except Exception as e:
        logger.error(f"[PDF生成] Playwright 异步渲染失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 1b：Playwright 同步 API（在线程池中执行）
    try:
        import asyncio
        result = await asyncio.to_thread(
            generate_pdf_sync, resume_json, template_name, inject_metadata, theme_config
        )
        logger.info(f"[PDF生成] Playwright 同步成功: {len(result)} bytes")
        return result
    except Exception as e:
        logger.error(f"[PDF生成] Playwright 同步也失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 2：WeasyPrint
    if settings.USE_WEASYPRINT:
        try:
            from weasyprint import HTML
            result = HTML(string=html, base_url=TEMPLATE_DIR).write_pdf()
            logger.info(f"[PDF生成] WeasyPrint 成功: {len(result)} bytes")
            return result
        except (ImportError, OSError) as e:
            logger.warning(f"[PDF生成] WeasyPrint 不可用: {e}")
        except Exception as e:
            logger.error(f"[PDF生成] WeasyPrint 渲染失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 3：ReportLab 回退（模板无关，仅作为最后手段）
    logger.warning("[PDF生成] 所有渲染策略均失败，使用 ReportLab 回退（非模板渲染）")
    return _build_fallback_pdf(resume_json)


# ── 可视化排版编辑器：按布局导出（body HTML 由前端共享渲染器生成） ──

_LAYOUT_SHELL_TEMPLATE = "layout_export.html"


def _render_layout_shell(body_html: str, css: str) -> str:
    """把前端生成的 body HTML 包进字体壳：@font-face + @page A4 零边距 + 前端块样式。"""
    template_path = os.path.join(TEMPLATE_DIR, _LAYOUT_SHELL_TEMPLATE)
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"布局导出模板缺失: {_LAYOUT_SHELL_TEMPLATE}")
    template = env.get_template(_LAYOUT_SHELL_TEMPLATE)
    return template.render(body_html=body_html, css=css)


async def generate_pdf_from_layout_html(
    body_html: str,
    css: str = "",
    resume_json: dict | None = None,
    pdf_metadata: "PdfMetadata | None" = None,
) -> bytes:
    """按可视化布局生成 A4 PDF（预览与导出 1:1：同一份 HTML/CSS，只是换了渲染端）。

    渲染链与 generate_pdf 一致：Playwright 异步 → Playwright 同步 → WeasyPrint；
    全部失败时若有 resume_json 则回退到流式模板 ReportLab 版式（保底能出文件）。

    Args:
        body_html: 前端共享渲染器生成的 body HTML
        css: 前端块样式
        resume_json: 回退用的简历数据
        pdf_metadata: PDF 文档属性（缺省用「可视化排版」占位元数据）
    """
    if pdf_metadata is None:
        from app.services.pdf_metadata import PdfMetadata
        pdf_metadata = PdfMetadata(
            template_name="可视化排版",
            template_id="layout-editor",
            template_version="1.0.0",
            author="智能简历",
        )

    html = _render_layout_shell(body_html, css)
    from app.services.pdf_metadata import inject_html_meta
    html = inject_html_meta(html, pdf_metadata)

    try:
        from app.services.resume_renderer import html_to_pdf_async
        logger.info("[布局导出] 使用 Playwright 异步渲染")
        result = await html_to_pdf_async(html, base_url=TEMPLATE_DIR, metadata=pdf_metadata)
        logger.info(f"[布局导出] Playwright 异步成功: {len(result)} bytes")
        return result
    except (ImportError, OSError) as e:
        logger.warning(f"[布局导出] Playwright 不可用: {e}")
    except Exception as e:
        logger.error(f"[布局导出] Playwright 异步渲染失败: {type(e).__name__}: {e}", exc_info=True)

    try:
        import asyncio

        def _sync_render() -> bytes:
            from app.services.resume_renderer import html_to_pdf
            return html_to_pdf(html, base_url=TEMPLATE_DIR, metadata=pdf_metadata)

        result = await asyncio.to_thread(_sync_render)
        logger.info(f"[布局导出] Playwright 同步成功: {len(result)} bytes")
        return result
    except Exception as e:
        logger.error(f"[布局导出] Playwright 同步也失败: {type(e).__name__}: {e}", exc_info=True)

    if settings.USE_WEASYPRINT:
        try:
            from weasyprint import HTML
            result = HTML(string=html, base_url=TEMPLATE_DIR).write_pdf()
            logger.info(f"[布局导出] WeasyPrint 成功: {len(result)} bytes")
            return result
        except (ImportError, OSError) as e:
            logger.warning(f"[布局导出] WeasyPrint 不可用: {e}")
        except Exception as e:
            logger.error(f"[布局导出] WeasyPrint 渲染失败: {type(e).__name__}: {e}", exc_info=True)

    if resume_json is None:
        raise RuntimeError("所有渲染策略均失败，且无简历数据可回退")

    logger.warning("[布局导出] 所有布局渲染策略均失败，回退到流式模板版式")
    return _build_fallback_pdf(resume_json)
