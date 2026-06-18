import uuid
import os
import io
import asyncio
import logging
from collections import Counter

from app.models.resume import Resume
from app.services.pdf_generator import generate_pdf_sync

logger = logging.getLogger(__name__)


async def _generate_styled_or_fallback(
    resume: Resume | None, optimized: dict, job_json: dict | None = None, custom_instructions: str | None = None, template: str | None = None
) -> bytes:
    """
    生成优化后的 PDF（版式保留优先，逐层回退）。

    策略（按优先级从高到低）：
    1. 文本型 PDF → PyMuPDF 原地编辑（保留矢量图形、字体、颜色、照片，文本可选中）
    2. 图片型 PDF / 图片文件 → 视觉模型提取内容 → 统一模板渲染 PDF + HTML（NEW）
    3. DOCX 文件 → 现有 DOCX 替换方案
    4. 任何失败 → 回退到模板 PDF

    第 2 层（统一模板）不需要严格复原原样式，使用专业的固定排版模板，
    输出格式统一、美观、稳定。

    如果 resume 为 None（如从纯文本一键优化），直接使用模板渲染。

    如果指定了 template 参数，跳过自动回退链，直接使用指定方案。
    """
    # 用户指定了模板方案 → 直接使用
    if template and resume is not None:
        if template == "jinja2":
            logger.info("[PDF生成] 用户指定 Jinja2 模板")
            return await asyncio.to_thread(generate_pdf_sync, optimized)
        if template == "html":
            logger.info("[PDF生成] 用户指定 HTML+Playwright 模板")
            try:
                pdf_bytes = await _run_styled_pdf_template(resume, optimized, job_json, custom_instructions)
                if pdf_bytes and len(pdf_bytes) > 1000:
                    return pdf_bytes
            except Exception as e:
                logger.warning(f"[PDF生成] HTML+Playwright 模板失败: {e}")
        if template == "latex":
            logger.info("[PDF生成] 用户指定 LaTeX 模板")
            try:
                pdf_bytes = await _run_styled_pdf_latex(resume, optimized, job_json, custom_instructions)
                if pdf_bytes and len(pdf_bytes) > 1000:
                    return pdf_bytes
            except Exception as e:
                logger.warning(f"[PDF生成] LaTeX 模板失败: {e}")
        if template == "preserve":
            logger.info("[PDF生成] 用户指定保留原样式 (PyMuPDF)")
            try:
                pdf_bytes = await _run_styled_pdf_text(resume, optimized, job_json, custom_instructions)
                if pdf_bytes and len(pdf_bytes) > 1000:
                    return pdf_bytes
            except Exception as e:
                logger.warning(f"[PDF生成] 保留原样式失败: {e}")
        # 指定模板失败，回退到 Jinja2
        logger.info(f"[PDF生成] 指定模板 {template} 失败，回退到 Jinja2 模板")
        return await asyncio.to_thread(generate_pdf_sync, optimized)

    if resume is None:
        # 纯文本来源（一键优化），根据 template 选择模板
        if template and template not in ("professional", "simple", "jinja2"):
            logger.info(f"[PDF生成] 纯文本来源不支持 '{template}' 方案，回退到专业分栏模板")
        template_name = (template if template in ("professional", "simple") else "professional") + ".html"
        logger.info("[PDF生成] 无原始简历文件，使用模板渲染")
        fallback_bytes = await asyncio.to_thread(generate_pdf_sync, optimized, template_name)
        logger.info(f"[PDF生成] 模板 PDF 生成完成 ({template_name}): {len(fallback_bytes)} bytes")
        return fallback_bytes

    file_type = (resume.file_type or "").lower()
    logger.info(f"[PDF生成] 文件类型: {file_type}, 原始文件: {resume.original_file_url}")

    if file_type == "pdf":
        # ── 第1层：PyMuPDF 原地编辑（文本型 PDF，保留矢量样式和照片）──
        try:
            logger.info("[PDF生成] 第1层尝试：PyMuPDF 原地编辑（保留矢量样式+照片）")
            pdf_bytes = await _run_styled_pdf_text(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] PyMuPDF 方案成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] PyMuPDF 方案失败: {e}")

        # ── 第1.5层：LaTeX 渲染（需要 xelatex/pdflatex，可选）──
        try:
            logger.info("[PDF生成] 第1.5层尝试：视觉模型提取内容 → LaTeX 编译 PDF")
            pdf_bytes = await _run_styled_pdf_latex(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] LaTeX 方案成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] LaTeX 方案失败: {e}")

        # ── 第2层：统一模板 HTML 渲染（图片型 PDF，无文本层）──
        try:
            logger.info("[PDF生成] 第2层尝试：视觉模型提取内容 → 统一模板渲染 PDF + HTML")
            pdf_bytes = await _run_styled_pdf_template(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] 统一模板方案成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] 统一模板方案失败: {e}")

    elif file_type in ("png", "jpg", "jpeg", "webp"):
        try:
            logger.info("[PDF生成] 图片简历，使用统一模板渲染...")
            pdf_bytes = await _run_styled_pdf_template(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] 统一模板渲染成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] 统一模板渲染失败: {e}")
    else:
        try:
            logger.info(f"[PDF生成] DOCX 文件，使用样式保留方案...")
            pdf_bytes = await asyncio.to_thread(
                _run_styled_pdf, resume, optimized
            )
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] DOCX 样式保留成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] DOCX 样式保留失败: {e}")

    # 回退：使用固定模板生成 PDF（在线程池中执行）
    logger.info("[PDF生成] 使用固定模板生成 PDF（回退方案）")
    fallback_bytes = await asyncio.to_thread(generate_pdf_sync, optimized)
    logger.info(f"[PDF生成] 回退模板 PDF 生成完成: {len(fallback_bytes)} bytes")
    return fallback_bytes


