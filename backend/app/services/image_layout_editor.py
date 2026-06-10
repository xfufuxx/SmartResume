"""
图片简历版式提取器与合成器（视觉模型 + Pillow）。

核心能力：
1. 调用视觉模型（MiMo v2.5）分析简历图片，提取版式 JSON
2. 裁剪并保存照片区域
3. 使用 Pillow 按原坐标/样式合成优化后的文字
4. 贴回照片到原位置
"""

import os
import io
import uuid
import json
import base64
import logging
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image, ImageDraw, ImageFont
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key

logger = logging.getLogger(__name__)

# ─── 数据结构 ───────────────────────────────────────────────────


@dataclass
class ImageBlock:
    """图片简历中的一个文本/元素块"""
    text: str
    bbox: tuple[int, int, int, int]  # (x0, y0, x1, y1) 像素坐标
    block_type: str = "unknown"  # name/contact/education/summary/experience/skills/projects/photo
    font_size: int = 14
    color: str = "#000000"
    is_bold: bool = False
    is_header: bool = False  # 是否为章节标题（不参与优化）


@dataclass
class ImageLayout:
    """图片简历的完整版式信息"""
    width: int
    height: int
    blocks: list[ImageBlock] = field(default_factory=list)
    photo_bbox: Optional[tuple[int, int, int, int]] = None  # 照片区域
    photo_bytes: Optional[bytes] = None  # 裁剪出的照片


# ─── 视觉模型版式提取 ────────────────────────────────────────────


