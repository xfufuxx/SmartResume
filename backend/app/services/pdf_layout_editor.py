"""
PDF 版式解析器与重写器（基于 PyMuPDF）。

核心能力：
1. 解析 PDF 页面版式：提取文本块（bbox/字号/字体/颜色/内容）和照片
2. 字段分类：识别哪些是"保护字段"（姓名/联系方式/教育背景）vs "优化字段"
3. 原地重写：白色矩形覆盖旧文字 + insert_textbox 新文字，保留图形和照片
4. 照片保留：原样保留照片对象，不做任何修改

注意：不使用 redaction（会销毁图形元素），改用 draw_rect + insert_textbox 方式。
"""

import os
import io
import uuid
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ─── 数据结构 ───────────────────────────────────────────────────


@dataclass
class TextBlock:
    """PDF 中的一个文本块"""
    text: str
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    font_size: float = 10.0
    font_name: str = "helv"  # PyMuPDF 字体名
    color: tuple[float, float, float] = (0, 0, 0)  # RGB 0-1 范围
    page_num: int = 0
    block_index: int = 0
    is_bold: bool = False
    alignment: str = "left"  # left/center/right
    # 字段类型
    field_type: str = "unknown"  # name/contact/education/summary/experience/skills/projects/unknown


@dataclass
class PhotoInfo:
    """PDF 中的照片信息"""
    xref: int  # PDF 内部对象引用号
    bbox: tuple[float, float, float, float]  # 图片在页面上的位置
    width: int = 0
    height: int = 0
    page_num: int = 0
    image_bytes: Optional[bytes] = None  # 提取的图片数据


@dataclass
class PageLayout:
    """单页的完整版式信息"""
    page_num: int
    width: float
    height: float
    text_blocks: list[TextBlock] = field(default_factory=list)
    photos: list[PhotoInfo] = field(default_factory=list)


# ─── 字段类型识别 ───────────────────────────────────────────────

# 保护字段白名单：这些字段不优化，只做格式修正
PROTECTED_FIELDS = {"name", "contact", "education"}

# 需要优化的字段类型
OPTIMIZABLE_FIELDS = {"summary", "experience", "skills", "projects"}

# 字段识别关键词
FIELD_KEYWORDS = {
    "name": ["姓名", "name", "名字"],
    "contact": ["电话", "手机", "邮箱", "email", "phone", "tel", "地址", "address", "微信", "wechat", "linkedin", "github"],
    "education": ["教育", "学历", "学校", "大学", "学院", "education", "university", "college", "bachelor", "master", "博士", "硕士", "本科", "专业", "major"],
    "summary": ["个人总结", "自我评价", "自我介绍", "个人简介", "summary", "profile", "关于我", "about"],
    "experience": ["工作经历", "工作经验", "工作履历", "实习经历", "experience", "work", "employment", "职业经历"],
    "skills": ["技能", "专业技能", "技术栈", "skills", "technologies", "tech stack", "掌握技能", "语言能力"],
    "projects": ["项目经历", "项目经验", "项目", "projects", "project"],
}


def classify_text_block(block: TextBlock) -> str:
    """
    根据文本内容自动分类字段类型。
    策略：优先匹配标题关键词，再根据上下文推断。
    """
    text_lower = block.text.lower().strip()

    # 标题关键词匹配（短文本优先判断）
    if len(block.text) < 20:
        for field_type, keywords in FIELD_KEYWORDS.items():
            for kw in keywords:
                if kw in text_lower:
                    ratio = len(kw) / max(len(text_lower), 1)
                    if ratio > 0.6 or text_lower == kw:
                        return field_type

    # 长文本推断 - 包含 @ 和公司关键词 → experience
    if any(kw in text_lower for kw in ["@", "公司", "科技", "集团", "有限", "corporation", "inc", "ltd"]):
        return "experience"

    # 包含日期范围 → education 或 experience
    if any(kw in text_lower for kw in ["专业", "major", "gpa", "学位"]):
        return "education"

    if len(block.text) > 100:
        return "summary"

    return "unknown"


