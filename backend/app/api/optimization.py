import uuid
import os
import io
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume
from app.schemas.optimization import OptimizeRequest, OptimizeResponse, MatchAnalysis, DiffResponse, SatisfactionFeedbackRequest
from app.services.agent_optimizer import analyze_match, optimize_resume, generate_changes_description
from app.services.pdf_generator import generate_pdf
from app.services.storage import storage
from app.services.pdf_layout_editor import parse_pdf_layout, group_blocks_by_field, process_pdf_style_preserving
from app.services.text_optimizer import optimize_text_blocks, optimize_image_blocks

logger = logging.getLogger(__name__)

router = APIRouter()
TZ_UTC8 = timezone(timedelta(hours=8))

CATEGORIES = ["产品", "开发", "运营", "设计", "市场", "销售", "其他"]


def _to_response(r: OptimizedResume) -> OptimizeResponse:
    return OptimizeResponse(
        id=r.id, resume_id=r.resume_id, job_image_id=r.job_image_id,
        optimized_json=r.optimized_json, original_json=r.original_json,
        changes_description=r.changes_description, custom_instructions=r.custom_instructions,
        pdf_url=r.pdf_url, match_score=r.match_score,
        job_title=r.job_title, company=r.company, category=r.category,
        thumbnail_url=r.thumbnail_url, is_favorite=r.is_favorite,
        satisfaction_score=r.satisfaction_score, feedback_text=r.feedback_text,
        parent_record_id=r.parent_record_id, refine_count=r.refine_count,
        deleted_at=r.deleted_at, status=r.status, created_at=r.created_at,
    )


@router.post("/", response_model=OptimizeResponse)
async def optimize(
    body: OptimizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_image_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job image not found")

    if not resume.parsed_json or not job.parsed_job_json:
        raise HTTPException(status_code=400, detail="Resume or Job has not been parsed yet")

    job_title = job.parsed_job_json.get("title", "")
    company = job.parsed_job_json.get("company", "")
    category = _guess_category(job_title)

    match_result = await analyze_match(resume.parsed_json, job.parsed_job_json)
    optimized = await optimize_resume(
        resume.parsed_json, job.parsed_job_json,
        match_result.get("rewrite_strategy", {}),
        body.custom_instructions,
    )
    changes = await generate_changes_description(resume.parsed_json, optimized)

    # ── 生成 PDF（版式保留优先，回退模板） ──
    pdf_bytes = await _generate_styled_or_fallback(resume, optimized, job.parsed_job_json, body.custom_instructions)
    pdf_key = f"optimized/{user.id}/{uuid.uuid4()}.pdf"
    pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

    opt_record = OptimizedResume(
        user_id=user.id, resume_id=resume.id, job_image_id=job.id,
        original_json=resume.parsed_json, optimized_json=optimized,
        match_score=match_result.get("match_score"), pdf_url=pdf_url,
        changes_description=changes, custom_instructions=body.custom_instructions,
        job_title=job_title or None, company=company or None, category=category,
        thumbnail_url=job.image_url, status="completed",
    )
    db.add(opt_record)
    await db.flush()
    await db.refresh(opt_record)
    await db.commit()

    resp = _to_response(opt_record)
    resp.match_analysis = MatchAnalysis(
        match_score=match_result.get("match_score", 0),
        strengths=match_result.get("strengths", []),
        gaps=match_result.get("gaps", []),
        rewrite_strategy=match_result.get("rewrite_strategy", {}),
    )
    return resp


async def _generate_styled_or_fallback(
    resume: Resume, optimized: dict, job_json: dict, custom_instructions: str | None = None
) -> bytes:
    """
    生成优化后的 PDF（版式保留优先，逐层回退）。

    策略（按优先级从高到低）：
    1. 文本型 PDF → PyMuPDF 原地编辑（保留矢量图形、字体、颜色、照片，文本可选中）
    2. 图片型 PDF（扫描件/无文本层）→ 渲染为图片 → 视觉模型提取版式 → Pillow 合成
    3. 图片文件 → 视觉模型版式提取 + Pillow 合成
    4. DOCX 文件 → 现有 DOCX 替换方案
    5. 任何失败 → 回退到模板 PDF
    """
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

        # ── 第2层：视觉模型方案（图片型 PDF，无文本层）──
        try:
            logger.info("[PDF生成] 第2层尝试：渲染为图片 → 视觉模型提取版式 → Pillow 合成")
            pdf_bytes = await _run_styled_pdf_image(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] 视觉模型方案成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] 视觉模型方案失败: {e}")

    elif file_type in ("png", "jpg", "jpeg", "webp"):
        try:
            logger.info("[PDF生成] 图片简历，使用视觉模型版式提取...")
            pdf_bytes = await _run_styled_image(resume, optimized, job_json, custom_instructions)
            if pdf_bytes and len(pdf_bytes) > 1000:
                logger.info(f"[PDF生成] 图片版式保留成功: {len(pdf_bytes)} bytes")
                return pdf_bytes
        except Exception as e:
            logger.warning(f"[PDF生成] 图片版式保留失败: {e}")
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

    # 回退：使用固定模板生成 PDF
    logger.info("[PDF生成] 使用固定模板生成 PDF（回退方案）")
    fallback_bytes = await generate_pdf(optimized)
    logger.info(f"[PDF生成] 回退模板 PDF 生成完成: {len(fallback_bytes)} bytes")
    return fallback_bytes