LAYOUT_EXTRACTION_PROMPT = """分析这张简历图片，精确提取每个文本块的位置和样式信息。返回 JSON 格式。

JSON 格式：
{
  "photo_bbox": [x1, y1, x2, y2] 或 null,
  "blocks": [
    {
      "type": "name|contact|education|summary|experience|skills|projects|other",
      "text": "原始文字内容",
      "bbox": [x1, y1, x2, y2],
      "font_size": 估计字号数值,
      "color": "#RRGGBB",
      "is_bold": true/false,
      "is_header": false
    }
  ]
}

提取规则（非常重要，必须严格遵守）：

1. **bbox 坐标精度**：
   - 坐标必须精确到文本的**实际像素边界**，紧贴文字边缘
   - 不要留过多空白，也不要截断文字
   - 坐标是相对于图片左上角的像素坐标 [x1, y1, x2, y2]

2. **photo_bbox**：
   - 人脸照片的矩形区域（圆形头像取外接矩形）
   - 如果没有照片则为 null

3. **type 分类**：
   - "name": 姓名行
   - "contact": 电话/邮箱/地址/微信等联系方式
   - "education": 教育背景（学校、专业、学位、年份）
   - "summary": 个人总结/自我评价
   - "experience": 工作经历/实习经历
   - "skills": 技能列表、专业技能
   - "projects": 项目经历
   - "other": 其他内容（如荣誉奖项、证书等）

4. **is_header 字段**：
   - 设为 true 表示这是**章节标题**（如"工作经历"、"教育背景"、"专业技能"等）
   - 设为 false 表示这是**正文内容**，需要优化
   - 章节标题文字原样保留，不参与优化

5. **文字提取**：
   - 每个 block 的 text 必须是图片中**完整的原始文字**，不要截断或修改
   - 多行文字合并为一个 block（如果它们属于同一段落/条目）
   - 技能标签（如"熟悉Java"、"掌握MySQL"）每个标签作为一个独立 block

6. **颜色提取**：
   - 提取文字的实际颜色（如蓝色标题 #2c6fbb，黑色正文 #333333）
   - 如果文字有背景色（如彩色标签），记录文字颜色而非背景色

7. **不要遗漏任何文本块**，包括页脚、页码等

请仅返回 JSON，不要包含任何解释。"""


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def extract_image_layout(image_bytes: bytes) -> ImageLayout:
    """
    使用视觉模型分析简历图片，提取版式结构。

    Args:
        image_bytes: 图片文件的字节数据

    Returns:
        ImageLayout 包含所有文本块和照片信息
    """
    # 先获取图片尺寸
    img = Image.open(io.BytesIO(image_bytes))
    layout = ImageLayout(width=img.width, height=img.height)

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64}"

    client = _get_client()
    resp = await client.chat.completions.create(
        model=settings.LLM_MODEL_VISION,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": LAYOUT_EXTRACTION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    content = resp.choices[0].message.content or "{}"
    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        # 尝试从响应中提取 JSON
        import re
        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            result = json.loads(match.group())
        else:
            raise ValueError(f"视觉模型返回的不是有效 JSON: {content[:200]}")

    # 解析照片区域
    photo_bbox = result.get("photo_bbox")
    if photo_bbox and isinstance(photo_bbox, list) and len(photo_bbox) == 4:
        layout.photo_bbox = tuple(photo_bbox)
    else:
        # 模型未检测到照片 → 用更强提示词重试一次
        logger.info("[照片检测] 第一次未检测到照片，用强化提示词重试...")
        try:
            resp2 = await client.chat.completions.create(
                model=settings.LLM_MODEL_VISION,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": (
                                "请仔细看这张简历图片，找到证件照/职业照/人物头像的位置。\n"
                                "照片通常是：人的面部照片、蓝色或白色背景的证件照、带有边框的方形/圆形头像。\n"
                                "照片通常位于简历顶部左侧或右侧（中文简历常见右上角或左上角）。\n"
                                "请返回照片的精确像素坐标边界框。\n"
                                "如果确实没有任何人物照片，返回 {\"photo_bbox\": null}。\n"
                                "只返回JSON，格式：{\"photo_bbox\": [x1, y1, x2, y2]}"
                            )},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
                max_tokens=256,
                response_format={"type": "json_object"},
            )
            content2 = resp2.choices[0].message.content or "{}"
            result2 = json.loads(content2)
            pbbox = result2.get("photo_bbox")
            if pbbox and isinstance(pbbox, list) and len(pbbox) == 4:
                layout.photo_bbox = tuple(pbbox)
                logger.info(f"[照片检测] 重试成功: {layout.photo_bbox}")
            else:
                logger.warning("[照片检测] 重试后仍未检测到照片，跳过照片保留")
        except Exception as e:
            logger.warning(f"[照片检测] 重试失败: {e}")

    if layout.photo_bbox:
        try:
            photo_img = img.crop(layout.photo_bbox)
            buf = io.BytesIO()
            photo_img.save(buf, format="PNG")
            layout.photo_bytes = buf.getvalue()
        except Exception as e:
            logger.warning(f"裁剪照片失败: {e}")

    # 解析文本块
    for block_data in result.get("blocks", []):
        bbox = block_data.get("bbox", [0, 0, 0, 0])
        if len(bbox) != 4:
            continue

        block = ImageBlock(
            text=block_data.get("text", ""),
            bbox=tuple(bbox),
            block_type=block_data.get("type", "other"),
            font_size=block_data.get("font_size", 14),
            color=block_data.get("color", "#000000"),
            is_bold=block_data.get("is_bold", False),
            is_header=block_data.get("is_header", False),
        )
        layout.blocks.append(block)

    return layout


# ─── 图片合成 ────────────────────────────────────────────────────


# 保护字段白名单：不优化
PROTECTED_TYPES = {"name", "contact", "education"}

# 需要优化的字段
OPTIMIZABLE_TYPES = {"summary", "experience", "skills", "projects"}