# ─── PDF 版式解析 ────────────────────────────────────────────────


def parse_pdf_layout(pdf_bytes: bytes) -> list[PageLayout]:
    """
    解析 PDF 的完整版式信息。

    Args:
        pdf_bytes: PDF 文件的字节数据

    Returns:
        每页的版式信息列表
    """
    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[PageLayout] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_rect = page.rect
        layout = PageLayout(
            page_num=page_idx,
            width=page_rect.width,
            height=page_rect.height,
        )

        # ── 提取文本块 ──
        blocks = page.get_text("dict")["blocks"]
        block_idx = 0
        for block in blocks:
            if block["type"] == 0:  # 文本块
                for line in block["lines"]:
                    text = "".join([span["text"] for span in line["spans"]])
                    if not text.strip():
                        continue

                    # 取第一个 span 的样式作为代表
                    first_span = line["spans"][0]
                    font_size = first_span.get("size", 10.0)
                    font_name = first_span.get("font", "helv")
                    # 颜色：sRGB 整数转 0-1 浮点
                    raw_color = first_span.get("color", 0)
                    if isinstance(raw_color, int):
                        r = ((raw_color >> 16) & 0xFF) / 255.0
                        g = ((raw_color >> 8) & 0xFF) / 255.0
                        b = (raw_color & 0xFF) / 255.0
                    else:
                        r, g, b = 0.0, 0.0, 0.0

                    is_bold = "bold" in font_name.lower() or "Bold" in font_name

                    tb = TextBlock(
                        text=text.strip(),
                        bbox=tuple(line["bbox"]),
                        font_size=font_size,
                        font_name=font_name,
                        color=(r, g, b),
                        page_num=page_idx,
                        block_index=block_idx,
                        is_bold=is_bold,
                    )
                    tb.field_type = classify_text_block(tb)
                    layout.text_blocks.append(tb)
                    block_idx += 1

            elif block["type"] == 1:  # 图片块
                # 图片信息在后续步骤中提取
                pass

        # ── 提取照片 ──
        images = page.get_images(full=True)
        for img_info in images:
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                # 获取图片在页面上的位置
                img_rects = page.get_image_rects(xref)
                if img_rects:
                    for rect in img_rects:
                        bbox = (rect[0], rect[1], rect[2], rect[3])
                        photo = PhotoInfo(
                            xref=xref,
                            bbox=bbox,
                            width=base_image.get("width", 0),
                            height=base_image.get("height", 0),
                            page_num=page_idx,
                            image_bytes=img_bytes,
                        )
                        layout.photos.append(photo)
                else:
                    # 没有位置信息的图片也记录
                    photo = PhotoInfo(
                        xref=xref,
                        bbox=(0, 0, 0, 0),
                        width=base_image.get("width", 0),
                        height=base_image.get("height", 0),
                        page_num=page_idx,
                        image_bytes=img_bytes,
                    )
                    layout.photos.append(photo)
            except Exception as e:
                logger.warning(f"提取图片失败 (xref={xref}): {e}")

        pages.append(layout)

    doc.close()
    return pages


# ─── 文本块分组 ──────────────────────────────────────────────────


def group_blocks_by_field(pages: list[PageLayout]) -> dict[str, list[TextBlock]]:
    """
    将所有文本块按字段类型分组。

    Returns:
        {"summary": [...], "experience": [...], "skills": [...], "projects": [...], "name": [...], ...}
    """
    groups: dict[str, list[TextBlock]] = {}
    for page in pages:
        for block in page.text_blocks:
            groups.setdefault(block.field_type, []).append(block)
    return groups


# ─── PDF 重写 ────────────────────────────────────────────────────

# 字体缓存
_font_cache: dict[str, str] = {}


def _resolve_fitz_font(font_name: str) -> str:
    """
    将 PDF 中的字体名解析为 PyMuPDF 可用的字体名。

    关键发现：PyMuPDF 1.27 的 fontfile 参数对中文 .ttf/.ttc 不生效（输出 ????）。
    唯一能正确渲染中文的是内置 CJK 字体 china-ss。

    Returns:
        PyMuPDF 字体名（始终返回 "china-ss" 以确保中文正确渲染）
    """
    return "china-ss"