async def _run_styled_pdf_text(
    resume: Resume, optimized: dict, job_json: dict, custom_instructions: str | None = None
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
    resume: Resume, optimized: dict, job_json: dict, custom_instructions: str | None = None
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
    from PIL import Image
    from app.services.image_layout_editor import extract_image_layout, composite_image
    from app.services.text_optimizer import optimize_image_blocks

    local_path = _resolve_local_path(resume.original_file_url)

    doc = fitz.open(local_path)
    total_pages = len(doc)
    page_images = []

    logger.info(f"[视觉PDF] 开始处理: {total_pages} 页, 渲染DPI=300")

    for page_idx in range(total_pages):
        page = doc[page_idx]
        # 渲染为图片（300 DPI，高清还原）
        pix = page.get_pixmap(dpi=300)
        img_bytes = pix.tobytes("png")
        logger.info(f"[视觉PDF] 第 {page_idx+1}/{total_pages} 页渲染完成: {pix.width}x{pix.height}px")

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

        # 合成图片
        result_img = composite_image(img_bytes, layout, optimized_texts)
        logger.info(f"[视觉PDF] 第 {page_idx+1} 页合成完成: {len(result_img)} bytes")
        page_images.append(result_img)

    doc.close()

    # 将多页图片组合为 PDF
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


async def _run_styled_image(
    resume: Resume, optimized: dict, job_json: dict, custom_instructions: str | None = None
) -> bytes:
    """
    图片简历版式保留引擎（视觉模型 + Pillow）。

    流程：
    1. 视觉模型提取版式 JSON
    2. 优化文本块
    3. Pillow 合成图片
    """
    from app.services.image_layout_editor import extract_image_layout, composite_image

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

    # 图片结果转为 PDF（使用 Pillow 保存为 PDF 格式）
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(result_bytes))
    pdf_buf = io.BytesIO()
    img.convert("RGB").save(pdf_buf, format="PDF")
    return pdf_buf.getvalue()


def _count_field_types(blocks: list) -> dict:
    """统计各字段类型的块数量"""
    from collections import Counter
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

    for tmp in [docx_path, optimized_docx, pdf_path]:
        if tmp != local_path and os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass

    return pdf_bytes