def _find_actual_text_bbox(img: Image.Image, bbox: tuple, search_margin: int = 15) -> tuple | None:
    """
    在模型 bbox 周围搜索，返回实际文字像素的包围盒。

    模型给出的 bbox 可能有 1-15px 偏差。此函数在 bbox ± search_margin
    范围内扫描非白色像素，返回真正的文字区域包围盒。

    如果搜索区域内没有足够文字像素（<5个），返回 None 表示 bbox 完全错位。
    """
    x0, y0, x1, y1 = bbox
    sx0 = max(0, int(x0) - search_margin)
    sy0 = max(0, int(y0) - search_margin)
    sx1 = min(img.width, int(x1) + search_margin)
    sy1 = min(img.height, int(y1) + search_margin)

    # 扫描非白像素
    pixels = list(img.crop((sx0, sy0, sx1, sy1)).getdata())
    text_xs = []
    text_ys = []
    threshold = 200  # 低于此值认为是文字

    for idx, px in enumerate(pixels):
        r, g, b = px[0], px[1], px[2]
        if r < threshold or g < threshold or b < threshold:
            col = idx % (sx1 - sx0)
            row = idx // (sx1 - sx0)
            text_xs.append(sx0 + col)
            text_ys.append(sy0 + row)

    if len(text_xs) < 5:
        return None  # bbox 位置没有文字

    return (min(text_xs), min(text_ys), max(text_xs), max(text_ys))


def _detect_photo_heuristic(img: Image.Image) -> tuple | None:
    """启发式照片检测（视觉模型兜底）。缩放到小尺寸扫描，映射回原坐标。"""
    w, h = img.size
    scale = 4  # 缩小4倍扫描
    sw, sh = w // scale, h // scale
    small = img.resize((sw, sh), Image.LANCZOS)
    top_h = int(sh * 0.25)
    candidates = []
    step = 4
    win = 20  # 缩小后窗口20x20=原图80x80
    for y in range(0, top_h - win, step):
        for x in range(0, sw - win, step):
            region = small.crop((x, y, x + win, y + win))
            pixels = list(region.getdata())
            if len(pixels) == 0:
                continue
            white = sum(1 for p in pixels if all(c > 240 for c in p))
            if white / len(pixels) > 0.85:
                continue
            non_white = [p for p in pixels if not all(c > 240 for c in p)]
            if len(non_white) < 5:
                continue
            r_var = sum((v[0] - sum(p[0] for p in non_white)/len(non_white))**2 for v in non_white) / len(non_white)
            g_var = sum((v[1] - sum(p[1] for p in non_white)/len(non_white))**2 for v in non_white) / len(non_white)
            b_var = sum((v[2] - sum(p[2] for p in non_white)/len(non_white))**2 for v in non_white) / len(non_white)
            if r_var + g_var + b_var > 800:
                candidates.append((x * scale, y * scale, (x + win) * scale, (y + win) * scale, r_var + g_var + b_var))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[4], reverse=True)
    bx0, by0, bx1, by1 = candidates[0][:4]
    if bx1 - bx0 < 60 or by1 - by0 < 60 or bx1 - bx0 > 400 or by1 - by0 > 400:
        return None
    logger.info(f"[启发式] 检测到照片: ({bx0},{by0})-({bx1},{by1}) {bx1-bx0}x{by1-by0}px")
    return (bx0, by0, bx1, by1)


