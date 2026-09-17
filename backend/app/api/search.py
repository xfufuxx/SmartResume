"""全局搜索：跨简历 / 岗位 / 优化记录聚合检索，供顶部搜索框使用。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume

router = APIRouter(prefix="/api/search", tags=["Search"])

MAX_LIMIT = 20


def _cut(text: str | None, q: str, width: int = 60) -> str:
    """返回命中关键词附近的一段文本，便于前端高亮展示上下文。"""
    if not text:
        return ""
    idx = text.lower().find(q.lower())
    if idx < 0:
        return text[:width]
    start = max(0, idx - width // 3)
    return ("…" if start > 0 else "") + text[start:start + width] + ("…" if start + width < len(text) else "")


@router.get("")
async def global_search(
    q: str = Query("", min_length=0, max_length=100),
    limit: int = Query(5, ge=1, le=MAX_LIMIT, description="每类结果返回条数"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (q or "").strip()
    if not q:
        return {"query": "", "resumes": [], "jobs": [], "optimizations": [], "total": 0}

    like = f"%{q}%"
    uid = user.id

    # ── 简历：标题 + 解析出的姓名/公司/技能 ──
    resume_rows = (
        await db.execute(
            select(Resume)
            .where(Resume.user_id == uid, Resume.deleted_at.is_(None))
            .order_by(Resume.created_at.desc())
        )
    ).scalars().all()

    resumes: list[dict] = []
    for r in resume_rows:
        parsed = r.parsed_json or {}
        name = (parsed.get("personal_info") or {}).get("name") or ""
        skills = " ".join(parsed.get("skills") or [])
        haystack = " ".join([r.title or "", name, skills, r.raw_text or ""])
        if q.lower() in haystack.lower():
            resumes.append({
                "id": r.id,
                "title": r.title or name or "未命名简历",
                "snippet": _cut(haystack.strip(), q),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        if len(resumes) >= limit:
            break

    # ── 岗位：标题 / 公司 / 备注 / 原始文本 ──
    job_rows = (
        await db.execute(
            select(JobImage)
            .where(JobImage.user_id == uid, JobImage.deleted_at.is_(None))
            .order_by(JobImage.created_at.desc())
        )
    ).scalars().all()

    jobs: list[dict] = []
    for j in job_rows:
        parsed = j.parsed_job_json or {}
        haystack = " ".join([
            j.title or "", j.company or "", j.user_remark or "",
            parsed.get("title") or "", parsed.get("company") or "",
            parsed.get("original_text") or "",
        ])
        if q.lower() in haystack.lower():
            jobs.append({
                "id": j.id,
                "title": j.title or parsed.get("title") or "未命名岗位",
                "company": j.company or parsed.get("company") or "",
                "snippet": _cut(haystack.strip(), q),
                "created_at": j.created_at.isoformat() if j.created_at else None,
            })
        if len(jobs) >= limit:
            break

    # ── 优化记录 ──
    opt_stmt = (
        select(OptimizedResume)
        .where(
            OptimizedResume.user_id == uid,
            OptimizedResume.deleted_at.is_(None),
            or_(
                OptimizedResume.job_title.ilike(like),
                OptimizedResume.company.ilike(like),
                OptimizedResume.changes_description.ilike(like),
                OptimizedResume.category.ilike(like),
            ),
        )
        .order_by(OptimizedResume.created_at.desc())
        .limit(limit)
    )
    opt_rows = (await db.execute(opt_stmt)).scalars().all()
    optimizations = [
        {
            "id": o.id,
            "title": o.job_title or "优化记录",
            "company": o.company or "",
            "match_score": o.match_score,
            "snippet": _cut(o.changes_description, q),
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in opt_rows
    ]

    return {
        "query": q,
        "resumes": resumes,
        "jobs": jobs,
        "optimizations": optimizations,
        "total": len(resumes) + len(jobs) + len(optimizations),
    }
