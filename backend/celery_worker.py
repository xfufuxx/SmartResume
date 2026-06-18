import asyncio
import os
from celery import Celery
from app.config import settings

celery_app = Celery(
    "smart_resume",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])

# 模块级事件循环，复用避免反复创建/销毁
_LOOP: asyncio.AbstractEventLoop | None = None


def _get_or_create_loop() -> asyncio.AbstractEventLoop:
    global _LOOP
    if _LOOP is None or _LOOP.is_closed():
        _LOOP = asyncio.new_event_loop()
        asyncio.set_event_loop(_LOOP)
    return _LOOP


def _resolve_local_path(original_url: str) -> str:
    """将 original_file_url 解析为本地文件路径（支持HTTP URL和本地路径）"""
    if not original_url:
        raise ValueError("original_file_url 为空")
    if "/uploads/" in original_url:
        rel = original_url.split("/uploads/", 1)[-1]
        local_path = os.path.join("uploads", rel)
        if os.path.exists(local_path):
            return local_path
    if os.path.isabs(original_url):
        if os.path.exists(original_url):
            return original_url
    local_path = os.path.join("uploads", original_url)
    if os.path.exists(local_path):
        return local_path
    raise FileNotFoundError(f"原始文件不存在: {original_url}")


def _generate_styled_or_fallback_sync(resume, optimized: dict, job_json: dict, custom_instructions: str | None = None) -> bytes:
    """同步版版式保留 PDF 生成（供 Celery 任务使用，策略与主 API 对齐）"""
    import asyncio

    file_type = (resume.file_type or "").lower()

    if file_type == "pdf":
        # ── 第1层：PyMuPDF 原地编辑（文本型 PDF）──
        try:
            from app.services.pdf_layout_editor import parse_pdf_layout, process_pdf_style_preserving
            from app.services.text_optimizer import optimize_text_blocks

            local_path = _resolve_local_path(resume.original_file_url)

            with open(local_path, "rb") as f:
                pdf_bytes = f.read()

            pages = parse_pdf_layout(pdf_bytes)
            all_blocks = []
            for page in pages:
                all_blocks.extend(page.text_blocks)

            if not all_blocks:
                raise ValueError("未能从 PDF 中提取到文本块（可能为图片型 PDF）")

            loop = _get_or_create_loop()
            optimized_texts = loop.run_until_complete(
                optimize_text_blocks(all_blocks, job_json, custom_instructions)
            )

            if not optimized_texts:
                raise ValueError("文本优化结果为空")

            return process_pdf_style_preserving(pdf_bytes, optimized_texts)

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Celery] PyMuPDF 方案失败: {e}")

        # ── 第2层：视觉模型方案（图片型 PDF）──
        try:
            from app.services.image_layout_editor import extract_image_layout, composite_image
            from app.services.text_optimizer import optimize_image_blocks
            import fitz
            from PIL import Image
            import io

            local_path = _resolve_local_path(resume.original_file_url)

            doc = fitz.open(local_path)
            total_pages = len(doc)
            page_images = []

            for page_idx in range(total_pages):
                page = doc[page_idx]
                pix = page.get_pixmap(dpi=300)
                img_bytes = pix.tobytes("png")

                loop = _get_or_create_loop()
                layout = loop.run_until_complete(extract_image_layout(img_bytes))
                optimized_texts = loop.run_until_complete(
                    optimize_image_blocks(layout.blocks, job_json, custom_instructions)
                )

                result_img = composite_image(img_bytes, layout, optimized_texts)
                page_images.append(result_img)

            doc.close()

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

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Celery] 视觉模型方案失败: {e}")

    elif file_type in ("docx",):
        try:
            from app.services.converter import ensure_docx, TEMP_DIR
            from app.services.docx_styler import apply_optimization, docx_to_pdf

            local_path = _resolve_local_path(resume.original_file_url)

            docx_path = ensure_docx(local_path)
            optimized_docx = os.path.join(TEMP_DIR, f"celery_opt_{resume.id[:8]}.docx")
            apply_optimization(docx_path, optimized, optimized_docx)

            import uuid as _uuid
            pdf_path = os.path.join(TEMP_DIR, f"celery_opt_{_uuid.uuid4().hex[:8]}.pdf")
            docx_to_pdf(optimized_docx, pdf_path)

            with open(pdf_path, "rb") as f:
                result = f.read()

            for tmp in [docx_path, optimized_docx, pdf_path]:
                if tmp != local_path and os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass

            return result
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Celery] DOCX 方案失败: {e}")

    # 回退：模板 PDF
    from app.services.pdf_generator import generate_pdf
    loop = _get_or_create_loop()
    return loop.run_until_complete(generate_pdf(optimized))


@celery_app.task(bind=True, max_retries=3)
def process_optimization(self, resume_id: str, job_image_id: str):
    from app.database import async_session_factory
    from app.models.resume import Resume
    from app.models.job_image import JobImage
    from app.models.optimized_resume import OptimizedResume
    from app.services.agent_optimizer import analyze_match, optimize_resume, generate_changes_description
    from app.services.storage import storage
    from sqlalchemy import select
    import uuid

    async def _run():
        async with async_session_factory() as db:
            resume = (await db.execute(select(Resume).where(Resume.id == resume_id))).scalar_one_or_none()
            job = (await db.execute(select(JobImage).where(JobImage.id == job_image_id))).scalar_one_or_none()
            if not resume or not job:
                raise ValueError("Resume or Job not found")

            match = await analyze_match(resume.parsed_json, job.parsed_job_json)
            optimized = await optimize_resume(resume.parsed_json, job.parsed_job_json, match.get("rewrite_strategy", {}))
            changes = await generate_changes_description(resume.parsed_json, optimized)

            # 尝试版式保留 PDF
            pdf_bytes = await asyncio.to_thread(
                _generate_styled_or_fallback_sync, resume, optimized, job.parsed_job_json
            )

            pdf_key = f"optimized/async/{uuid.uuid4()}.pdf"
            pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")

            opt = OptimizedResume(
                user_id=resume.user_id,
                resume_id=resume.id,
                job_image_id=job.id,
                original_json=resume.parsed_json,
                optimized_json=optimized,
                match_score=match.get("match_score"),
                pdf_url=pdf_url,
                changes_description=changes,
            )
            db.add(opt)
            await db.flush()
            await db.refresh(opt)
            return {"id": opt.id, "pdf_url": pdf_url, "status": "completed"}

    loop = _get_or_create_loop()
    return loop.run_until_complete(_run())
