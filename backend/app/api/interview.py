"""AI 面试预测：生成押题清单、查看历史会话、收藏题目与记录答题草稿。"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, async_session_factory
from app.core.deps import get_current_user, RateLimiter
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.interview import InterviewSession, InterviewQuestion
from app.services.interview_prep import generate_interview_questions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["Interview"])
TZ_UTC8 = timezone(timedelta(hours=8))

# 押题涉及 LLM 生成，成本高：每用户每分钟 2 次
_generate_limiter = RateLimiter(max_requests=2, window_seconds=60)


class GenerateRequest(BaseModel):
    resume_id: str | None = None
    job_image_id: str | None = None
    question_count: int = Field(default=8, ge=3, le=15)


class NoteRequest(BaseModel):
    note: str = Field(default="", max_length=4000)


def _session_to_dict(s: InterviewSession) -> dict:
    return {
        "id": s.id,
        "resume_id": s.resume_id,
        "job_image_id": s.job_image_id,
        "job_title": s.job_title,
        "company": s.company,
        "status": s.status,
        "error_message": s.error_message,
        "overall_advice": s.overall_advice,
        "question_count": s.question_count,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "questions": [_question_to_dict(q) for q in (s.questions or [])],
    }


def _question_to_dict(q: InterviewQuestion) -> dict:
    return {
        "id": q.id,
        "session_id": q.session_id,
        "order_index": q.order_index,
        "category": q.category,
        "difficulty": q.difficulty,
        "question": q.question,
        "intent": q.intent,
        "answer_outline": q.answer_outline or [],
        "sample_answer": q.sample_answer,
        "is_bookmarked": q.is_bookmarked,
        "note": q.note,
    }


@router.post("/generate")
async def generate(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rl: None = Depends(_generate_limiter),
):
    """提交押题任务，立即返回 session_id；前端轮询 /sessions/{id} 获取结果。"""
    resume_json: dict | None = None
    job_json: dict | None = None
    resume_id = body.resume_id
    job_image_id = body.job_image_id

    if resume_id:
        r = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
        resume = r.scalar_one_or_none()
        if not resume:
            raise HTTPException(status_code=404, detail="简历不存在")
        if not resume.parsed_json:
            raise HTTPException(status_code=400, detail="该简历尚未解析完成，请稍后再试")
        resume_json = resume.parsed_json

    if job_image_id:
        j = await db.execute(select(JobImage).where(JobImage.id == job_image_id, JobImage.user_id == user.id))
        job = j.scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="岗位不存在")
        if not job.parsed_job_json:
            raise HTTPException(status_code=400, detail="该岗位尚未解析完成，请稍后再试")
        job_json = job.parsed_job_json

    if not resume_json and not job_json:
        raise HTTPException(status_code=400, detail="请至少选择一份简历或一个岗位")

    # 只给了岗位没有简历时，用空结构兜底（仍可出通用题）
    resume_json = resume_json or {}
    job_json = job_json or {}

    job_title = (job_json or {}).get("title") or None
    company = (job_json or {}).get("company") or None

    session = InterviewSession(
        user_id=user.id,
        resume_id=resume_id,
        job_image_id=job_image_id,
        job_title=job_title,
        company=company,
        status="pending",
    )
    db.add(session)
    await db.flush()
    await db.commit()

    asyncio.create_task(
        _run_generate_task(session.id, user.id, resume_json, job_json, body.question_count)
    )

    return {"session_id": session.id, "status": "pending"}


async def _run_generate_task(
    session_id: str,
    user_id: str,
    resume_json: dict,
    job_json: dict,
    question_count: int,
):
    """后台生成题目并落库。"""
    try:
        result = await generate_interview_questions(resume_json, job_json, question_count)
    except Exception as e:  # noqa: BLE001
        logger.error(f"[面试押题] 生成失败 session={session_id}: {e}", exc_info=True)
        async with async_session_factory() as db:
            s = await db.get(InterviewSession, session_id)
            if s:
                s.status = "failed"
                s.error_message = str(e)[:300]
                await db.commit()
        return

    async with async_session_factory() as db:
        s = await db.get(InterviewSession, session_id)
        if not s:
            return
        s.overall_advice = result.get("overall_advice") or ""
        s.status = "completed"
        for item in result.get("questions", []):
            db.add(
                InterviewQuestion(
                    session_id=session_id,
                    user_id=user_id,
                    order_index=item.get("order_index", 0),
                    category=item.get("category"),
                    difficulty=item.get("difficulty"),
                    question=item.get("question", ""),
                    intent=item.get("intent"),
                    answer_outline=item.get("answer_outline") or [],
                    sample_answer=item.get("sample_answer"),
                )
            )
        s.question_count = len(result.get("questions", []))
        await db.commit()


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewSession)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.created_at.desc())
    )
    sessions = result.scalars().unique().all()
    items = []
    for s in sessions:
        d = _session_to_dict(s)
        d.pop("questions", None)  # 列表页不返回题目，减小响应体
        items.append(d)
    return items


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user.id
        )
    )
    session = result.scalars().unique().one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    return _session_to_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user.id
        )
    )
    session = result.scalars().unique().one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    await db.delete(session)
    await db.commit()
    return {"detail": "已删除"}


@router.post("/questions/{question_id}/bookmark")
async def toggle_bookmark(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.id == question_id, InterviewQuestion.user_id == user.id
        )
    )
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    q.is_bookmarked = not q.is_bookmarked
    await db.commit()
    return {"is_bookmarked": q.is_bookmarked}


@router.put("/questions/{question_id}/note")
async def save_note(
    question_id: str,
    body: NoteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.id == question_id, InterviewQuestion.user_id == user.id
        )
    )
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    q.note = body.note
    await db.commit()
    return {"detail": "已保存"}


@router.get("/bookmarks")
async def list_bookmarks(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """跨会话的收藏题目（用于「我的题库」）。"""
    result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.user_id == user.id, InterviewQuestion.is_bookmarked == True)  # noqa: E712
        .order_by(InterviewQuestion.created_at.desc())
        .limit(limit)
    )
    return [_question_to_dict(q) for q in result.scalars().all()]
