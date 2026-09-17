import json
import os
import logging
from io import BytesIO
from jinja2 import Environment, FileSystemLoader
from app.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
FONTS_DIR = os.path.join(os.path.dirname(__file__), "..", "fonts")
os.makedirs(TEMPLATE_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

_DEFAULT_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Noto Sans SC';
    src: url('../fonts/NotoSansSC-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Noto Sans SC';
    src: url('../fonts/NotoSansSC-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
  }
  @page { margin: 1.5cm; size: A4; }
  body { font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif; font-size: 11pt; color: #333; line-height: 1.6; }
  h1 { font-size: 20pt; margin-bottom: 4px; color: #1a1a1a; }
  .contact { font-size: 10pt; color: #666; margin-bottom: 12px; }
  .contact span { margin-right: 12px; }
  h2 { font-size: 14pt; border-bottom: 2px solid #2c6fbb; padding-bottom: 3px; color: #2c6fbb; margin-top: 16px; }
  .summary { margin: 8px 0; font-size: 10.5pt; }
  .exp-item { margin: 10px 0; }
  .exp-header { font-weight: bold; font-size: 11pt; }
  .exp-sub { color: #555; font-size: 10pt; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin-bottom: 2px; }
  .skill-tag { display: inline-block; background: #eef3fb; padding: 2px 8px; margin: 2px; border-radius: 3px; font-size: 10pt; }
</style>
</head>
<body>
  <h1>{{ resume.personal_info.name or '姓名' }}</h1>
  <div class="contact">
    <span>{{ resume.personal_info.email or '' }}</span>
    <span>{{ resume.personal_info.phone or '' }}</span>
  </div>

  {% if resume.summary %}
  <h2>个人总结</h2>
  <div class="summary">{{ resume.summary }}</div>
  {% endif %}

  {% if resume.experience %}
  <h2>工作经历</h2>
  {% for exp in resume.experience %}
  <div class="exp-item">
    <div class="exp-header">{{ exp.title }} @ {{ exp.company }}</div>
    <div class="exp-sub">{{ exp.start }} - {{ exp.end }}</div>
    {% if exp.points %}
    <ul>
      {% for point in exp.points %}<li>{{ point }}</li>{% endfor %}
    </ul>
    {% endif %}
  </div>
  {% endfor %}
  {% endif %}

  {% if resume.education %}
  <h2>教育背景</h2>
  {% for edu in resume.education %}
  <div class="exp-item">
    <div class="exp-header">{{ edu.school }}</div>
    <div class="exp-sub">{{ edu.degree }} - {{ edu.major }} | {{ edu.start }} - {{ edu.end }}</div>
  </div>
  {% endfor %}
  {% endif %}

  {% if resume.skills %}
  <h2>技能</h2>
  <div>{% for skill in resume.skills %}<span class="skill-tag">{{ skill }}</span> {% endfor %}</div>
  {% endif %}

  {% if resume.projects %}
  <h2>项目经历</h2>
  {% for proj in resume.projects %}
  <div class="exp-item">
    <div class="exp-header">{{ proj.name }}</div>
    {% if proj.description %}<div>{{ proj.description }}</div>{% endif %}
    {% if proj.tech %}<div class="exp-sub">技术栈：{{ proj.tech | join(', ') }}</div>{% endif %}
  </div>
  {% endfor %}
  {% endif %}
</body>
</html>"""


env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def _ensure_template(template_name: str = "professional.html"):
    template_path = os.path.join(TEMPLATE_DIR, template_name)
    if not os.path.exists(template_path):
        with open(template_path, "w", encoding="utf-8") as f:
            f.write(_DEFAULT_TEMPLATE)


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
            elements.append(Paragraph(f"<b>{proj.get('name', '')}</b>", bold_body))
            if proj.get("description"):
                elements.append(Paragraph(proj["description"], body_style))
            tech = proj.get("tech", [])
            if tech:
                elements.append(Paragraph(f"技术栈：{', '.join(tech)}", sub_style))
            elements.append(Spacer(1, 2 * mm))

    doc.build(elements)
    return buf.getvalue()


def generate_pdf_sync(resume_json: dict, template_name: str = "professional.html") -> bytes:
    """同步生成 PDF（在线程池中使用，避免阻塞事件循环）

    渲染策略：
    1. Playwright (Chromium) — 完整 CSS 支持，无 GTK3 依赖，Windows 友好
    2. WeasyPrint — 备选方案
    3. ReportLab — 最终回退（纯 Python，无外部依赖）
    """
    _ensure_template(template_name)

    template = env.get_template(template_name)
    html = template.render(resume=resume_json)

    # 策略 1：Playwright (Chromium) — 支持完整 CSS，Windows 无需 GTK3
    try:
        from app.services.resume_renderer import html_to_pdf
        logger.info(f"[PDF生成] 使用 Playwright 渲染 {template_name}")
        result = html_to_pdf(html, base_url=TEMPLATE_DIR)
        logger.info(f"[PDF生成] Playwright 成功: {len(result)} bytes")
        return result
    except (ImportError, OSError) as e:
        logger.warning(f"[PDF生成] Playwright 不可用: {e}")
    except Exception as e:
        logger.error(f"[PDF生成] Playwright 渲染失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 2：WeasyPrint — 需要 GTK3 系统库
    if settings.USE_WEASYPRINT:
        try:
            from weasyprint import HTML
            return HTML(string=html, base_url=TEMPLATE_DIR).write_pdf()
        except (ImportError, OSError):
            pass

    # 策略 3：ReportLab — 纯 Python，无外部依赖
    return _build_fallback_pdf(resume_json)


async def generate_pdf(resume_json: dict, template_name: str = "professional.html") -> bytes:
    """异步接口，直接使用 Playwright 异步 API，避免 Windows 上的 NotImplementedError"""
    _ensure_template(template_name)

    template = env.get_template(template_name)
    html = template.render(resume=resume_json)

    # 策略 1：Playwright 异步 API — 避免 sync_playwright 在线程池中的 Windows 兼容问题
    try:
        from app.services.resume_renderer import html_to_pdf_async
        logger.info(f"[PDF生成] 使用 Playwright 异步渲染 {template_name}")
        result = await html_to_pdf_async(html, base_url=TEMPLATE_DIR)
        logger.info(f"[PDF生成] Playwright 异步成功: {len(result)} bytes")
        return result
    except (ImportError, OSError) as e:
        logger.warning(f"[PDF生成] Playwright 不可用: {e}")
    except Exception as e:
        logger.error(f"[PDF生成] Playwright 异步渲染失败: {type(e).__name__}: {e}", exc_info=True)

    # 策略 1b：Playwright 同步 API（在线程池中执行）
    try:
        import asyncio
        result = await asyncio.to_thread(generate_pdf_sync, resume_json, template_name)
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
