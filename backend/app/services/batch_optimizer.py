import json
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.batch_optimization import BatchOptimization, BatchJobTask
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume
from app.services.agent_optimizer import analyze_match, optimize_resume, generate_changes_description
from app.services.pdf_generator import generate_pdf
from app.services.storage import storage

TZ_UTC8 = timezone(timedelta(hours=8))


async def start_batch(
    db: AsyncSession,
    user_id: str,
    source_resume_id: str,
    job_image_ids: list[str],
    custom_instructions: str | None = None,
) -> str:
    if len(job_image_ids) > 5:
        raise ValueError("最多同时优化 5 个岗位")
    if len(job_image_ids) == 0:
        raise ValueError("至少需要 1 个岗位")

    resume_result = await db.execute(
        select(Resume).where(Resume.id == source_resume_id, Resume.user_id == user_id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume or not resume.parsed_json:
        raise ValueError("源简历不存在或未解析完成")

    job_result = await db.execute(
        select(JobImage).where(
            JobImage.id.in_(job_image_ids),
            JobImage.user_id == user_id,
        )
    )
    valid_jobs = job_result.scalars().all()
    if len(valid_jobs) != len(job_image_ids):
        raise ValueError("部分岗位不存在")

    batch = BatchOptimization(
        user_id=user_id,
        source_resume_id=source_resume_id,
        status="pending",
        total_jobs=len(job_image_ids),
        completed_jobs=0,
    )
    db.add(batch)
    await db.flush()

    for job_id in job_image_ids:
        task = BatchJobTask(
            batch_id=batch.id,
            job_image_id=job_id,
            status="pending",
        )
        db.add(task)

    await db.commit()

    asyncio.create_task(
        _process_batch(batch.id, user_id, source_resume_id, job_image_ids, custom_instructions)
    )

    return batch.id


async def get_batch_status(batch_id: str, user_id: str, db: AsyncSession) -> dict:
    result = await db.execute(
        select(BatchOptimization).where(
            BatchOptimization.id == batch_id,
            BatchOptimization.user_id == user_id,
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        return {"error": "批次不存在"}

    tasks_result = await db.execute(
        select(BatchJobTask).where(BatchJobTask.batch_id == batch_id)
    )
    tasks = tasks_result.scalars().all()

    return {
        "batch_id": batch.id,
        "status": batch.status,
        "total_jobs": batch.total_jobs,
        "completed_jobs": batch.completed_jobs,
        "created_at": batch.created_at,
        "completed_at": batch.completed_at,
        "tasks": [
            {
                "id": t.id,
                "job_image_id": t.job_image_id,
                "status": t.status,
                "optimization_record_id": t.optimization_record_id,
                "error_message": t.error_message,
            }
            for t in tasks
        ],
    }


async def _process_batch(
    batch_id: str,
    user_id: str,
    resume_id: str,
    job_image_ids: list[str],
    custom_instructions: str | None,
):
    from app.database import async_session_factory

    async with async_session_factory() as db:
        resume_result = await db.execute(select(Resume).where(Resume.id == resume_id))
        resume = resume_result.scalar_one_or_none()
        if not resume:
            await _fail_batch(db, batch_id, "源简历不存在")
            return

        batch_result = await db.execute(
            select(BatchOptimization).where(BatchOptimization.id == batch_id)
        )
        batch = batch_result.scalar_one_or_none()
        if not batch:
            return

        batch.status = "processing"
        await db.commit()

        for job_id in job_image_ids:
            task_result = await db.execute(
                select(BatchJobTask).where(
                    BatchJobTask.batch_id == batch_id,
                    BatchJobTask.job_image_id == job_id,
                )
            )
            task = task_result.scalar_one_or_none()
            if not task:
                continue

            try:
                job_result = await db.execute(
                    select(JobImage).where(JobImage.id == job_id, JobImage.user_id == user_id)
                )
                job = job_result.scalar_one_or_none()
                if not job or not job.parsed_job_json:
                    task.status = "failed"
                    task.error_message = "岗位数据不存在或未解析"
                    await db.commit()
                    continue

                match_result = await analyze_match(resume.parsed_json, job.parsed_job_json)
                optimized = await optimize_resume(
                    resume.parsed_json,
                    job.parsed_job_json,
                    match_result.get("rewrite_strategy", {}),
                    custom_instructions,
                )

                pdf_key = f"optimized/{user_id}/{uuid.uuid4()}.pdf"
                pdf_url = ""
                try:
                    from app.api.optimization import _generate_styled_or_fallback
                    pdf_bytes = await _generate_styled_or_fallback(resume, optimized)
                    pdf_url = await storage.upload_bytes(pdf_bytes, pdf_key, "application/pdf")
                except Exception:
                    pass

                opt_record = OptimizedResume(
                    user_id=user_id,
                    resume_id=resume.id,
                    job_image_id=job.id,
                    original_json=resume.parsed_json,
                    optimized_json=optimized,
                    match_score=match_result.get("match_score"),
                    pdf_url=pdf_url,
                    custom_instructions=custom_instructions,
                    job_title=job.parsed_job_json.get("title") or None,
                    company=job.parsed_job_json.get("company") or None,
                    thumbnail_url=job.image_url,
                    status="completed",
                )
                db.add(opt_record)
                await db.flush()

                task.status = "completed"
                task.optimization_record_id = opt_record.id
                batch.completed_jobs += 1
                await db.commit()

            except Exception as e:
                task.status = "failed"
                task.error_message = str(e)[:500]
                await db.commit()

        batch.status = "completed"
        batch.completed_at = datetime.now(TZ_UTC8)
        await db.commit()


async def _fail_batch(db: AsyncSession, batch_id: str, error: str):
    result = await db.execute(select(BatchOptimization).where(BatchOptimization.id == batch_id))
    batch = result.scalar_one_or_none()
    if batch:
        batch.status = "failed"
        await db.commit()