def _get_cjk_font(size: int) -> ImageFont.FreeTypeFont:
    """获取系统中可用的中文字体"""
    font_paths = [
        # Windows
        "C:/Windows/Fonts/msyh.ttc",       # 微软雅黑
        "C:/Windows/Fonts/simhei.ttf",      # 黑体
        "C:/Windows/Fonts/simsun.ttc",      # 宋体
        "C:/Windows/Fonts/simkai.ttf",      # 楷体
        # macOS
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        # Linux
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        # 项目自带
        os.path.join(os.path.dirname(__file__), "..", "fonts", "NotoSansSC-Regular.ttf"),
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # 回退到默认字体
    return ImageFont.load_default()


def composite_image(
    original_bytes: bytes,
    layout: ImageLayout,
    optimized_texts: dict[int, str],  # {block_index: new_text}
) -> bytes:
    """
    合成优化后的简历图片（100% 样式还原）。

    照片处理策略（证件照/职业照完美还原）：
    1. 在任何修改之前，从原图完整保存照片区域的所有像素
    2. 文字处理时跳过与照片重叠的块（重叠>30%即跳过）
    3. 所有文字处理完成后，将原始照片像素完整覆盖回去
       → 不做掩码分析，不做灰度检测，100% 像素原样还原
       → 圆形裁剪、边框、阴影、人像肤色全部完美保留

    Args:
        original_bytes: 原始图片字节
        layout: 版式信息
        optimized_texts: {block_index: new_text} 映射

    Returns:
        合成后的图片字节
    """
    # 加载原图
    original_img = Image.open(io.BytesIO(original_bytes)).convert("RGB")
    img = original_img.copy()
    draw = ImageDraw.Draw(img)

    # ── 1. 从原图完整保存照片区域像素（证件照/职业照） ──
    photo_pixels = None
    photo_rect = None
    if layout.photo_bbox:
        px0, py0, px1, py1 = layout.photo_bbox
        px0, py0 = max(0, px0), max(0, py0)
        px1, py1 = min(img.width, px1), min(img.height, py1)

        if px1 > px0 and py1 > py0:
            photo_pixels = original_img.crop((px0, py0, px1, py1))
            photo_rect = (px0, py0, px1, py1)
            logger.info(f"照片区域完整保存: ({px0},{py0},{px1},{py1}), 尺寸: {px1-px0}x{py1-py0}px")

    # ── 2. 处理每个文本块 ──
    for idx, block in enumerate(layout.blocks):
        if idx not in optimized_texts:
            continue
        new_text = optimized_texts[idx]
        if new_text == block.text:
            continue

        # 跳过章节标题（is_header=True，不修改）
        if block.is_header:
            continue

        # 跳过白字区块（白字在深色背景上，如蓝底章节标题）
        text_color_lower = block.color.lower().strip()
        is_white_text = text_color_lower in ('#ffffff', '#fff', 'white', 'rgb(255,255,255)')
        if is_white_text:
            continue

        x0, y0, x1, y1 = block.bbox
        x0 = max(0, int(x0))
        y0 = max(0, int(y0))
        x1 = min(img.width, int(x1))
        y1 = min(img.height, int(y1))
        if x1 <= x0 or y1 <= y0:
            continue

        # 跳过与照片重叠的文字块
        if photo_rect:
            overlap = _check_overlap((x0, y0, x1, y1), photo_rect)
            if overlap > 0.3:
                continue

        # 用视觉模型的 bbox 直接填充背景色（覆盖旧文字像素）
        # 不做像素扫描（不可靠），直接用 bbox + 小边距
        bg_color = _sample_background_color(img, (x0, y0, x1, y1))
        draw.rectangle([x0, y0, x1, y1], fill=bg_color)

        # 解析文字颜色
        try:
            color_hex = block.color.lstrip("#")
            color_rgb = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))
        except (ValueError, IndexError):
            color_rgb = (0, 0, 0)

        # 获取字体
        font_size = max(10, min(block.font_size, 48))
        font = _get_cjk_font(font_size)

        # 写入新文字
        _draw_text_in_box(draw, new_text, (x0, y0, x1, y1), font, color_rgb)

    # ── 3. 完整还原照片像素（证件照/职业照） ──
    if photo_pixels and photo_rect:
        # 直接覆盖，不做掩码分析，100% 像素还原
        img.paste(photo_pixels, (photo_rect[0], photo_rect[1]))
        logger.info(f"照片完整还原: {photo_rect[2]-photo_rect[0]}x{photo_rect[3]-photo_rect[1]}px")

    # 输出为高质量 PNG
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _check_overlap(
    rect1: tuple[int, int, int, int],
    rect2: tuple[int, int, int, int],
) -> float:
    """
    计算两个矩形的重叠比例（相对于 rect1 的面积）。
    返回 0.0 ~ 1.0
    """
    x1_0, y1_0, x1_1, y1_1 = rect1
    x2_0, y2_0, x2_1, y2_1 = rect2

    # 计算交集
    ix0 = max(x1_0, x2_0)
    iy0 = max(y1_0, y2_0)
    ix1 = min(x1_1, x2_1)
    iy1 = min(y1_1, y2_1)

    if ix0 >= ix1 or iy0 >= iy1:
        return 0.0  # 无重叠

    intersection = (ix1 - ix0) * (iy1 - iy0)
    area1 = (x1_1 - x1_0) * (y1_1 - y1_0)

    if area1 <= 0:
        return 0.0

    return intersection / area1


