"""
简历渲染器：Markdown → HTML → PDF

将视觉模型提取的结构化内容块转换为专业排版的 PDF 和 HTML。
不需要严格复原原简历样式，使用统一模板。
"""

import io
import os
import base64
import logging
from dataclasses import dataclass
from PIL import Image

logger = logging.getLogger(__name__)

# ─── HTML 简历模板 ─────────────────────────────────────────────────

RESUME_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>优化简历</title>
<style>
  @page {{
    size: A4;
    margin: 0;
  }}

  * {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }}

  body {{
    font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "STHeiti", sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #333;
    width: 210mm;
    min-height: 297mm;
    display: flex;
  }}

  /* ── 左侧栏 ── */
  .sidebar {{
    width: 32%;
    background: #2c3e50;
    color: #ecf0f1;
    padding: 28px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }}

  .photo-box {{
    text-align: center;
    margin-bottom: 10px;
  }}

  .photo-box img {{
    width: 100px;
    height: 130px;
    object-fit: cover;
    border-radius: 6px;
    border: 3px solid rgba(255,255,255,0.3);
  }}

  .name {{
    font-size: 22px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 4px;
    margin-bottom: 4px;
  }}

  .job-title {{
    font-size: 13px;
    text-align: center;
    color: #bdc3c7;
    margin-bottom: 6px;
  }}

  .sidebar-section {{
    margin-bottom: 4px;
  }}

  .sidebar-section h3 {{
    font-size: 14px;
    font-weight: 700;
    border-bottom: 2px solid rgba(255,255,255,0.3);
    padding-bottom: 5px;
    margin-bottom: 8px;
    letter-spacing: 2px;
  }}

  .sidebar-section .item {{
    font-size: 12px;
    margin-bottom: 5px;
    line-height: 1.7;
    word-break: break-all;
  }}

  .sidebar-section .skill-tag {{
    display: inline-block;
    background: rgba(255,255,255,0.15);
    padding: 2px 8px;
    border-radius: 3px;
    margin: 2px 4px 2px 0;
    font-size: 11px;
  }}

  /* ── 右侧内容区 ── */
  .content {{
    flex: 1;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }}

  .content-section h3 {{
    font-size: 15px;
    font-weight: 700;
    color: #2c3e50;
    border-bottom: 2px solid #2c3e50;
    padding-bottom: 4px;
    margin-bottom: 10px;
    letter-spacing: 2px;
  }}

  .experience-item {{
    margin-bottom: 12px;
  }}

  .experience-item .header {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }}

  .experience-item .company {{
    font-size: 14px;
    font-weight: 600;
    color: #2c3e50;
  }}

  .experience-item .role {{
    font-size: 13px;
    color: #555;
    margin-left: 8px;
  }}

  .experience-item .date {{
    font-size: 12px;
    color: #999;
    white-space: nowrap;
  }}

  .experience-item .details {{
    font-size: 12px;
    color: #555;
    line-height: 1.7;
    padding-left: 4px;
  }}

  .experience-item .details p {{
    margin-bottom: 2px;
  }}

  .education-item {{
    margin-bottom: 8px;
  }}

  .education-item .school {{
    font-weight: 600;
    font-size: 13px;
  }}

  .education-item .info {{
    font-size: 12px;
    color: #666;
  }}

  .honor-item {{
    font-size: 12px;
    color: #555;
    margin-bottom: 3px;
    padding-left: 4px;
  }}

  /* ── 打印设置 ── */
  @media print {{
    body {{
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
  }}
</style>
</head>
<body>
  <div class="sidebar">
    {photo_html}
    <div class="name">{name}</div>
    <div class="job-title">{job_title}</div>
    {sidebar_sections}
  </div>
  <div class="content">
    {content_sections}
  </div>
</body>
</html>"""


# ─── 核心函数 ──────────────────────────────────────────────────────


def blocks_to_markdown(blocks: list, optimized_texts: dict[int, str]) -> str:
    """
    将 ImageBlock 列表 + 优化文本转换为 Markdown。

    Args:
        blocks: ImageBlock 列表（来自视觉模型）
        optimized_texts: {block_index: new_text} 映射

    Returns:
        格式化的 Markdown 字符串
    """
    # 按 x 坐标分类：左侧栏 (x < 页面宽度 35%) vs 右侧内容
    if not blocks:
        return ""

    max_x = max(b.bbox[2] for b in blocks)
    threshold = max_x * 0.35

    sidebar_blocks = []
    content_blocks = []

    for i, b in enumerate(blocks):
        text = optimized_texts.get(i, b.text)
        center_x = (b.bbox[0] + b.bbox[2]) / 2

        entry = {
            "index": i,
            "type": b.block_type,
            "text": text,
            "is_header": getattr(b, "is_header", False),
            "center_x": center_x,
        }
        if center_x < threshold:
            sidebar_blocks.append(entry)
        else:
            content_blocks.append(entry)

    # 生成左侧 Markdown
    sidebar_md = []
    for entry in sidebar_blocks:
        if entry["is_header"]:
            sidebar_md.append(f"## {entry['text']}")
        else:
            if entry["type"] in ("skills",):
                sidebar_md.append(entry["text"])
            else:
                sidebar_md.append(entry["text"])

    # 生成右侧 Markdown
    content_md = []
    current_section = None
    for entry in content_blocks:
        if entry["is_header"]:
            current_section = entry["text"]
            content_md.append(f"## {entry['text']}")
        else:
            if entry["type"] in ("experience", "projects"):
                content_md.append(f"- {entry['text']}")
            elif entry["type"] == "education":
                content_md.append(entry["text"])
            else:
                content_md.append(entry["text"])

    return "\n\n".join(content_md)


def blocks_to_html(
    blocks: list,
    optimized_texts: dict[int, str],
    photo_bytes: bytes | None = None,
) -> str:
    """
    将 ImageBlock 列表直接转换为完整的 HTML 简历。

    不经过 Markdown 中转，直接生成结构化 HTML。

    Args:
        blocks: ImageBlock 列表
        optimized_texts: {block_index: new_text}
        photo_bytes: 照片 PNG 字节（可选）

    Returns:
        完整的 HTML 字符串
    """
    if not blocks:
        return RESUME_TEMPLATE.format(
            photo_html="", name="", job_title="",
            sidebar_sections="", content_sections="<p>无内容</p>"
        )

    max_x = max(b.bbox[2] for b in blocks)
    threshold = max_x * 0.35

    sidebar_entries = []
    content_entries = []

    for i, b in enumerate(blocks):
        text = optimized_texts.get(i, b.text)
        center_x = (b.bbox[0] + b.bbox[2]) / 2

        entry = {
            "index": i,
            "type": b.block_type,
            "text": text,
            "is_header": getattr(b, "is_header", False),
            "center_x": center_x,
        }
        if center_x < threshold:
            sidebar_entries.append(entry)
        else:
            content_entries.append(entry)

    # ── 解析左侧栏 ──
    name = ""
    job_title = ""
    contact_items = []
    personal_items = []
    skills = []
    other_sidebar = []

    for e in sidebar_entries:
        if e["type"] == "name":
            name = e["text"]
        elif e["type"] == "contact" and not e["is_header"]:
            # 尝试判断是不是应聘岗位
            text = e["text"].strip()
            if any(kw in text for kw in ("应聘", "求职", "岗位", "意向", "期望")):
                job_title = text.replace("应聘岗位：", "").replace("求职意向：", "").strip()
            else:
                contact_items.append(text)
        elif e["type"] == "contact" and e["is_header"]:
            pass  # "联系方式" 标题忽略
        elif e["type"] == "other" and not e["is_header"]:
            text = e["text"].strip()
            # 判断归属：个人信息类（籍贯、生日、政治面貌、现居）
            if any(kw in text for kw in ("籍贯", "出生", "年月", "政治", "党员", "现居", "住址")):
                personal_items.append(text.replace("◆ ", "").replace("◆", "").strip())
            # 荣誉奖项
            elif any(kw in text for kw in ("奖学金", "竞赛", "证书", "荣誉", "获奖", "奖项")):
                pass  # 归到右侧
            else:
                other_sidebar.append(text)
        elif e["type"] == "skills":
            skills.append(e["text"])
        elif e["is_header"]:
            pass  # 忽略侧边栏标题
        else:
            other_sidebar.append(e["text"])

    # ── 构建侧边栏 HTML ──
    photo_html = ""
    if photo_bytes:
        b64 = base64.b64encode(photo_bytes).decode("utf-8")
        photo_html = f'<div class="photo-box"><img src="data:image/png;base64,{b64}" alt="照片"></div>'

    sidebar_sections = ""

    # 联系方式
    if contact_items:
        items_html = "".join(f'<div class="item">{c}</div>' for c in contact_items)
        sidebar_sections += f'<div class="sidebar-section"><h3>联系方式</h3>{items_html}</div>'

    # 个人信息
    if personal_items:
        items_html = "".join(f'<div class="item">{p}</div>' for p in personal_items)
        sidebar_sections += f'<div class="sidebar-section"><h3>个人信息</h3>{items_html}</div>'

    # 技能标签
    if skills:
        skill_text = " ".join(skills)
        # 提取 ◆ 后面的技能标签
        tags = []
        for s in skills:
            for line in s.replace("◆", "\n◆").split("\n"):
                line = line.strip()
                if not line:
                    continue
                line = line.replace("◆", "").strip()
                # 拆分冒号前后的内容
                if "：" in line or ":" in line:
                    parts = line.replace("：", ":").split(":", 1)
                    if len(parts) == 2:
                        tags.append(f'<span class="skill-tag">{parts[1].strip()}</span>')
                elif len(line) < 20:
                    tags.append(f'<span class="skill-tag">{line}</span>')
                else:
                    tags.append(f'<div class="item">{line}</div>')

        tags_html = "".join(tags)
        sidebar_sections += f'<div class="sidebar-section"><h3>专业技能</h3>{tags_html}</div>'

    # 其他侧边栏内容
    if other_sidebar:
        items_html = "".join(f'<div class="item">{o}</div>' for o in other_sidebar)
        sidebar_sections += f'<div class="sidebar-section"><h3>其他</h3>{items_html}</div>'

    # ── 解析右侧内容 ──
    content_html_parts = []
    current_section = None
    current_items = []

    experience_blocks = []  # (title_line, detail_lines...)
    education_blocks = []
    summary_blocks = []
    honor_blocks = []
    other_blocks = []

    i = 0
    while i < len(content_entries):
        e = content_entries[i]
        text = e["text"].strip()

        if e["is_header"]:
            # 根据标题归类后续内容
            section_name = text
            i += 1
            section_items = []
            while i < len(content_entries) and not content_entries[i]["is_header"]:
                section_items.append(content_entries[i]["text"].strip())
                i += 1

            if any(kw in section_name for kw in ("工作", "经历", "实习")):
                experience_blocks = _parse_experience_items(section_items)
            elif any(kw in section_name for kw in ("教育", "学历")):
                education_blocks = section_items
            elif any(kw in section_name for kw in ("项目", "工程")):
                pass  # 暂不处理项目
            elif any(kw in section_name for kw in ("技能", "专业")):
                pass  # 技能已在侧边栏
            elif any(kw in section_name for kw in ("荣誉", "获奖", "奖励", "证书")):
                honor_blocks = section_items
            else:
                other_blocks.append({"title": section_name, "items": section_items})
        else:
            # 没有标题的块，按类型处理
            if e["type"] == "summary":
                summary_blocks.append(text)
            elif e["type"] == "education":
                education_blocks.append(text)
            elif e["type"] == "experience":
                experience_blocks = _parse_experience_items([text] + [
                    content_entries[j]["text"].strip()
                    for j in range(i + 1, len(content_entries))
                    if not content_entries[j]["is_header"]
                ][:1])  # 简化处理，单条
            else:
                other_blocks.append({"title": "", "items": [text]})
            i += 1

    # ── 自我评价 ──
    if summary_blocks:
        summary_html = "".join(f"<p>{s}</p>" for s in summary_blocks)
        content_html_parts.append(
            f'<div class="content-section"><h3>自我评价</h3>{summary_html}</div>'
        )

    # ── 工作经历 ──
    if experience_blocks:
        exp_html_parts = []
        for exp in experience_blocks:
            details_html = "".join(f"<p>· {d}</p>" for d in exp.get("details", []))
            exp_html_parts.append(
                f'<div class="experience-item">'
                f'<div class="header">'
                f'<div><span class="company">{exp.get("company", "")}</span>'
                f'<span class="role">{exp.get("role", "")}</span></div>'
                f'<span class="date">{exp.get("date", "")}</span>'
                f'</div>'
                f'<div class="details">{details_html}</div>'
                f'</div>'
            )
        content_html_parts.append(
            f'<div class="content-section"><h3>工作经历</h3>{"".join(exp_html_parts)}</div>'
        )

    # ── 教育背景 ──
    if education_blocks:
        edu_html = ""
        for edu in education_blocks:
            edu_html += f'<div class="education-item"><div class="school">{edu}</div></div>'
        content_html_parts.append(
            f'<div class="content-section"><h3>教育背景</h3>{edu_html}</div>'
        )

    # ── 荣誉奖项 ──
    if honor_blocks:
        honor_html = "".join(f'<div class="honor-item">· {h}</div>' for h in honor_blocks)
        content_html_parts.append(
            f'<div class="content-section"><h3>荣誉奖项</h3>{honor_html}</div>'
        )

    # ── 其他 ──
    for ob in other_blocks:
        if ob.get("title"):
            items_html = "".join(f"<p>· {it}</p>" for it in ob["items"])
            content_html_parts.append(
                f'<div class="content-section"><h3>{ob["title"]}</h3>{items_html}</div>'
            )

    content_sections = "\n    ".join(content_html_parts) if content_html_parts else "<p>暂无内容</p>"

    return RESUME_TEMPLATE.format(
        photo_html=photo_html,
        name=name,
        job_title=job_title,
        sidebar_sections=sidebar_sections,
        content_sections=content_sections,
    )


def _parse_experience_items(items: list[str]) -> list[dict]:
    """
    将经历文本块解析为结构化数据。

    英文简历格式如：
      "2015.07~2015.08 \"OPPO 校园俱乐部\" 项目 新媒体运营"
      "◆ 在官方微博平台中..."
    """
    result = []
    current = None

    for item in items:
        item = item.strip()
        if not item:
            continue
        # 检测是否是时间+公司+职位的标题行
        has_date = any(c.isdigit() for c in item[:4]) and "~" in item[:20]
        has_bullet = item.startswith("◆") or item.startswith("●") or item.startswith("-")

        if has_date and not has_bullet:
            if current:
                result.append(current)
            current = _parse_exp_header(item)
        elif current and has_bullet:
            detail = item.lstrip("◆●- ").strip()
            if detail:
                current.setdefault("details", []).append(detail)
        elif current:
            current.setdefault("details", []).append(item)
        else:
            # 独立的条目
            if has_date:
                current = _parse_exp_header(item)
            else:
                detail = item.lstrip("◆●- ").strip()
                if detail:
                    if current:
                        current.setdefault("details", []).append(detail)
                    else:
                        result.append({"company": "", "role": "", "date": "", "details": [detail]})

    if current:
        result.append(current)
    return result


def _parse_exp_header(text: str) -> dict:
    """解析经历标题行，提取日期、公司、职位"""
    import re
    text = text.strip()
    # 尝试匹配模式: 日期 公司 职位
    # 如 "2015.07~2015.08 "OPPO 校园俱乐部" 项目 新媒体运营"
    date_match = re.match(r'^([\d.]+[~～\-][\d.]+)\s*(.*)', text)
    if date_match:
        date = date_match.group(1)
        rest = date_match.group(2).strip()
        return {"date": date, "company": rest, "role": "", "details": []}
    return {"date": "", "company": text, "role": "", "details": []}


def html_to_pdf(html: str, base_url: str | None = None) -> bytes:
    """
    使用 Playwright (Chromium) 将 HTML 转换为 PDF。

    优势：支持完整现代 CSS（flexbox、grid、@page）、无系统依赖。

    注意：使用临时文件 + page.goto('file:///...') 而非 page.set_content()，
    因为 set_content() 的页面 origin 是 about:blank，Chromium 会阻止加载
    file:/// 本地资源（如 @font-face 中的字体文件），导致中文字体无法渲染。

    Args:
        html: 完整的 HTML 字符串
        base_url: 用于解析相对路径（如 @font-face 中的 url()）的基础 URL

    Returns:
        PDF 字节流
    """
    import tempfile
    from playwright.sync_api import sync_playwright

    # 注入 base_url 以便解析相对路径
    if base_url:
        import re
        html = re.sub(
            r'(<head[^>]*>)',
            rf'\1<base href="file:///{base_url.replace(chr(92), "/")}/">',
            html,
            count=1,
        )

    # 写入临时文件，使用 file:// 协议加载，确保本地字体资源可正常加载
    with tempfile.NamedTemporaryFile(
        suffix=".html", delete=False, mode="w", encoding="utf-8"
    ) as f:
        f.write(html)
        temp_path = f.name

    try:
        file_url = f"file:///{temp_path.replace(chr(92), '/')}"
        logger.info(f"[html_to_pdf] 加载临时文件: {file_url}")

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"]
            )
            try:
                page = browser.new_page()
                page.goto(file_url, wait_until="networkidle")
                pdf = page.pdf(
                    format="A4",
                    print_background=True,
                    margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                )
                return pdf
            finally:
                browser.close()
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


async def html_to_pdf_async(html: str, base_url: str | None = None) -> bytes:
    """
    使用 Playwright (Chromium) 异步 API 将 HTML 转换为 PDF。

    异步版本，可在 async 上下文中直接 await，避免 Windows 上
    sync_playwright 在非主线程中触发 NotImplementedError 的问题。

    注意：使用临时文件 + page.goto('file:///...') 而非 page.set_content()，
    因为 set_content() 的页面 origin 是 about:blank，Chromium 会阻止加载
    file:/// 本地资源（如 @font-face 中的字体文件），导致中文字体无法渲染。

    Args:
        html: 完整的 HTML 字符串
        base_url: 用于解析相对路径（如 @font-face 中的 url()）的基础 URL

    Returns:
        PDF 字节流
    """
    import tempfile
    from playwright.async_api import async_playwright

    if base_url:
        import re
        html = re.sub(
            r'(<head[^>]*>)',
            rf'\1<base href="file:///{base_url.replace(chr(92), "/")}/">',
            html,
            count=1,
        )

    # 写入临时文件，使用 file:// 协议加载，确保本地字体资源可正常加载
    with tempfile.NamedTemporaryFile(
        suffix=".html", delete=False, mode="w", encoding="utf-8"
    ) as f:
        f.write(html)
        temp_path = f.name

    try:
        file_url = f"file:///{temp_path.replace(chr(92), '/')}"
        logger.info(f"[html_to_pdf_async] 加载临时文件: {file_url}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"]
            )
            try:
                page = await browser.new_page()
                await page.goto(file_url, wait_until="networkidle")
                pdf = await page.pdf(
                    format="A4",
                    print_background=True,
                    margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                )
                return pdf
            finally:
                await browser.close()
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def render_resume(
    blocks: list,
    optimized_texts: dict[int, str],
    original_image_bytes: bytes | None = None,
    photo_bbox: tuple | None = None,
) -> tuple[bytes, str]:
    """
    一站式简历渲染：块 → HTML → PDF + HTML。

    Args:
        blocks: ImageBlock 列表（来自视觉模型）
        optimized_texts: {block_index: new_text}
        original_image_bytes: 原始简历图片字节（用于提取照片）
        photo_bbox: 照片区域 (x0, y0, x1, y1)

    Returns:
        (pdf_bytes, html_string)
    """
    # 提取照片
    photo_bytes = None
    if original_image_bytes and photo_bbox:
        try:
            img = Image.open(io.BytesIO(original_image_bytes))
            px0, py0, px1, py1 = photo_bbox
            px0, py0 = max(0, int(px0)), max(0, int(py0))
            px1, py1 = min(img.width, int(px1)), min(img.height, int(py1))
            if px1 > px0 and py1 > py0:
                photo_img = img.crop((px0, py0, px1, py1))
                buf = io.BytesIO()
                photo_img.save(buf, format="PNG")
                photo_bytes = buf.getvalue()
                logger.info(f"[渲染] 照片提取成功: {px1-px0}x{py1-py0}px")
        except Exception as e:
            logger.warning(f"[渲染] 照片提取失败: {e}")

    # 生成 HTML
    html = blocks_to_html(blocks, optimized_texts, photo_bytes)
    logger.info(f"[渲染] HTML 生成完成: {len(html)} 字符")

    # 生成 PDF
    pdf_bytes = html_to_pdf(html)
    logger.info(f"[渲染] PDF 生成完成: {len(pdf_bytes)} bytes")

    return pdf_bytes, html


async def render_resume_async(
    blocks: list,
    optimized_texts: dict[int, str],
    original_image_bytes: bytes | None = None,
    photo_bbox: tuple | None = None,
) -> tuple[bytes, str]:
    """
    一站式简历渲染（异步版本）：块 → HTML → PDF + HTML。

    使用 Playwright 异步 API，可在 async 上下文中直接 await，
    避免 Windows 上 sync_playwright 的 NotImplementedError。

    Args:
        blocks: ImageBlock 列表（来自视觉模型）
        optimized_texts: {block_index: new_text}
        original_image_bytes: 原始简历图片字节（用于提取照片）
        photo_bbox: 照片区域 (x0, y0, x1, y1)

    Returns:
        (pdf_bytes, html_string)
    """
    # 提取照片
    photo_bytes = None
    if original_image_bytes and photo_bbox:
        try:
            img = Image.open(io.BytesIO(original_image_bytes))
            px0, py0, px1, py1 = photo_bbox
            px0, py0 = max(0, int(px0)), max(0, int(py0))
            px1, py1 = min(img.width, int(px1)), min(img.height, int(py1))
            if px1 > px0 and py1 > py0:
                photo_img = img.crop((px0, py0, px1, py1))
                buf = io.BytesIO()
                photo_img.save(buf, format="PNG")
                photo_bytes = buf.getvalue()
                logger.info(f"[渲染] 照片提取成功: {px1-px0}x{py1-py0}px")
        except Exception as e:
            logger.warning(f"[渲染] 照片提取失败: {e}")

    # 生成 HTML
    html = blocks_to_html(blocks, optimized_texts, photo_bytes)
    logger.info(f"[渲染] HTML 生成完成: {len(html)} 字符")

    # 生成 PDF（异步）
    pdf_bytes = await html_to_pdf_async(html)
    logger.info(f"[渲染] PDF 生成完成: {len(pdf_bytes)} bytes")

    return pdf_bytes, html


# ══════════════════════════════════════════════════════════════════════════
# LaTeX 路径
# ══════════════════════════════════════════════════════════════════════════

def _classify_blocks(blocks: list, optimized_texts: dict[int, str]) -> dict:
    """
    将 ImageBlock 列表解析为结构化的简历字段。

    Returns:
        {
            "name": str,
            "job_title": str,
            "photo_b64": str | None,
            "contact": list[str],
            "personal": list[str],
            "skills": list[str],
            "summary": list[str],
            "experience": list[dict],
            "education": list[str],
            "honors": list[str],
            "other": list[dict],
        }
    """
    if not blocks:
        return {
            "name": "", "job_title": "", "photo_b64": None,
            "contact": [], "personal": [], "skills": [],
            "summary": [], "experience": [], "education": [],
            "honors": [], "other": [],
        }

    max_x = max(b.bbox[2] for b in blocks)
    threshold = max_x * 0.35

    sidebar_entries = []
    content_entries = []

    for i, b in enumerate(blocks):
        text = optimized_texts.get(i, b.text)
        center_x = (b.bbox[0] + b.bbox[2]) / 2
        entry = {
            "index": i, "type": b.block_type, "text": text,
            "is_header": getattr(b, "is_header", False),
            "center_x": center_x,
        }
        if center_x < threshold:
            sidebar_entries.append(entry)
        else:
            content_entries.append(entry)

    # ── 解析侧边栏 ──
    name = ""
    job_title = ""
    contact = []
    personal = []
    skills = []

    for e in sidebar_entries:
        text = e["text"].strip()
        if e["type"] == "name":
            name = text
        elif e["type"] == "contact" and not e["is_header"]:
            if any(kw in text for kw in ("应聘", "求职", "岗位", "意向", "期望")):
                job_title = text.replace("应聘岗位：", "").replace("求职意向：", "").strip()
            else:
                contact.append(text.replace("◆ ", "").replace("◆", "").strip())
        elif e["type"] == "skills":
            skills.append(text.replace("◆ ", "").replace("◆", "").strip())
        elif e["type"] == "other" and not e["is_header"]:
            if any(kw in text for kw in ("籍贯", "出生", "年月", "政治", "党员", "现居", "住址")):
                personal.append(text.replace("◆ ", "").replace("◆", "").strip())
            elif any(kw in text for kw in ("掌握", "熟悉", "理解", "开发", "编程", "协议", "架构", "设计")):
                skills.append(text.replace("◆ ", "").replace("◆", "").strip())
            else:
                personal.append(text.replace("◆ ", "").replace("◆", "").strip())

    # ── 解析内容区 ──
    summary = []
    experience = []
    education = []
    honors = []
    other = []

    # 先找标题，按标题归类
    sections = {}  # {header: [items]}
    current_section = "_untitled_"
    for e in content_entries:
        if e["is_header"]:
            current_section = e["text"]
            if current_section not in sections:
                sections[current_section] = []
        else:
            sections.setdefault(current_section, []).append(e["text"].strip())

    for section_name, items in sections.items():
        if any(kw in section_name for kw in ("工作", "经历", "实习")):
            experience = _parse_experience_items(items)
        elif any(kw in section_name for kw in ("教育", "学历")):
            education = items
        elif any(kw in section_name for kw in ("荣誉", "获奖", "奖励", "证书")):
            honors = [
                i.replace("◆ ", "").replace("◆", "").strip()
                for i in items
            ]
        elif any(kw in section_name for kw in ("自我", "评价", "总结", "简介")):
            summary = items
        elif section_name != "_untitled_":
            other.append({"title": section_name, "items": items})
        else:
            # 无标题内容根据类型分配
            for item in items:
                if any(kw in item for kw in ("掌握", "熟悉", "开发", "编程")):
                    skills.append(item.replace("◆ ", "").replace("◆", "").strip())
                else:
                    summary.append(item)

    return {
        "name": name,
        "job_title": job_title,
        "contact": contact,
        "personal": personal,
        "skills": skills,
        "summary": summary,
        "experience": experience,
        "education": education,
        "honors": honors,
        "other": other,
    }


def blocks_to_latex(
    blocks: list,
    optimized_texts: dict[int, str],
    photo_bytes: bytes | None = None,
) -> str:
    """
    将结构化简历块转换为 LaTeX 源码。

    使用 ctexart 文档类（支持中文）+ 自定义二栏布局。
    生成的 .tex 需要 xelatex 编译器（中文支持）。

    Args:
        blocks: ImageBlock 列表
        optimized_texts: {block_index: new_text}
        photo_bytes: 照片 PNG 字节（可选）

    Returns:
        完整的 LaTeX 源码字符串
    """
    data = _classify_blocks(blocks, optimized_texts)

    # 转义 LaTeX 特殊字符
    def esc(s: str) -> str:
        for ch, rep in [
            ("\\", "\\textbackslash{}"), ("&", "\\&"), ("%", "\\%"),
            ("$", "\\$"), ("#", "\\#"), ("_", "\\_"), ("{", "\\{"),
            ("}", "\\}"), ("~", "\\textasciitilde{}"), ("^", "\\^{}"),
        ]:
            s = s.replace(ch, rep)
        return s

    # 照片处理
    photo_code = ""
    if photo_bytes:
        import base64
        b64 = base64.b64encode(photo_bytes).decode("utf-8")
        photo_code = (
            "  \\begin{center}\n"
            "    \\includegraphics[width=3.2cm,height=4.2cm,keepaspectratio]{photo.png}\n"
            "  \\end{center}\n"
        )

    # ── 侧边栏 ──
    sidebar_parts = []
    if photo_code:
        sidebar_parts.append(photo_code)

    # 联系方式
    if data["contact"]:
        lines = [esc(c) for c in data["contact"]]
        sidebar_parts.append(
            "  \\section*{联系方式}\n"
            + "\n".join(f"  {l} \\\\[4pt]" for l in lines)
        )

    # 个人信息
    if data["personal"]:
        lines = [esc(p) for p in data["personal"]]
        sidebar_parts.append(
            "  \\section*{个人信息}\n"
            + "\n".join(f"  {l} \\\\[4pt]" for l in lines)
        )

    # 技能
    if data["skills"]:
        skill_texts = []
        for s in data["skills"]:
            s_clean = s.strip()
            if len(s_clean) > 80:
                # 长文本拆分为独立段落
                skill_texts.append(f"  \\small {esc(s_clean)} \\\\[6pt]")
            else:
                skill_texts.append(f"  \\skill{{{esc(s_clean)}}}")
        sidebar_parts.append(
            "  \\section*{专业技能}\n"
            + "\n".join(skill_texts)
        )

    sidebar_tex = "\n\n".join(sidebar_parts) if sidebar_parts else ""

    # ── 内容区 ──
    content_parts = []

    # 自我评价
    if data["summary"]:
        summary_lines = "\n\n".join(esc(s) for s in data["summary"])
        content_parts.append(
            "\\section{自我评价}\n"
            f"{summary_lines}"
        )

    # 工作经历
    if data["experience"]:
        exp_items = []
        for exp in data["experience"]:
            company = esc(exp.get("company", ""))
            date = esc(exp.get("date", ""))
            details = exp.get("details", [])
            detail_lines = "\n".join(f"    \\item {esc(d)}" for d in details)
            exp_items.append(
                "  \\experienceitem\n"
                f"    {{{company}}}\n"
                f"    {{{date}}}\n"
                "    \\begin{itemize}\n"
                f"{detail_lines}\n"
                "    \\end{itemize}\n"
                "  "
            )
        content_parts.append(
            "\\section{工作经历}\n"
            + "\n".join(exp_items)
        )

    # 教育
    if data["education"]:
        edu_lines = "\n".join(f"  \\educationitem{{{esc(e)}}}" for e in data["education"])
        content_parts.append(
            "\\section{教育背景}\n"
            f"{edu_lines}"
        )

    # 荣誉
    if data["honors"]:
        honor_lines = "\n".join(f"  \\item {esc(h)}" for h in data["honors"])
        content_parts.append(
            "\\section{荣誉奖项}\n"
            "\\begin{itemize}\n"
            f"{honor_lines}\n"
            "\\end{itemize}"
        )

    # 其他
    for ob in data["other"]:
        title = esc(ob["title"])
        items = "\n".join(f"  \\item {esc(it)}" for it in ob["items"])
        content_parts.append(
            f"\\section{{{title}}}\n"
            "\\begin{itemize}\n"
            f"{items}\n"
            "\\end{itemize}"
        )

    content_tex = "\n\n".join(content_parts) if content_parts else "暂无内容"

    # ── 组装完整文档 ──
    name_esc = esc(data["name"]) if data["name"] else ""
    title_esc = esc(data["job_title"]) if data["job_title"] else ""

    latex = r"""% !TEX program = xelatex
% 简历 LaTeX 源文件 — 由智能简历系统自动生成

\documentclass[10pt,a4paper]{ctexart}

% ── 页面布局 ──
\usepackage[landscape,left=0cm,top=0cm,right=0cm,bottom=0cm,nohead,nofoot]{geometry}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{tikz}
\usepackage{fontawesome}
\usepackage{enumitem}
\usepackage{hyperref}

% ── 颜色定义 ──
\definecolor{sidebar}{HTML}{2C3E50}
\definecolor{sidebartext}{HTML}{ECF0F1}
\definecolor{accent}{HTML}{2C3E50}
\definecolor{graytext}{HTML}{555555}
\definecolor{lightgray}{HTML}{999999}

% ── 移除页码、段落缩进 ──
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\setlist{nosep,leftmargin=*,itemsep=1pt,topsep=0pt,partopsep=0pt}

% ── 技能标签命令 ──
\newcommand{\skill}[1]{%
  \colorbox{sidebartext!15}{%
    \color{sidebartext}\footnotesize\strut #1%
  }\hspace{3pt}%
}

% ── 经历条目命令 ──
\newcommand{\experienceitem}[2]{%
  \vspace{5pt}
  \noindent
  \textbf{\normalsize #1} \hfill {\color{lightgray}\footnotesize #2} \\
}

% ── 教育条目 ──
\newcommand{\educationitem}[1]{%
  \vspace{3pt}
  \noindent \textbf{\footnotesize #1}
}

% ── 紧凑章节标题 ──
\ctexset{
  section={
    beforeskip=6pt plus 1pt,
    afterskip=3pt plus 1pt,
    format=\normalsize\bfseries,
  },
}

\begin{document}

% ── 背景侧边栏 ──
\begin{tikzpicture}[remember picture,overlay]
  \fill[sidebar] (current page.north west) rectangle
    ([xshift=5.8cm] current page.south west);
\end{tikzpicture}

% ── 左侧栏 ──
\begin{minipage}[t]{5.5cm}
  \vspace{-1.2cm}
  \color{sidebartext}
""" + f"""
  \\begin{{center}}
    {{\\LARGE \\bfseries {name_esc}}}
    \\vspace{{3pt}}
    {{\\normalsize {title_esc}}}
  \\end{{center}}
  \\vspace{{4pt}}
{sidebar_tex}
""" + r"""
\end{minipage}
\hspace{0.3cm}
% ── 右侧内容区 ──
\begin{minipage}[t]{13.2cm}
  \vspace{-1.2cm}
""" + f"""
{content_tex}
""" + r"""
\end{minipage}

\end{document}
"""
    return latex


def _find_latex_compiler() -> str | None:
    """查找可用的 LaTeX 编译器（xelatex 优先，因为支持中文）。"""
    import shutil
    for compiler in ("xelatex", "pdflatex", "lualatex"):
        if shutil.which(compiler):
            logger.info(f"[LaTeX] 找到编译器: {compiler}")
            return compiler
    logger.warning("[LaTeX] 未找到 LaTeX 编译器，将仅生成 .tex 文件")
    return None


def latex_to_pdf(latex_source: str, compiler: str | None = None) -> bytes | None:
    """
    编译 LaTeX 源码为 PDF。

    Args:
        latex_source: LaTeX 源码字符串
        compiler: 编译器名称（xelatex/pdflatex），不指定则自动检测

    Returns:
        PDF 字节流，若编译器不可用则返回 None
    """
    import subprocess
    import tempfile
    import os

    if compiler is None:
        compiler = _find_latex_compiler()
        if compiler is None:
            return None

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_source)

        try:
            # 编译两次（第一次生成 aux，第二次解析引用）
            # 首次编译可能需下载缺失包（MiKTeX on-the-fly），timeout 设为 5 分钟
            for _ in range(2):
                result = subprocess.run(
                    [compiler, "-interaction=nonstopmode", "-output-directory", tmpdir, tex_path],
                    capture_output=True, text=True, timeout=300,
                )
                if result.returncode != 0:
                    # 提取关键错误信息
                    err_lines = []
                    for line in result.stdout.split("\n"):
                        if line.startswith("!"):
                            err_lines.append(line)
                    err_msg = "\n".join(err_lines[:5]) if err_lines else result.stdout[-500:]
                    logger.error(f"[LaTeX] 编译失败:\n{err_msg}")
                    return None

            pdf_path = os.path.join(tmpdir, "resume.pdf")
            if os.path.exists(pdf_path):
                with open(pdf_path, "rb") as f:
                    pdf_bytes = f.read()
                logger.info(f"[LaTeX] 编译成功 ({compiler}): {len(pdf_bytes)} bytes")
                return pdf_bytes
            else:
                logger.error("[LaTeX] 编译完成但未找到 PDF 输出")
                return None

        except subprocess.TimeoutExpired:
            logger.error("[LaTeX] 编译超时")
            return None
        except FileNotFoundError:
            logger.warning(f"[LaTeX] 编译器不可用: {compiler}")
            return None


def render_resume_latex(
    blocks: list,
    optimized_texts: dict[int, str],
    original_image_bytes: bytes | None = None,
    photo_bbox: tuple | None = None,
) -> tuple[bytes | None, str]:
    """
    LaTeX 简历渲染：块 → LaTeX → PDF + .tex。

    若系统安装了 xelatex/pdflatex，自动编译生成 PDF。
    若没有编译器，返回 .tex 源码（用户可自行编译）。

    Args:
        blocks: ImageBlock 列表
        optimized_texts: {block_index: new_text}
        original_image_bytes: 原始简历图片（提取照片）
        photo_bbox: 照片区域

    Returns:
        (pdf_bytes_or_None, tex_string)
    """
    # 提取照片
    photo_bytes = None
    if original_image_bytes and photo_bbox:
        try:
            img = Image.open(io.BytesIO(original_image_bytes))
            px0, py0, px1, py1 = photo_bbox
            px0, py0 = max(0, int(px0)), max(0, int(py0))
            px1, py1 = min(img.width, int(px1)), min(img.height, int(py1))
            if px1 > px0 and py1 > py0:
                photo_img = img.crop((px0, py0, px1, py1))
                buf = io.BytesIO()
                photo_img.save(buf, format="PNG")
                photo_bytes = buf.getvalue()
                logger.info(f"[LaTeX] 照片提取成功: {px1-px0}x{py1-py0}px")
        except Exception as e:
            logger.warning(f"[LaTeX] 照片提取失败: {e}")

    # 生成 LaTeX 源码
    tex = blocks_to_latex(blocks, optimized_texts, photo_bytes)
    logger.info(f"[LaTeX] 源码生成完成: {len(tex)} 字符")

    # 尝试编译
    compiler = _find_latex_compiler()
    if compiler:
        pdf_bytes = latex_to_pdf(tex, compiler)
    else:
        pdf_bytes = None

    return pdf_bytes, tex