def _rects_overlap(r1: tuple[float, float, float, float], r2: tuple[float, float, float, float]) -> bool:
    """检查两个矩形是否有重叠"""
    return not (r1[2] <= r2[0] or r2[2] <= r1[0] or r1[3] <= r2[1] or r2[3] <= r1[1])


def rewrite_pdf(
    pdf_bytes: bytes,
    pages: list[PageLayout],
    optimized_texts: dict[int, str],  # {block_index: new_text}
    output_path: str,
) -> str:
    """
    在 PDF 上原地重写文本，100% 保留样式和照片。

    核心策略：
    1. 白色矩形覆盖旧文字 → 插入新文字（不碰内容流，最安全）
    2. 照片区域跳过白色覆盖（避免盖住照片）
    3. 处理完毕后显式重新插入所有照片（双重保险）

    为什么不用内容流操作：
    - _remove_text_from_content_stream 用 regex 操作原始内容流太脆弱
    - 压缩流、特殊编码、Form XObject 都可能导致操作失败
    - 用 draw_rect + insert_textbox 是 PyMuPDF 原生支持的可靠方式

    Args:
        pdf_bytes: 原始 PDF 字节
        pages: 解析后的版式信息（含照片数据）
        optimized_texts: {block_index: new_text} 映射
        output_path: 输出 PDF 路径

    Returns:
        输出 PDF 路径
    """
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_layout in pages:
        if page_layout.page_num >= len(doc):
            continue
        page = doc[page_layout.page_num]

        # 收集该页所有照片区域（用于避让）
        photo_bboxes = []
        for photo in page_layout.photos:
            pb = photo.bbox
            if pb and pb[2] > pb[0] and pb[3] > pb[1]:
                photo_bboxes.append(pb)

        for block in page_layout.text_blocks:
            if block.block_index not in optimized_texts:
                continue
            new_text = optimized_texts[block.block_index]
            if new_text == block.text:
                continue

            bbox = block.bbox
            # ── bbox 合法性校验 ──
            x0, y0, x1, y1 = bbox
            if x1 <= x0 or y1 <= y0:
                logger.warning(
                    f"[PDF重写] block={block.block_index} bbox 非法: ({x0:.1f},{y0:.1f},{x1:.1f},{y1:.1f})，跳过"
                )
                continue
            area = (x1 - x0) * (y1 - y0)
            page_area = page_layout.width * page_layout.height
            if page_area > 0 and area > page_area * 0.8:
                logger.warning(
                    f"[PDF重写] block={block.block_index} bbox 覆盖页面 {area/page_area*100:.0f}%，"
                    f"疑似解析异常，跳过"
                )
                continue
            # 裁剪到页面边界
            x0 = max(0, x0)
            y0 = max(0, y0)
            x1 = min(page_layout.width, x1)
            y1 = min(page_layout.height, y1)
            bbox = (x0, y0, x1, y1)

            rect = fitz.Rect(*bbox)

            # 检查是否与照片重叠
            overlaps_photo = any(_rects_overlap(bbox, pb) for pb in photo_bboxes)

            if overlaps_photo:
                # 不画白色矩形，避免盖住照片像素
                logger.info(
                    f"[照片保护] 文本块与照片重叠，跳过白色覆盖 "
                    f"(page={block.page_num}, block={block.block_index})"
                )
            else:
                # 白色矩形覆盖旧文字
                page.draw_rect(rect, color=None, fill=(1, 1, 1), overlay=True)

            # 写入新文字
            try:
                rc = page.insert_textbox(
                    fitz.Rect(*bbox), new_text,
                    fontname="china-ss",
                    fontsize=block.font_size,
                    color=block.color,
                    align=_get_text_alignment(block.alignment),
                )
                if rc < 0:
                    logger.info(f"文字超出，扩大重试 (block={block.block_index})")
                    expanded = fitz.Rect(bbox[0], bbox[1], bbox[2] + 80, bbox[3] + block.font_size * 4)
                    page.insert_textbox(expanded, new_text, fontname="china-ss",
                                        fontsize=block.font_size, color=block.color)
            except Exception as e:
                logger.warning(f"写入失败 (block={block.block_index}): {e}")
                try:
                    page.insert_text(
                        fitz.Point(bbox[0], bbox[1] + block.font_size),
                        new_text, fontname="china-ss",
                        fontsize=block.font_size, color=block.color,
                    )
                except Exception as e2:
                    logger.error(f"回退写入也失败: {e2}")

        # ── 显式重新插入照片（双重保险）──
        for photo in page_layout.photos:
            if not photo.image_bytes or len(photo.image_bytes) == 0:
                continue
            pbbox = photo.bbox
            if not pbbox or pbbox[2] <= pbbox[0] or pbbox[3] <= pbbox[1]:
                # 没有有效 bbox，用图片尺寸估算（放页面右上角）
                page_w = page_layout.width
                pw = photo.width or 80
                ph = photo.height or 100
                pbbox = (page_w - pw - 30, 30, page_w - 30, 30 + ph)

            try:
                photo_rect = fitz.Rect(*pbbox)
                # 白色覆盖旧区域
                page.draw_rect(photo_rect, color=None, fill=(1, 1, 1), overlay=True)
                # 重新插入照片
                page.insert_image(photo_rect, stream=photo.image_bytes)
                logger.debug(
                    f"[照片恢复] page={photo.page_num}, bbox=({pbbox[0]:.0f},{pbbox[1]:.0f}), "
                    f"size={photo.width}x{photo.height}"
                )
            except Exception as e:
                logger.warning(f"[照片恢复失败] page={photo.page_num}: {e}")

    doc.save(output_path)
    doc.close()
    return output_path