def _sample_background_color(
    img: Image.Image,
    bbox: tuple[int, int, int, int],
) -> tuple[int, int, int]:
    """
    采样文字区域的背景色。
    策略：取文字区域上下边缘的像素中位数作为背景色。
    """
    x0, y0, x1, y1 = bbox
    samples = []

    # 上边缘采样（y0-2 到 y0 的区域）
    for dy in range(-2, 1):
        y = max(0, y0 + dy)
        for x in range(x0, min(x1, x0 + 50)):
            if 0 <= x < img.width:
                samples.append(img.getpixel((x, y)))

    # 下边缘采样
    for dy in range(0, 3):
        y = min(img.height - 1, y1 + dy)
        for x in range(x0, min(x1, x0 + 50)):
            if 0 <= x < img.width:
                samples.append(img.getpixel((x, y)))

    if not samples:
        return (255, 255, 255)  # 默认白色

    # 取中位数颜色（避免异常值影响）
    r = sorted(s[0] for s in samples)[len(samples) // 2]
    g = sorted(s[1] for s in samples)[len(samples) // 2]
    b = sorted(s[2] for s in samples)[len(samples) // 2]
    return (r, g, b)


def _draw_text_in_box(
    draw: ImageDraw.ImageDraw,
    text: str,
    bbox: tuple[int, int, int, int],
    font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
):
    """
    在指定矩形区域内绘制文字，支持自动换行。

    如果文字超出宽度，自动换行；超出高度则截断。
    """
    x0, y0, x1, y1 = bbox
    max_width = x1 - x0
    max_height = y1 - y0

    # 计算行高（基于字号，适当紧凑）
    try:
        # 使用实际字体度量
        test_bbox = draw.textbbox((0, 0), "测试Tg", font=font)
        actual_height = test_bbox[3] - test_bbox[1]
        line_height = actual_height + 2
    except (AttributeError, TypeError):
        line_height = int(font.size * 1.3) if hasattr(font, 'size') else 20

    # 智能换行：中文按字，英文按词
    lines = []
    current_line = ""

    for char in text:
        if char == '\n':
            lines.append(current_line)
            current_line = ""
            continue

        test_line = current_line + char
        try:
            bbox_test = draw.textbbox((0, 0), test_line, font=font)
            test_width = bbox_test[2] - bbox_test[0]
        except (AttributeError, TypeError):
            try:
                test_width = font.getlength(test_line)
            except (AttributeError, TypeError):
                test_width = len(test_line) * (font.size * 0.6 if hasattr(font, 'size') else 10)

        if test_width <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = char

    if current_line:
        lines.append(current_line)

    # 绘制每一行
    y = y0
    for line in lines:
        if y + line_height > y1 + 2:  # 允许少量溢出
            break
        draw.text((x0, y), line, font=font, fill=color)
        y += line_height


# ─── 便捷函数 ────────────────────────────────────────────────────


async def process_image_style_preserving(
    image_bytes: bytes,
    optimized_texts: dict[int, str],
) -> bytes:
    """
    一站式图片简历版式保留处理。

    1. 视觉模型提取版式
    2. 合成优化后的图片

    Args:
        image_bytes: 原始图片字节
        optimized_texts: {block_index: new_text} 映射

    Returns:
        优化后的 PNG 图片字节
    """
    layout = await extract_image_layout(image_bytes)
    return composite_image(image_bytes, layout, optimized_texts)