async def _run_styled_pdf_text(
    resume: Resume, optimized: dict, job_json: dict | None, custom_instructions: str | None = None
) -> bytes:
    """
    文本型 PDF 处理（PyMuPDF 原地编辑）。

    流程：
    1. 解析 PDF 版式（提取文本块位置/字体/颜色/大小 + 照片信息）
    2. 分类文本块为保护字段和优化字段
    3. 优化字段文本（MiMo 模型）
    4. 在原 PDF 上原地重写文本（白色覆盖旧文字 + 插入新文字）
    5. 照片、矢量图形、线条等全部原样保留

    优势：
    - 100% 保留原始 PDF 模板样式（字体、颜色、排版、背景）
    - 100% 保留照片（PyMuPDF 只修改文本，不碰图片对象）
    - 输出仍是文本型 PDF（文字可选中/搜索）
    - 不需要视觉模型 API 调用（快速、低成本）
    """
    # Step 1: 解析 PDF 版式（同步，线程池执行）
    pages, all_blocks = await asyncio.to_thread(_parse_pdf_layout_sync, resume)

    if not all_blocks:
        raise ValueError("PDF 无文本层，无法使用 PyMuPDF 方案（请使用视觉模型方案）")

    logger.info(
        f"[PyMuPDF] 解析完成: {len(pages)} 页, {len(all_blocks)} 个文本块, "
        f"字段分布: {_count_field_types(all_blocks)}"
    )

    # Step 2: 优化文本（异步，主事件循环执行）
    from app.services.text_optimizer import optimize_text_blocks

    optimized_texts = await optimize_text_blocks(all_blocks, job_json, custom_instructions)

    if not optimized_texts:
        raise ValueError("文本优化结果为空")

    changed = sum(1 for idx, new_text in optimized_texts.items()
                  if idx < len(all_blocks) and new_text != all_blocks[idx].text)
    logger.info(f"[PyMuPDF] 文本优化完成: {len(optimized_texts)} 个块, 其中 {changed} 个有变化")

    # Step 3: 重写 PDF（同步，线程池执行）
    pdf_bytes = await asyncio.to_thread(_rewrite_pdf_sync, resume, pages, optimized_texts)
    logger.info(f"[PyMuPDF] PDF 重写完成: {len(pdf_bytes)} bytes")
    return pdf_bytes