@router.get("/", response_model=list[OptimizeResponse])
async def list_optimizations(
    q: str = Query("", description="搜索关键词"),
    category: str = Query("", description="分类筛选"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(OptimizedResume).where(
        OptimizedResume.user_id == user.id,
        OptimizedResume.deleted_at.is_(None),
    ).order_by(OptimizedResume.created_at.desc())

    if category and category != "全部":
        stmt = stmt.where(OptimizedResume.category == category)

    result = await db.execute(stmt)
    records = result.scalars().all()

    if q:
        q_lower = q.lower()
        records = [
            r for r in records
            if (r.job_title and q_lower in r.job_title.lower())
            or (r.company and q_lower in r.company.lower())
            or (r.changes_description and q_lower in r.changes_description.lower())
        ]

    return [_to_response(r) for r in records]


@router.get("/categories")
async def list_categories(
    user: User = Depends(get_current_user),
):
    return CATEGORIES


@router.get("/favorites", response_model=list[OptimizeResponse])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.user_id == user.id,
            OptimizedResume.is_favorite == True,
            OptimizedResume.deleted_at.is_(None),
        ).order_by(OptimizedResume.created_at.desc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/{opt_id}/favorite")
async def toggle_favorite(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.is_favorite = not record.is_favorite
    await db.commit()
    return {"is_favorite": record.is_favorite}


@router.get("/trash", response_model=list[OptimizeResponse])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.user_id == user.id,
            OptimizedResume.deleted_at.isnot(None),
        ).order_by(OptimizedResume.deleted_at.desc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/{opt_id}/trash")
async def soft_delete(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.deleted_at = datetime.now(TZ_UTC8)
    record.is_favorite = False
    await db.commit()
    return {"detail": "已移至回收站"}


@router.post("/{opt_id}/restore")
async def restore(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.deleted_at = None
    await db.commit()
    return {"detail": "已恢复"}


@router.delete("/{opt_id}")
async def permanent_delete(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.pdf_url:
        await storage.delete(record.pdf_url)
    await db.delete(record)
    await db.commit()
    return {"detail": "已永久删除"}


@router.get("/diff", response_model=DiffResponse)
async def diff_versions(
    id1: str = Query(...),
    id2: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(
            OptimizedResume.id.in_([id1, id2]),
            OptimizedResume.user_id == user.id,
        )
    )
    records = {r.id: r for r in result.scalars().all()}
    a = records.get(id1)
    b = records.get(id2)
    if not a or not b:
        raise HTTPException(status_code=404, detail="记录不存在")

    diff_summary = _compute_diff_summary(a, b)
    return DiffResponse(record_a=_to_response(a), record_b=_to_response(b), diff_summary=diff_summary)


@router.get("/{opt_id}", response_model=OptimizeResponse)
async def get_optimization(
    opt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Optimization not found")
    return _to_response(record)


@router.post("/{opt_id}/feedback")
async def submit_satisfaction(
    opt_id: str,
    body: SatisfactionFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.satisfaction_score < 1 or body.satisfaction_score > 5:
        raise HTTPException(status_code=400, detail="评分需在 1-5 之间")
    if body.feedback_text and len(body.feedback_text) > 200:
        raise HTTPException(status_code=400, detail="反馈文字不能超过200字")

    result = await db.execute(
        select(OptimizedResume).where(OptimizedResume.id == opt_id, OptimizedResume.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="优化记录不存在")
    if record.satisfaction_score is not None:
        raise HTTPException(status_code=409, detail="该记录已评价过")

    record.satisfaction_score = body.satisfaction_score
    record.feedback_text = body.feedback_text
    await db.commit()

    return {"detail": "评价已提交"}


def _guess_category(title: str) -> str:
    t = title.lower()
    if any(w in t for w in ["开发", "工程师", "后端", "前端", "算法", "architect", "developer"]):
        return "开发"
    if any(w in t for w in ["产品", "product"]):
        return "产品"
    if any(w in t for w in ["运营", "operation"]):
        return "运营"
    if any(w in t for w in ["设计", "designer", "ui", "ux"]):
        return "设计"
    if any(w in t for w in ["市场", "marketing", "销售"]):
        return "市场"
    return "其他"


def _compute_diff_summary(a: OptimizedResume, b: OptimizedResume) -> str:
    parts = []
    if a.match_score and b.match_score:
        parts.append(f"匹配分: {a.match_score} → {b.match_score} ({b.match_score - a.match_score:+d})")
    if a.company != b.company:
        parts.append(f"公司: {a.company or '-'} → {b.company or '-'}")
    if a.job_title != b.job_title:
        parts.append(f"岗位: {a.job_title or '-'} → {b.job_title or '-'}")
    parts.append(f"A: {a.created_at}, B: {b.created_at}")
    return " | ".join(parts) if parts else "无显著差异"