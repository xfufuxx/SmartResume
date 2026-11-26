"""模拟押题 / AI 面试预测 API。

两条链路共存：
1. chat（主入口）：创建会话 → SSE 对话，按真实面试流程推进
   开场播报 → 自我介绍 → 简历深挖 → 专业能力 → 行为面试 → 求职动机 → 薪资到岗 → 反问 → 复盘
   - POST /sessions                 创建模拟会话（选简历/岗位 + 目标题数）
   - POST /sessions/{id}/chat       发送一轮对话，SSE 流式返回
   - GET  /sessions/{id}            会话详情（消息流水 + 题目清单 + 环节计划 + 复盘）
   环节顺序与配额由 services/interview_flow.py 决定，模型只负责当前环节出题。
2. quick（旧版，保留兼容）：POST /generate 后台生成整套押题，前端轮询会话。
   - 旧会话不迁移数据，详情接口按需合成只读消息，前端标注「快速押题」。

SSE 事件协议（data 为 JSON）：
- {"type": "meta", "stage", "stage_key", "stage_label", "remaining", "plan", "turn", "asked_count", "target_count"}
- {"type": "delta", "text": "..."}        正文增量（已由前端过滤结构化块）
- {"type": "turn", "message": {...}, ...} 本轮完整消息（含 question/feedback/summary payload 与环节）
- {"type": "done", "quota_used": n}
- {"type": "error", "message": "..."}     失败（额度已退还）

额度：每用户每日 INTERVIEW_DAILY_TURNS 轮（Redis 自然日分桶，失败/取消退还）；
同一会话用 Redis 短锁 + turn_index 乐观锁，防双标签并发导致消息交错。
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload

from app.config import settings
from app.database import get_db, async_session_factory
from app.core.deps import get_current_user, get_redis, RateLimiter
from app.services.task_recovery import INTERVIEW_STALE_SECONDS, is_stale
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.interview import InterviewSession, InterviewQuestion, InterviewMessage
from app.services import interview_chat, interview_flow
from app.services.interview_prep import generate_interview_questions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["Interview"])
TZ_UTC8 = timezone(timedelta(hours=8))

# 快速押题涉及一次长文本生成，成本高：每 IP 每分钟 2 次
_generate_limiter = RateLimiter(max_requests=2, window_seconds=60)
# 模拟对话每轮一次 LLM 调用：放宽到 6 次/分钟（仍由每日 30 轮兜底）
_chat_limiter = RateLimiter(max_requests=6, window_seconds=60)

MAX_MESSAGE_CHARS = 4000
LOCK_SECONDS = 120

CHAT_INTENTS = {"start", "answer", "next", "hint", "skip", "followup", "finish"}
# 控制意图不落库为用户消息，只作为本轮指令拼进上下文（保持对话流水干净）。
# 环节推进由后端计划决定，这里只描述「这一轮该输出什么」，不改变环节配额。
_INTENT_PROMPTS = {
    "start": "（现在开始：请按环节表的第一个环节提问，先播报流程，再请候选人做自我介绍。）",
    "next": "（请直接出下一题，不需要点评；本环节题数已用完就进入下一环节。）",
    "hint": "（我只想要提示：请只给答题要点，不要给完整参考答案，也不要出下一题。）",
    "skip": "（这题我跳过：请一句话点评后出下一题；本环节题数已用完就进入下一环节。）",
    "followup": "（请就刚才这道题再追问一层，不要换新题。）",
    "finish": "（结束本次模拟：请输出复盘与收尾，不要再出题。）",
}


class GenerateRequest(BaseModel):
    resume_id: str | None = None
    job_image_id: str | None = None
    question_count: int = Field(default=8, ge=3, le=15)


class CreateSessionRequest(BaseModel):
    resume_id: str | None = None
    job_image_id: str | None = None
    question_count: int = Field(default=8, ge=3, le=15)
    title: str | None = Field(default=None, max_length=100)


class ChatTurnRequest(BaseModel):
    message: str = Field(default="", max_length=MAX_MESSAGE_CHARS)
    intent: str = "answer"


class NoteRequest(BaseModel):
    note: str = Field(default="", max_length=4000)


# ── 序列化 ───────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


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


def _message_to_dict(m: InterviewMessage | dict) -> dict:
    if isinstance(m, dict):
        return m
    return {
        "id": m.id,
        "session_id": m.session_id,
        "role": m.role,
        "kind": m.kind,
        "content": m.content,
        "payload": m.payload or {},
        "question_id": m.question_id,
        "order_index": m.order_index,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _legacy_messages(s: InterviewSession) -> list[dict]:
    """旧版「快速押题」会话 → 只读对话流水（不写库，每次读时合成）。

    这样老数据无需回填迁移，详情接口也不会返回空消息导致前端空白。
    """
    out: list[dict] = []
    created = s.created_at.isoformat() if s.created_at else None

    def add(role: str, kind: str, content: str, payload: dict | None = None, qid: str | None = None) -> None:
        idx = len(out) + 1
        out.append({
            "id": f"legacy-{s.id}-{idx}",
            "session_id": s.id,
            "role": role,
            "kind": kind,
            "content": content or "",
            "payload": payload or {},
            "question_id": qid,
            "order_index": idx,
            "created_at": created,
        })

    if s.overall_advice:
        add("assistant", "briefing", s.overall_advice)
    for q in s.questions or []:
        # 正文留空：题面由 payload.question 渲染成卡片，避免气泡与卡片重复同一句
        add("assistant", "question", "", {"question": _question_to_dict(q)}, q.id)
        if q.note:
            add("user", "answer", q.note)
    return out


def _session_to_dict(s: InterviewSession, *, with_messages: bool = True) -> dict:
    messages: list[dict] = []
    if with_messages:
        if s.messages:
            messages = [_message_to_dict(m) for m in s.messages]
        elif s.mode == "quick":
            messages = _legacy_messages(s)
    # 环节计划与当前环节都是纯函数现算：追问不占题数，所以「已出几题」就唯一决定环节，
    # 无需额外落库，也不会有计划与消息不一致的历史数据问题。
    plan = interview_flow.build_plan(s.target_count)
    asked = s.question_count or 0
    return {
        "id": s.id,
        "resume_id": s.resume_id,
        "job_image_id": s.job_image_id,
        "job_title": s.job_title,
        "company": s.company,
        "title": s.title,
        "mode": s.mode or "quick",
        "stage": s.stage,
        "stage_key": interview_flow.answering_stage_key(plan, asked),
        "plan": plan,
        "status": s.status,
        "error_message": s.error_message,
        "overall_advice": s.overall_advice,
        "summary": s.summary_json,
        "question_count": s.question_count,
        "target_count": s.target_count or 0,
        "turn_index": s.turn_index or 0,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        "messages": messages,
        "questions": [_question_to_dict(q) for q in (s.questions or [])],
    }


# ── 通用查询 ─────────────────────────────────────────────────────


async def _load_resume_job(
    db: AsyncSession, user: User, resume_id: str | None, job_image_id: str | None
) -> tuple[dict | None, dict | None]:
    """读取并校验简历/岗位（两者至少一个，且必须解析完成）。"""
    resume_json: dict | None = None
    job_json: dict | None = None

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

    return resume_json, job_json


async def _get_session(db: AsyncSession, user: User, session_id: str) -> InterviewSession:
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user.id
        )
    )
    session = result.scalars().unique().one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    return session


async def _load_chat_context(
    db: AsyncSession, user: User, session: InterviewSession
) -> tuple[dict, dict]:
    """对话上下文：简历/岗位被删除时降级为空对象，不阻断已开始的会话。"""
    resume_json: dict = {}
    job_json: dict = {}
    if session.resume_id:
        r = await db.execute(select(Resume).where(Resume.id == session.resume_id, Resume.user_id == user.id))
        resume = r.scalar_one_or_none()
        resume_json = (resume.parsed_json if resume else None) or {}
    if session.job_image_id:
        j = await db.execute(
            select(JobImage).where(JobImage.id == session.job_image_id, JobImage.user_id == user.id)
        )
        job = j.scalar_one_or_none()
        job_json = (job.parsed_job_json if job else None) or {}
    return resume_json, job_json


async def _next_order(db: AsyncSession, session_id: str) -> int:
    res = await db.execute(
        select(func.coalesce(func.max(InterviewMessage.order_index), 0)).where(
            InterviewMessage.session_id == session_id
        )
    )
    return int(res.scalar() or 0) + 1


# ── 额度（Redis 自然日分桶，与 AI 润色同模式） ────────────────────


def _quota_key(user_id: str) -> str:
    # 额度按中国自然日分桶。直接用 UTC 日期会让额度在北京时间早上 8 点才重置，
    # 用户看到的「明天再试」与实际日期对不上。
    day = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d")
    return f"interview:count:{user_id}:{day}"


async def _check_and_consume_quota(redis: Redis, user_id: str) -> tuple[bool, int]:
    key = _quota_key(user_id)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    return count <= settings.INTERVIEW_DAILY_TURNS, int(count)


async def _release_quota(redis: Redis, user_id: str) -> None:
    try:
        key = _quota_key(user_id)
        if int(await redis.get(key) or 0) > 0:
            await redis.decr(key)
    except Exception:  # noqa: BLE001 —— 退还失败不影响主流程
        pass


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── 快速押题（旧链路，保留） ──────────────────────────────────────


@router.post("/generate")
async def generate(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rl: None = Depends(_generate_limiter),
):
    """提交快速押题任务，立即返回 session_id；前端轮询 /sessions/{id} 获取结果。"""
    resume_json, job_json = await _load_resume_job(db, user, body.resume_id, body.job_image_id)
    resume_json = resume_json or {}
    job_json = job_json or {}

    job_title = (job_json or {}).get("title") or None
    company = (job_json or {}).get("company") or None

    session = InterviewSession(
        user_id=user.id,
        resume_id=body.resume_id,
        job_image_id=body.job_image_id,
        job_title=job_title,
        company=company,
        mode="quick",
        stage="finished",
        status="pending",
        target_count=body.question_count,
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


# ── 模拟押题：会话创建 ───────────────────────────────────────────


@router.post("/sessions")
async def create_chat_session(
    body: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """创建模拟押题会话（不在这里调 LLM，首轮由前端发 intent=start 触发）。"""
    _, job_json = await _load_resume_job(db, user, body.resume_id, body.job_image_id)
    job_json = job_json or {}
    job_title = job_json.get("title") or None
    company = job_json.get("company") or None

    title = (body.title or "").strip()
    if not title:
        title = f"{job_title} · 模拟面试" if job_title else "通用模拟面试"

    session = InterviewSession(
        user_id=user.id,
        resume_id=body.resume_id,
        job_image_id=body.job_image_id,
        job_title=job_title,
        company=company,
        title=title,
        mode="chat",
        stage="briefing",
        status="completed",  # 无后台任务：生命周期看 stage
        target_count=body.question_count,
    )
    db.add(session)
    await db.flush()
    await db.commit()

    plan = interview_flow.build_plan(session.target_count)
    return {
        "id": session.id,
        "session_id": session.id,
        "title": session.title,
        "stage": session.stage,
        "stage_key": interview_flow.stage_key_at(plan, 0),
        "plan": plan,
        "target_count": session.target_count,
    }


# ── 模拟押题：对话（SSE） ─────────────────────────────────────────


@router.post("/sessions/{session_id}/chat")
async def chat_turn(
    session_id: str,
    body: ChatTurnRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
    _rl: None = Depends(_chat_limiter),
):
    session = await _get_session(db, user, session_id)
    if (session.mode or "quick") != "chat":
        raise HTTPException(status_code=400, detail="该会话是旧版快速押题记录，请新建一场模拟面试")

    intent = (body.intent or "answer").strip()
    if intent not in CHAT_INTENTS:
        raise HTTPException(status_code=400, detail="不支持的操作")

    message = (body.message or "").strip()
    if intent == "answer" and not message:
        raise HTTPException(status_code=400, detail="回答不能为空")
    if len(message) > MAX_MESSAGE_CHARS:
        raise HTTPException(status_code=400, detail=f"回答过长（上限 {MAX_MESSAGE_CHARS} 字）")

    if session.stage == "finished":
        raise HTTPException(status_code=400, detail="本次模拟已结束，请开始新一轮")

    target = session.target_count or 8
    max_turns = min(target * 4 + 6, settings.INTERVIEW_SESSION_MAX_TURNS)
    if (session.turn_index or 0) >= max_turns and intent != "finish":
        raise HTTPException(status_code=429, detail="本轮对话已达上限，请结束模拟查看复盘")

    # 同一会话串行化：双标签同时发送时，后到者收到明确提示，而不是两条消息交错
    lock_key = f"interview:lock:{session.id}"
    if not await redis.set(lock_key, "1", nx=True, ex=LOCK_SECONDS):
        raise HTTPException(status_code=409, detail="当前会话正在生成回复，请稍候再发")

    allowed, used = await _check_and_consume_quota(redis, user.id)
    if not allowed:
        await _release_quota(redis, user.id)
        await redis.delete(lock_key)
        raise HTTPException(
            status_code=429,
            detail=f"今日模拟对话次数已用完（上限 {settings.INTERVIEW_DAILY_TURNS} 轮），明天再试",
        )
    used = min(used, settings.INTERVIEW_DAILY_TURNS)

    # 乐观锁：turn_index 未变才推进（Redis 锁失效时的兜底）
    old_turn = session.turn_index or 0
    cas = await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id, InterviewSession.turn_index == old_turn)
        .values(turn_index=old_turn + 1)
    )
    if (cas.rowcount or 0) == 0:
        await _release_quota(redis, user.id)
        await redis.delete(lock_key)
        raise HTTPException(status_code=409, detail="当前会话正在生成回复，请稍候再发")
    session.turn_index = old_turn + 1
    await db.commit()

    # 用户作答先落库：刷新页面不丢回答
    if intent == "answer":
        db.add(
            InterviewMessage(
                session_id=session.id,
                user_id=user.id,
                role="user",
                kind="answer",
                content=message,
                order_index=await _next_order(db, session.id),
            )
        )
        await db.commit()

    qrows = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.session_id == session.id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = qrows.scalars().unique().all()
    asked = [q.question for q in questions]

    hrows = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session.id)
        .order_by(InterviewMessage.order_index.desc())
        .limit(interview_chat.MAX_HISTORY_MESSAGES)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(hrows.scalars().unique().all())
        if (m.content or "").strip()
    ]
    if intent in _INTENT_PROMPTS:
        history.append({"role": "user", "content": _INTENT_PROMPTS[intent]})

    # 面试进度用 question_count（正式题数，追问不计），环节按它推进
    progress = session.question_count or 0
    plan = interview_flow.build_plan(target)
    current = interview_flow.current_stage(plan, progress)
    stage_key = str(current.get("key") or interview_flow.SKILL)
    prompt_stage = "finished" if intent == "finish" else ("briefing" if not questions else "asking")
    resume_json, job_json = await _load_chat_context(db, user, session)
    system_prompt = interview_chat.build_system_prompt(
        resume_json, job_json,
        target_count=target,
        asked_questions=asked,
        stage=prompt_stage,
        plan=plan,
        asked_count=progress,
    )

    async def event_gen():
        full = ""
        try:
            yield _sse({
                "type": "meta",
                "stage": prompt_stage,
                "stage_key": stage_key,
                "stage_label": current.get("label"),
                "remaining": interview_flow.remaining_in_stage(plan, progress),
                "plan": plan,
                "turn": session.turn_index,
                "asked_count": progress,
                "target_count": target,
            })
            async for delta in interview_chat.stream_reply(history, system_prompt):
                full += delta
                yield _sse({"type": "delta", "text": delta})

            raw_blocks = interview_chat.parse_blocks(full)
            turn = interview_chat.sanitize_turn(
                raw_blocks, interview_chat.stage_default_category(stage_key)
            )
            display = interview_chat.strip_blocks(full)
            if not display and not any(turn.values()):
                raise ValueError("AI 未返回有效内容，请重试（额度已退还）")

            # 开场轮（此前还没有任何题目）候选人没答题，任何点评都是模型编出来的
            # （实测会写「候选人尚未作答」并给 3 分）。点评只在有作答时才有意义，直接丢弃。
            interview_chat.drop_opening_feedback(turn, bool(questions))

            # 复盘兜底：模型偶尔只写文字、不给 summary 块。
            # 此时用「本次实际出题的分类计数」补一个最小复盘，保证结束一定有结构化结果；
            # 不编造强项/短板/行动建议，前端会标注这是兜底摘要。
            if intent == "finish" and not turn["summary"]:
                coverage: dict[str, int] = {}
                for q in questions:
                    key = q.category or "综合"
                    coverage[key] = coverage.get(key, 0) + 1
                turn["summary"] = {
                    "coverage": coverage,
                    "strong": [],
                    "weak": [],
                    "actions": [],
                    "fallback": True,
                }
            if turn["summary"]:
                # 环节覆盖由后端确定性算出，不信模型自报，保证复盘一定有这一栏
                turn["summary"]["flow"] = interview_flow.asked_by_stage(plan, progress)
            if intent == "finish":
                # 结束时即使模型多给了一道题也不落库，避免复盘后面挂一道无头题
                turn["question"] = None

            # 追问不占目标题数：模型在 question 块里自报 followup=true 才算追问；
            # 模型漏标就退化成普通题（宁可多算一题，也不要进度卡住）
            is_followup = bool(turn.pop("followup", False)) or intent == "followup"
            if is_followup and not questions:
                is_followup = False

            question_obj: InterviewQuestion | None = None
            if turn["question"]:
                data = dict(turn["question"])
                data.pop("order_index", None)
                question_obj = InterviewQuestion(
                    session_id=session.id,
                    user_id=user.id,
                    order_index=len(questions),
                    **data,
                )
                db.add(question_obj)
                await db.flush()

            # 本轮的「当前环节」跟着新题走：追问留在原环节，新题可能已跨到下一环节
            new_progress = progress + (1 if (question_obj is not None and not is_followup) else 0)
            turn_stage = interview_flow.answering_stage(plan, new_progress)
            try:
                turn_remaining = max(0, int(turn_stage["end"]) - new_progress)
            except (KeyError, TypeError):
                turn_remaining = 0

            payload: dict = {
                "stage_key": turn_stage.get("key"),
                "stage_label": turn_stage.get("label"),
            }
            if turn["feedback"]:
                payload["feedback"] = turn["feedback"]
            if question_obj is not None:
                payload["question"] = _question_to_dict(question_obj)
                payload["followup"] = is_followup
            if turn["summary"]:
                payload["summary"] = turn["summary"]

            if turn["summary"]:
                kind = "summary"
            elif question_obj is not None:
                kind = "question"
            elif turn["feedback"]:
                kind = "feedback"
            else:
                kind = "text"

            assistant_msg = InterviewMessage(
                session_id=session.id,
                user_id=user.id,
                role="assistant",
                kind=kind,
                content=display,
                payload=payload or None,
                question_id=question_obj.id if question_obj is not None else None,
                order_index=await _next_order(db, session.id),
            )
            db.add(assistant_msg)
            await db.flush()

            session.question_count = new_progress
            if turn["summary"] or intent == "finish":
                session.stage = "finished"
                session.finished_at = _now()
                if turn["summary"]:
                    session.summary_json = turn["summary"]
            else:
                session.stage = "asking"
            if not session.overall_advice and display:
                session.overall_advice = display[:4000]
            session.updated_at = _now()
            await db.commit()

            yield _sse({
                "type": "turn",
                "message": _message_to_dict(assistant_msg),
                "stage": session.stage,
                "stage_key": turn_stage.get("key"),
                "stage_label": turn_stage.get("label"),
                "remaining": turn_remaining,
                "plan": plan,
                "asked_count": new_progress,
                "target_count": target,
            })
            yield _sse({"type": "done", "quota_used": used})
        except asyncio.CancelledError:
            # 客户端断开/主动停止：本轮不计费、不落助手消息
            await _release_quota(redis, user.id)
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
            raise
        except Exception as e:  # noqa: BLE001 —— 已中文化的 LLM 异常直接展示
            logger.error("[模拟押题] 对话失败 session=%s: %s", session.id, e, exc_info=True)
            await _release_quota(redis, user.id)
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
            yield _sse({"type": "error", "message": str(e) or "AI 响应失败，请稍后重试（额度已退还）"})
        finally:
            try:
                await redis.delete(lock_key)
            except Exception:  # noqa: BLE001
                pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 会话列表 / 详情 / 删除 ───────────────────────────────────────


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InterviewSession)
        .options(noload(InterviewSession.questions), noload(InterviewSession.messages))
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.created_at.desc())
    )
    sessions = result.scalars().unique().all()

    # 一次查出每个会话的最后一条消息（PostgreSQL DISTINCT ON），避免 N+1
    last_map: dict[str, str] = {}
    try:
        last_rows = await db.execute(
            select(InterviewMessage.session_id, InterviewMessage.content)
            .where(InterviewMessage.user_id == user.id)
            .order_by(InterviewMessage.session_id, InterviewMessage.order_index.desc())
            .distinct(InterviewMessage.session_id)
        )
        last_map = {sid: (content or "")[:60] for sid, content in last_rows.all()}
    except Exception:  # noqa: BLE001 —— 仅影响列表预览文案
        logger.warning("[模拟押题] 列表最近消息查询失败", exc_info=True)

    items = []
    for s in sessions:
        d = _session_to_dict(s, with_messages=False)
        d.pop("questions", None)
        d["last_message"] = last_map.get(s.id, "")
        items.append(d)
    return items


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _get_session(db, user, session_id)

    # 心跳超时兜底（仅快速押题有后台任务；chat 不会出现 pending）
    if session.status == "pending" and is_stale(session.created_at, INTERVIEW_STALE_SECONDS):
        session.status = "failed"
        session.error_message = "任务长时间无进展，已自动判定为失败，请重试"
        await db.commit()
    return _session_to_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _get_session(db, user, session_id)
    await db.delete(session)
    await db.commit()
    return {"detail": "已删除"}


# ── 题目资产：收藏 / 笔记 / 收藏夹 ───────────────────────────────


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