def _resolve_local_path(original_url: str) -> str:
    """将 original_file_url 解析为本地文件路径（支持HTTP URL和本地路径）"""
    if not original_url:
        raise ValueError("original_file_url 为空")
    # HTTP URL → 提取 /uploads/ 后面的路径
    if "/uploads/" in original_url:
        rel = original_url.split("/uploads/", 1)[-1]
        local_path = os.path.join("uploads", rel)
        if os.path.exists(local_path):
            return local_path
    # 绝对路径
    if os.path.isabs(original_url):
        if os.path.exists(original_url):
            return original_url
    # 相对路径
    local_path = os.path.join("uploads", original_url)
    if os.path.exists(local_path):
        return local_path
    raise FileNotFoundError(f"原始文件不存在: {original_url}")


def _parse_pdf_layout_sync(resume: Resume):
    """同步解析 PDF 版式"""
    from app.services.pdf_layout_editor import parse_pdf_layout

    local_path = _resolve_local_path(resume.original_file_url)

    with open(local_path, "rb") as f:
        pdf_bytes = f.read()

    pages = parse_pdf_layout(pdf_bytes)
    all_blocks = []
    for page in pages:
        all_blocks.extend(page.text_blocks)

    return pages, all_blocks


def _rewrite_pdf_sync(resume: Resume, pages, optimized_texts: dict) -> bytes:
    """同步重写 PDF（原地编辑文本，保留版式）"""
    from app.services.pdf_layout_editor import process_pdf_style_preserving

    local_path = _resolve_local_path(resume.original_file_url)

    with open(local_path, "rb") as f:
        pdf_bytes = f.read()

    # 传递 pages 避免重复解析，且保持 block_index 与 optimized_texts 一致
    return process_pdf_style_preserving(pdf_bytes, optimized_texts, pages=pages)


async def _run_styled_pdf_image(
    resume: Resume, optimized: dict, job_json: dict | None, custom_instructions: str | None = None
) -> bytes:
    """
    图片型 PDF 处理（PDF 无文本层，渲染为图片后用视觉模型处理）。

    流程：
    1. 渲染 PDF 每页为高 DPI 图片
    2. 视觉模型提取每页版式
    3. 优化文本
    4. Pillow 合成图片
    5. 将图片组合为 PDF
    """
    import fitz
    from app.services.image_layout_editor import extract_image_layout, composite_image
    from app.services.text_optimizer import optimize_image_blocks

    local_path = _resolve_local_path(resume.original_file_url)

    doc = await asyncio.to_thread(fitz.open, local_path)
    total_pages = len(doc)
    page_images = []

    logger.info(f"[视觉PDF] 开始处理: {total_pages} 页, 渲染DPI=300")

    try:
        for page_idx in range(total_pages):
            page = doc[page_idx]
            # 渲染为图片（300 DPI，高清还原）—— 在线程池中执行
            pix = await asyncio.to_thread(page.get_pixmap, dpi=300)
            img_bytes = await asyncio.to_thread(pix.tobytes, "png")
            logger.info(f"[视觉PDF] 第 {page_idx+1}/{total_pages} 页渲染完成: {pix.width}x{pix.height}px")

            try:
                # 提取版式
                layout = await extract_image_layout(img_bytes)
                block_types = {}
                for b in layout.blocks:
                    block_types[b.block_type] = block_types.get(b.block_type, 0) + 1
                logger.info(
                    f"[视觉PDF] 第 {page_idx+1} 页版式: {len(layout.blocks)} 块 "
                    f"(字段分布: {block_types}), 照片: {'有' if layout.photo_bbox else '无'}"
                )

                # 优化文本
                optimized_texts = await optimize_image_blocks(
                    layout.blocks, job_json, custom_instructions
                )
                logger.info(f"[视觉PDF] 第 {page_idx+1} 页文本优化: {len(optimized_texts)} 块")

                # 合成图片 —— 在线程池中执行
                result_img = await asyncio.to_thread(composite_image, img_bytes, layout, optimized_texts)
                logger.info(f"[视觉PDF] 第 {page_idx+1} 页合成完成: {len(result_img)} bytes")
                page_images.append(result_img)

            except Exception as page_err:
                logger.error(f"[视觉PDF] 第 {page_idx+1} 页处理失败，使用原图: {page_err}")
                page_images.append(img_bytes)  # 保留原图

    finally:
        doc.close()

    if not page_images:
        raise ValueError("所有页面处理均失败")

    # 将多页图片组合为 PDF（在线程池中执行）
    return await asyncio.to_thread(_images_to_pdf_sync, page_images)


