"""
图片简历版式提取器与合成器（视觉模型 + Pillow）。

核心能力：
1. 调用视觉模型（settings.LLM_MODEL_VISION）分析简历图片，提取版式 JSON
2. 裁剪并保存照片区域
3. 使用 Pillow 按原坐标/样式合成优化后的文字
4. 贴回照片到原位置
"""

import os
import io
import uuid
import json
import base64
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image, ImageDraw, ImageFont
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
VISION_TIMEOUT = 90.0  # 视觉模型超时（秒）

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

2. **photo_bbox**（仔细检查，不要遗漏）：
   - 人脸照片/证件照/职业照/人物头像的矩形区域（圆形头像取外接矩形）
   - 照片通常位于简历顶部左侧或右侧（中文简历常见右上角或左上角）
   - 特征：蓝色/白色背景、带有边框的方形/圆形区域、人物面部
   - 请仔细扫描简历顶部区域（上方 1/3），确认是否有照片
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

    def _make_request():
        return client.chat.completions.create(
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
            timeout=VISION_TIMEOUT,
            response_format={"type": "json_object"},
        )

    for attempt in range(MAX_RETRIES):
        try:
            resp = await _make_request()
            break
        except Exception as e:
            error_msg = str(e).lower()
            if "response_format" in error_msg or "json_object" in error_msg:
                # 去掉 response_format 重试
                try:
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
                        timeout=VISION_TIMEOUT,
                    )
                    break
                except Exception as e2:
                    if attempt == MAX_RETRIES - 1:
                        raise
                    logger.warning(f"视觉模型调用失败 (attempt {attempt + 1}/{MAX_RETRIES}): {e2}")
                    await asyncio.sleep(1 * (attempt + 1))
                    continue
            if attempt == MAX_RETRIES - 1:
                raise
            logger.warning(f"视觉模型调用失败 (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            await asyncio.sleep(1 * (attempt + 1))

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
        logger.info("[照片检测] 视觉模型未检测到照片，尝试启发式检测...")
        layout.photo_bbox = _detect_photo_heuristic(img)
        if layout.photo_bbox:
            logger.info(f"[照片检测] 启发式检测成功: {layout.photo_bbox}")
        else:
            logger.warning("[照片检测] 未检测到照片，跳过照片保留")

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


def _find_actual_text_bbox(img: Image.Image, bbox: tuple, search_margin: int = 50) -> tuple | None:
    """
    在模型 bbox 周围搜索，返回实际文字像素的包围盒。

    模型给出的 bbox 偏差可能很大（尤其多行文本）。此函数在 bbox ± search_margin
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


def _validate_and_clamp_bbox(
    bbox: tuple, img_width: int, img_height: int, block_idx: int, text_preview: str = ""
) -> tuple[int, int, int, int] | tuple[None, None, None, None]:
    """
    校验并裁剪 bbox 坐标，防止视觉模型返回非法坐标导致内容错位。

    常见非法情况：
    1. bbox 覆盖整个页面（全 0 或全图片尺寸）
    2. 坐标超出图片范围
    3. 区域面积过大（> 80% 页面）
    4. 区域面积过小或为负
    5. 坐标顺序颠倒（x0 > x1 或 y0 > y1）

    Returns:
        合法时返回 (x0, y0, x1, y1)，非法时返回 (None, None, None, None)
    """
    try:
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
    except (ValueError, IndexError, TypeError):
        logger.warning(f"[BBox校验] block={block_idx} bbox 无法解析: {bbox}")
        return None, None, None, None

    # 坐标顺序修正
    if x0 > x1:
        x0, x1 = x1, x0
    if y0 > y1:
        y0, y1 = y1, y0

    area = (x1 - x0) * (y1 - y0)
    img_area = img_width * img_height

    # 检查：面积为零或负
    if area <= 0:
        logger.warning(f"[BBox校验] block={block_idx} 面积为零: bbox=({x0},{y0},{x1},{y1})")
        return None, None, None, None

    # 检查：bbox 覆盖整个页面（视觉模型常见错误）
    if area > img_area * 0.8:
        logger.warning(
            f"[BBox校验] block={block_idx} bbox 覆盖页面 {area/img_area*100:.0f}%，"
            f"疑似视觉模型错误，跳过: text='{text_preview}'"
        )
        return None, None, None, None

    # 检查：坐标完全在图片外
    if x1 <= 0 or y1 <= 0 or x0 >= img_width or y0 >= img_height:
        logger.warning(f"[BBox校验] block={block_idx} bbox 完全在图片外: ({x0},{y0},{x1},{y1})")
        return None, None, None, None

    # 裁剪到图片边界内
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(img_width, x1)
    y1 = min(img_height, y1)

    # 检查：裁剪后区域是否过小
    if (x1 - x0) < 5 or (y1 - y0) < 5:
        logger.warning(f"[BBox校验] block={block_idx} 裁剪后区域过小: ({x0},{y0},{x1},{y1})")
        return None, None, None, None

    return x0, y0, x1, y1


def composite_image(
    original_bytes: bytes,
    layout: ImageLayout,
    optimized_texts: dict[int, str],  # {block_index: new_text}
) -> bytes:
    """
    合成优化后的简历图片（保留原简历全部视觉风格）。

    核心原则：
    - 原简历的背景、装饰、线条、颜色、字体样式全部保留
    - 只替换被优化的文字区域，替换后位置/大小/颜色与原版一致
    - 照片（证件照/职业照）像素级还原
    - 姓名、联系方式等受保护字段不做任何修改

    流程：
    1. 从原图裁剪照片区域像素（后续原样还原）
    2. 对每个需优化的文字块：
       a. 从文字区域四边外侧采样真实背景色
       b. 用背景色填充文字区域（带边距，彻底擦除旧文字像素）
       c. 在原始精确位置写入优化后文字（保持字号、颜色一致）
    3. 将照片像素原样还原（覆盖任何被误擦的区域）
    """
    # 加载原图
    original_img = Image.open(io.BytesIO(original_bytes)).convert("RGB")
    img = original_img.copy()
    draw = ImageDraw.Draw(img)

    # ── 1. 保存照片区域像素 ──
    photo_pixels = None
    photo_rect = None
    if layout.photo_bbox:
        px0, py0, px1, py1 = layout.photo_bbox
        px0, py0 = max(0, px0), max(0, py0)
        px1, py1 = min(img.width, px1), min(img.height, py1)
        if px1 > px0 and py1 > py0:
            photo_pixels = original_img.crop((px0, py0, px1, py1))
            photo_rect = (px0, py0, px1, py1)

    # ── 2. 逐块擦除旧文字 + 写入新文字 ──
    ERASE_PADDING = 20  # 擦除边距（像素），确保旧文字边缘完全清除

    for idx, block in enumerate(layout.blocks):
        if idx not in optimized_texts:
            continue
        new_text = optimized_texts[idx]
        if new_text == block.text:
            continue

        # 跳过章节标题（不修改）
        if block.is_header:
            continue

        # 跳过白字区块（白字在深色背景上，如蓝底章节标题）
        text_color_lower = block.color.lower().strip()
        is_white_text = text_color_lower in ('#ffffff', '#fff', 'white', 'rgb(255,255,255)')
        if is_white_text:
            continue

        # ── bbox 合法性校验 ──
        bx0, by0, bx1, by1 = _validate_and_clamp_bbox(
            block.bbox, img.width, img.height, idx, block.text[:30]
        )
        if bx0 is None:
            continue  # 跳过非法 bbox

        # ── 像素扫描修正 bbox（修正视觉模型 1-15px 偏差）──
        actual_bbox = _find_actual_text_bbox(original_img, (bx0, by0, bx1, by1))
        if actual_bbox:
            bx0, by0, bx1, by1 = actual_bbox
            logger.debug(f"[bbox修正] block={idx} 修正后: ({bx0},{by0},{bx1},{by1})")
        else:
            logger.debug(f"[bbox修正] block={idx} 未找到文字像素，使用原始 bbox")

        ex0 = max(0, bx0 - ERASE_PADDING)
        ey0 = max(0, by0 - ERASE_PADDING)
        ex1 = min(img.width, bx1 + ERASE_PADDING)
        ey1 = min(img.height, by1 + ERASE_PADDING)
        if ex1 <= ex0 or ey1 <= ey0:
            continue

        # 跳过与照片重叠的块
        if photo_rect and _check_overlap((ex0, ey0, ex1, ey1), photo_rect) > 0.3:
            continue

        # ── 裁剪擦除框，避免覆盖相邻块的内容 ──
        for other in layout.blocks:
            if other is block:
                continue
            obx0, oby0, obx1, oby1 = other.bbox
            # 水平重叠时才检查
            if obx0 >= ex1 or obx1 <= ex0:
                continue
            # 上方块：裁剪擦除框上边界
            if oby1 <= ey0 + ERASE_PADDING and oby1 > ey0:
                ey0 = max(ey0, oby1 + 2)
            # 下方块：裁剪擦除框下边界
            if oby0 >= ey1 - ERASE_PADDING and oby0 < ey1:
                ey1 = min(ey1, oby0 - 2)

        if ex1 <= ex0 or ey1 <= ey0:
            continue

        # ── 用背景色填充擦除区域（彻底覆盖旧文字像素）──
        bg_color = _sample_background_color(img, (ex0, ey0, ex1, ey1))
        draw.rectangle([ex0, ey0, ex1, ey1], fill=bg_color)

        # 解析文字颜色
        try:
            color_hex = block.color.lstrip("#")
            color_rgb = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))
        except (ValueError, IndexError):
            color_rgb = (0, 0, 0)

        # 获取字体
        font_size = max(10, min(block.font_size, 48))
        font = _get_cjk_font(font_size)

        # ── 限制写入高度：防止新文字压住下方模块 ──
        capped_y1 = by1
        for other in layout.blocks:
            if other is block:
                continue
            oy0 = other.bbox[1]
            # 找到正下方且水平有重叠的块
            if oy0 > by0 and other.bbox[0] < bx1 and other.bbox[2] > bx0:
                gap = oy0 - by1
                if gap < 20:  # 间距 < 20px，有压住风险
                    capped_y1 = min(by1, oy0 - 3)  # 留 3px 安全间距
                    if capped_y1 < by0 + 10:
                        capped_y1 = by0 + 10  # 最小高度（足够容纳 6px 最小字号）
                    logger.debug(f"[下方保护] block={idx} y1: {by1} → {capped_y1} "
                                 f"(下方 block 间距={gap}px)")
                break  # 只检查最近的

        # 在原始精确位置写入新文字（不加边距，但限制最大高度）
        draw_bbox = (bx0, by0, bx1, capped_y1)
        _draw_text_in_box(draw, new_text, draw_bbox, font, color_rgb)

    # ── 3. 还原照片像素 ──
    if photo_pixels and photo_rect:
        img.paste(photo_pixels, (photo_rect[0], photo_rect[1]))

    # 输出
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
    采样擦除区域的背景色。

    策略：在擦除框四角内侧各取 3x3 像素，过滤暗色后取中位数。
    四角采样确保覆盖不同背景区域，中位数抗装饰线条/色块干扰。
    """
    x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
    w, h = img.size

    samples = []
    margin = 3
    sample_size = 3

    for dx in range(sample_size):
        for dy in range(sample_size):
            # 左上角
            px, py = x0 + margin + dx, y0 + margin + dy
            if 0 <= px < w and 0 <= py < h:
                samples.append(img.getpixel((px, py)))
            # 右上角
            px, py = x1 - margin - dx, y0 + margin + dy
            if 0 <= px < w and 0 <= py < h:
                samples.append(img.getpixel((px, py)))
            # 左下角
            px, py = x0 + margin + dx, y1 - margin - dy
            if 0 <= px < w and 0 <= py < h:
                samples.append(img.getpixel((px, py)))
            # 右下角
            px, py = x1 - margin - dx, y1 - margin - dy
            if 0 <= px < w and 0 <= py < h:
                samples.append(img.getpixel((px, py)))

    # 过滤掉明显的文字像素（暗色）
    bright_samples = [p for p in samples if p[0] > 180 and p[1] > 180 and p[2] > 180]
    if bright_samples:
        samples = bright_samples

    if not samples:
        return (245, 245, 245)

    # 使用中位数抗异常值
    r = sorted(p[0] for p in samples)[len(samples) // 2]
    g = sorted(p[1] for p in samples)[len(samples) // 2]
    b = sorted(p[2] for p in samples)[len(samples) // 2]
    return (r, g, b)


def _draw_text_in_box(
    draw: ImageDraw.ImageDraw,
    text: str,
    bbox: tuple[int, int, int, int],
    font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
):
    """
    在指定矩形区域内绘制文字，支持自动换行和字号自适应。

    如果文字超出宽度，自动换行；超出高度则自动缩小字号重试。
    """
    x0, y0, x1, y1 = bbox
    max_width = x1 - x0
    max_height = y1 - y0

    _font = font
    _font_size = font.size if hasattr(font, 'size') else 14

    # 字号自适应：最多尝试 7 次，每次缩小 2px（最小 4px）
    for shrink_attempt in range(7):
        if shrink_attempt > 0:
            _font_size = max(4, _font_size - 2)
            _font = _get_cjk_font(_font_size)
            logger.debug(f"[字号自适应] 缩小字号至 {_font_size}px (attempt {shrink_attempt})")

        # 计算行高（基于字号，适当紧凑）
        try:
            test_bbox = draw.textbbox((0, 0), "测试Tg", font=_font)
            actual_height = test_bbox[3] - test_bbox[1]
            line_height = actual_height + 2
        except (AttributeError, TypeError):
            line_height = int(_font.size * 1.3) if hasattr(_font, 'size') else 20

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
                bbox_test = draw.textbbox((0, 0), test_line, font=_font)
                test_width = bbox_test[2] - bbox_test[0]
            except (AttributeError, TypeError):
                try:
                    test_width = _font.getlength(test_line)
                except (AttributeError, TypeError):
                    test_width = len(test_line) * (_font.size * 0.6 if hasattr(_font, 'size') else 10)

            if test_width <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = char

        if current_line:
            lines.append(current_line)

        # 检查是否超出高度
        total_height = len(lines) * line_height
        if total_height <= max_height + 2:
            # 可以放下，结束适配
            break
        # 超出高度，缩小字号重试
        lines = []

    # 绘制每一行
    y = y0
    for line in lines:
        if y + line_height > y1:  # 严格不超出 bbox 下边界
            break
        draw.text((x0, y), line, font=_font, fill=color)
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