def _remove_text_from_content_stream(page):
    """
    从 PDF 页面的内容流中移除所有文本操作符（BT...ET 块），
    保留所有图形操作符（矩形、线条、颜色填充等）。

    这样蓝色横幅、进度条、图标等矢量图形全部原样保留。
    """
    import re

    doc = page.parent  # 获取所属文档
    xrefs = page.get_contents()

    for xref in xrefs:
        raw = doc.xref_stream(xref)
        if not raw:
            continue

        text = raw.decode('latin-1')

        # 移除所有 BT...ET 块（文本操作符）
        cleaned = re.sub(r'BT\b.*?ET\b', '', text, flags=re.DOTALL)
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

        doc.update_stream(xref, cleaned.encode('latin-1'))


def _get_text_alignment(alignment: str) -> int:
    """将对齐方式字符串转为 PyMuPDF 常量"""
    mapping = {
        "left": 0,
        "center": 1,
        "right": 2,
    }
    return mapping.get(alignment, 0)


# ─── 便捷函数：完整流程 ──────────────────────────────────────────


def process_pdf_style_preserving(
    pdf_bytes: bytes,
    optimized_texts: dict[int, str],
    output_path: Optional[str] = None,
    pages: Optional[list[PageLayout]] = None,
) -> bytes:
    """
    一站式 PDF 版式保留处理。

    1. 解析 PDF 版式（如果未提供 pages）
    2. 原地重写文本
    3. 返回新的 PDF 字节

    Args:
        pdf_bytes: 原始 PDF 字节
        optimized_texts: {block_index: new_text} 映射（使用全局 block_index）
        output_path: 可选的输出路径
        pages: 可选的已解析版式信息（避免重复解析，且保持 block_index 一致）

    Returns:
        优化后的 PDF 字节
    """
    if pages is None:
        pages = parse_pdf_layout(pdf_bytes)

    if output_path is None:
        output_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "temp_conversions",
            f"pdf_rewritten_{uuid.uuid4().hex[:8]}.pdf",
        )
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

    rewrite_pdf(pdf_bytes, pages, optimized_texts, output_path)

    with open(output_path, "rb") as f:
        result = f.read()

    # 清理临时文件
    try:
        os.remove(output_path)
    except OSError:
        pass

    return result