async def _run_styled_pdf_template(
    resume: Resume, optimized: dict, job_json: dict | None, custom_instructions: str | None = None
) -> bytes:
    """
    统一模板渲染（视觉模型提取内容 → 统一 HTML 模板 → WeasyPrint 生成 PDF）。

    流程：
    1. 渲染 PDF / 读图片
    2. 视觉模型提取内容（文本块 + 照片区域）
    3. 优化文本
    4. 统一 HTML 模板排版（不尝试复原原样式）
    5. WeasyPrint 渲染为 PDF

    优势：
    - 输出稳定、格式统一、美观
    - 不需要 bbox 坐标精确匹配
    - 同时生成 HTML 和 PDF
    - 代码简单，无像素操作
    """
    import fitz
    from app.services.image_layout_editor import extract_image_layout
    from app.services.text_optimizer import optimize_image_blocks
    from app.services.resume_renderer import render_resume

    local_path = _resolve_local_path(resume.original_file_url)
    file_type = (resume.file_type or "").lower()

    # Step 1: 获取图片字节
    if file_type == "pdf":
        doc = await asyncio.to_thread(fitz.open, local_path)
        try:
            page = doc[0]  # 仅处理第 1 页
            pix = await asyncio.to_thread(page.get_pixmap, dpi=300)
            img_bytes = await asyncio.to_thread(pix.tobytes, "png")
            logger.info(f"[模板渲染] PDF 渲染为图片: {pix.width}x{pix.height}px")
        finally:
            doc.close()
    else:
        with open(local_path, "rb") as f:
            img_bytes = f.read()
        logger.info(f"[模板渲染] 读取图片: {len(img_bytes)} bytes")

    # Step 2: 视觉模型提取内容
    layout = await extract_image_layout(img_bytes)
    logger.info(f"[模板渲染] 版式提取完成: {len(layout.blocks)} 个块, 照片: {'有' if layout.photo_bbox else '无'}")

    # Step 3: 优化文本
    optimized_texts = await optimize_image_blocks(layout.blocks, job_json, custom_instructions)
    logger.info(f"[模板渲染] 文本优化完成: {len(optimized_texts)} 个块")

    # Step 4: 统一模板渲染 → PDF
    pdf_bytes, html = render_resume(
        blocks=layout.blocks,
        optimized_texts=optimized_texts,
        original_image_bytes=img_bytes,
        photo_bbox=layout.photo_bbox,
    )
    logger.info(f"[模板渲染] PDF 生成完成: {len(pdf_bytes)} bytes, HTML: {len(html)} 字符")

    return pdf_bytes


async def _run_styled_pdf_latex(
    resume: Resume, optimized: dict, job_json: dict | None, custom_instructions: str | None = None
) -> bytes | None:
    """
    LaTeX 渲染（视觉模型提取内容 → LaTeX 源码 → xelatex 编译 PDF）。

    需要系统安装 xelatex 或 pdflatex。没有编译器时只生成 .tex 文件不生成 PDF，
    直接返回 None 让下一层接管。

    优势：
    - LaTeX 是专业排版引擎，中文支持好（xelatex + ctex）
    - 输出效果优于 HTML→Playwright
    - .tex 文件可人工审阅修改后编译
    """
    import fitz
    from app.services.image_layout_editor import extract_image_layout
    from app.services.text_optimizer import optimize_image_blocks
    from app.services.resume_renderer import render_resume_latex, _find_latex_compiler

    # 无编译器直接跳过
    if not _find_latex_compiler():
        logger.info("[LaTeX渲染] 未找到 LaTeX 编译器，跳过")
        return None

    local_path = _resolve_local_path(resume.original_file_url)
    file_type = (resume.file_type or "").lower()

    # Step 1: 获取图片
    if file_type == "pdf":
        doc = await asyncio.to_thread(fitz.open, local_path)
        try:
            page = doc[0]
            pix = await asyncio.to_thread(page.get_pixmap, dpi=300)
            img_bytes = await asyncio.to_thread(pix.tobytes, "png")
            logger.info(f"[LaTeX渲染] PDF 渲染为图片: {pix.width}x{pix.height}px")
        finally:
            doc.close()
    else:
        with open(local_path, "rb") as f:
            img_bytes = f.read()
        logger.info(f"[LaTeX渲染] 读取图片: {len(img_bytes)} bytes")

    # Step 2: 视觉模型提取内容
    layout = await extract_image_layout(img_bytes)
    logger.info(f"[LaTeX渲染] 版式提取: {len(layout.blocks)} 个块")

    # Step 3: 文本优化
    optimized_texts = await optimize_image_blocks(layout.blocks, job_json, custom_instructions)
    logger.info(f"[LaTeX渲染] 文本优化: {len(optimized_texts)} 个块")

    # Step 4: LaTeX 生成 + 编译
    pdf_bytes, tex = render_resume_latex(
        blocks=layout.blocks,
        optimized_texts=optimized_texts,
        original_image_bytes=img_bytes,
        photo_bbox=layout.photo_bbox,
    )
    logger.info(f"[LaTeX渲染] LaTeX 源码: {len(tex)} 字符, "
                f"PDF: {'生成成功 ' + str(len(pdf_bytes)) + ' bytes' if pdf_bytes else '无编译器，跳过'}")

    return pdf_bytes


