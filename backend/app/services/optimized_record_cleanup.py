"""物理删除 optimized_resumes 记录前的外键引用清理。

引用 optimized_resumes.id 的真实外键共三处（以 information_schema 实测为准）：
- feedbacks.optimization_record_id（NOT NULL）：反馈依附于优化记录，随记录一并删除；
- optimized_resumes.parent_record_id（自引用，可空）：先置空子记录引用，避免父子互删冲突；
- batch_job_tasks.optimization_record_id（可空）：批量任务明细仅置空引用，保留任务本身。

注意：BatchJobTask 与 BatchOptimization 同定义于 models/batch_optimization.py，
前者才带 optimization_record_id 列，勿引错类（会触发 UndefinedColumn 500）。

调用方负责在删除 OptimizedResume 之前调用本模块，且需自行 commit。
"""

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_optimization import BatchJobTask
from app.models.feedback import Feedback
from app.models.optimized_resume import OptimizedResume


async def detach_optimized_record_refs(db: AsyncSession, record_ids: list[str]) -> None:
    """解除上述三处外键对指定优化记录的引用（不 commit）。"""
    if not record_ids:
        return

    # 自引用先置空：父记录将被删除，子记录的 parent_record_id 置 None 保留子记录
    await db.execute(
        update(OptimizedResume)
        .where(OptimizedResume.parent_record_id.in_(record_ids))
        .values(parent_record_id=None)
    )
    # 批量任务明细：保留任务，仅置空优化结果引用
    await db.execute(
        update(BatchJobTask)
        .where(BatchJobTask.optimization_record_id.in_(record_ids))
        .values(optimization_record_id=None)
    )
    # 反馈：随优化记录一并删除
    await db.execute(
        delete(Feedback).where(Feedback.optimization_record_id.in_(record_ids))
    )