async def _run_styled_image(
    resume: Resume, optimized: dict, job_json: dict | None, custom_instructions: str | None = None
) -> bytes:
    """
    图片简历版式保留引擎（视觉模型 + Pillow）。

    流程：
    1. 视觉模型提取版式 JSON
    2. 优化文本块
    3. Pillow 合成图片
    """
    from app.services.image_layout_editor import extract_image_layout, composite_image
    from app.services.text_optimizer import optimize_image_blocks

    # 1. 获取原始图片字节
    local_path = _resolve_local_path(resume.original_file_url)

    with open(local_path, "rb") as f:
        image_bytes = f.read()

    # 2. 提取版式
    layout = await extract_image_layout(image_bytes)
    logger.info(
        f"图片版式提取完成: {len(layout.blocks)} 个块, "
        f"照片: {'有' if layout.photo_bbox else '无'}"
    )

    # 3. 优化文本
    optimized_texts = await optimize_image_blocks(
        layout.blocks, job_json, custom_instructions
    )
    logger.info(f"图片文本优化完成: {len(optimized_texts)} 个块")

    # 4. 合成图片
    result_bytes = composite_image(image_bytes, layout, optimized_texts)

    # 图片结果转为 PDF（在线程池中执行）
    return await asyncio.to_thread(_images_to_pdf_sync, [result_bytes])


def _images_to_pdf_sync(page_images: list) -> bytes:
    """将多张图片合并为 PDF（同步，在线程池中执行）"""
    from PIL import Image

    images = [Image.open(io.BytesIO(img)) for img in page_images]
    pdf_buf = io.BytesIO()
    if len(images) == 1:
        images[0].convert("RGB").save(pdf_buf, format="PDF")
    else:
        images[0].convert("RGB").save(
            pdf_buf, format="PDF", save_all=True,
            append_images=[img.convert("RGB") for img in images[1:]]
        )
    return pdf_buf.getvalue()


def _count_field_types(blocks: list) -> dict:
    """统计各字段类型的块数量"""
    return dict(Counter(b.field_type for b in blocks))


def _run_styled_pdf(resume: Resume, optimized: dict) -> bytes:
    """
    旧版 DOCX 样式保留 PDF 生成（用于 DOCX 文件）。

    流程：DOCX → 替换文本 → 转 PDF
    """
    from app.services.converter import ensure_docx, TEMP_DIR
    from app.services.docx_styler import apply_optimization, docx_to_pdf

    local_path = _resolve_local_path(resume.original_file_url)
    docx_path = ensure_docx(local_path)

    optimized_docx = os.path.join(TEMP_DIR, f"optimized_{uuid.uuid4().hex[:8]}.docx")
    apply_optimization(docx_path, optimized, optimized_docx)

    pdf_path = os.path.join(TEMP_DIR, f"optimized_{uuid.uuid4().hex[:8]}.pdf")
    docx_to_pdf(optimized_docx, pdf_path)

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    if not pdf_bytes or len(pdf_bytes) == 0:
        raise ValueError("DOCX 转 PDF 结果为空")

    for tmp in [docx_path, optimized_docx, pdf_path]:
        if tmp != local_path and os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass

    return pdf_bytes