"""AI 对话润色 API —— 多轮对话 + 结构化建议 + SSE 流式输出。

端点：
- POST   /api/polish/sessions          创建会话（绑定优化记录或自由文本）
- GET    /api/polish/sessions          会话列表（含最近消息预览）
- GET    /api/polish/sessions/{id}     会话详情 + 全量消息
- DELETE /api/polish/sessions/{id}     删除会话（级联消息）
- POST   /api/polish/chat              发送消息，SSE 流式返回

SSE 事件协议（data 为 JSON）：
- {"type": "delta", "text": "..."}       文本增量（多个）
- {"type": "suggestions", "items": [...]} 最终建议列表（可空数组）
- {"type": "done"}                       正常结束
- {"type": "error", "message": "..."}    失败（LLM 不可用/超限等）

额度：每用户每日 POLISH_DAILY_LIMIT 次（Redis 自然日分桶，失败退还），
与 AI 职业照同模式；免费防刷上游 Key。
"""
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user, get_redis
from app.database import get_db
from app.models.optimized_resume import OptimizedResume
from app.models.polish import PolishMessage, PolishSession
from app.models.user import User
from app.services import polish_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/polish", tags=["AI Polish"])

MAX_ROUNDS = 10          # 送入 LLM 的最大对话轮数（双边计）
MAX_CONTEXT_CHARS = 6000  # 简历上下文截断长度（与服务层一致）


# ── schemas ──────────────────────────────────────────────────────


class PolishSessionCreate(BaseModel):
    target_type: str = "text"          # optimized / text
    target_id: str | None = None       # target_type=optimized 时的记录 ID
    text: str | None = None           # target_type=text 时的内容
    title: str | None = None


class PolishChatRequest(BaseModel):
    session_id: str
    message: str


# ── 额度（Redis 自然日分桶，与 AI 职业照同模式） ──────────────────


async def _check_and_consume_quota(redis: Redis, user_id: str) -> tuple[bool, int]:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"polish:count:{user_id}:{today}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    return count <= settings.POLISH_DAILY_LIMIT, int(count)


async def _release_quota(redis: Redis, user_id: str) -> None:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = f"polish:count:{user_id}:{today}"
    try:
        val = int(await redis.get(key) or 0)
        if val > 0:
            await redis.decr(key)
    except Exception:  # noqa: BLE001 —— 退还失败不影响主流程
        pass


# ── 会话 CRUD ────────────────────────────────────────────────────


@router.post("/sessions")
async def create_session(
    body: PolishSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target_type = body.target_type if body.target_type in ("optimized", "text") else "text"
    context_text = ""
    title = (body.title or "").strip()

    if target_type == "optimized":
        if not body.target_id:
            raise HTTPException(status_code=400, detail="缺少目标简历记录")
        result = await db.execute(
            select(OptimizedResume).where(
                OptimizedResume.id == body.target_id,
                OptimizedResume.user_id == user.id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(status_code=404, detail="简历记录不存在")
        context_text = polish_chat.extract_context_from_optimized(record.optimized_json)
        if not title:
            title = f"润色：{record.job_title or '简历记录'}"
    else:
        context_text = (body.text or "").strip()
        if not context_text:
            raise HTTPException(status_code=400, detail="请输入要润色的简历内容")
        if not title:
            title = context_text[:20] + ("…" if len(context_text) > 20 else "")

    session = PolishSession(
        user_id=user.id,
        title=title or "润色会话",
        target_type=target_type,
        target_id=body.target_id if target_type == "optimized" else None,
        context_snapshot=context_text,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "target_type": session.target_type}


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PolishSession)
        .where(PolishSession.user_id == user.id)
        .order_by(PolishSession.updated_at.desc())
        .limit(100)
    )
    sessions = result.scalars().all()
    # 批量取每个会话的最后一条消息，避免 N+1
    out = []
    for s in sessions:
        last = await db.execute(
            select(PolishMessage)
            .where(PolishMessage.session_id == s.id)
            .order_by(PolishMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last.scalar_one_or_none()
        out.append({
            "id": s.id,
            "title": s.title,
            "target_type": s.target_type,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            "last_message": (last_msg.content[:60] if last_msg else ""),
        })
    return out


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PolishSession).where(
            PolishSession.id == session_id,
            PolishSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    msg_result = await db.execute(
        select(PolishMessage)
        .where(PolishMessage.session_id == session_id)
        .order_by(PolishMessage.created_at.asc())
    )
    messages = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "suggestions": m.suggestions or [],
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msg_result.scalars().all()
    ]
    return {
        "id": session.id,
        "title": session.title,
        "target_type": session.target_type,
        "target_id": session.target_id,
        "messages": messages,
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PolishSession).where(
            PolishSession.id == session_id,
            PolishSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    await db.delete(session)  # 消息经 ondelete=CASCADE 级联删除
    await db.commit()
    return {"ok": True}


# ── 对话（SSE 流式） ─────────────────────────────────────────────


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def polish_chat_stream(
    body: PolishChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    session_result = await db.execute(
        select(PolishSession).where(
            PolishSession.id == body.session_id,
            PolishSession.user_id == user.id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="消息不能为空")
    if len(message) > 4000:
        raise HTTPException(status_code=400, detail="消息过长（上限 4000 字）")

    # 落库用户消息（流式开始前持久化，刷新不丢）
    db.add(PolishMessage(session_id=session.id, role="user", content=message))
    await db.commit()

    allowed, used = await _check_and_consume_quota(redis, user.id)
    if not allowed:
        await _release_quota(redis, user.id)
        return StreamingResponse(
            iter([_sse({"type": "error", "message": f"今日对话次数已用完（上限 {settings.POLISH_DAILY_LIMIT} 次），明天再试"})]),
            media_type="text/event-stream",
        )

    # 读取历史（最近 N 轮），拼上下文
    hist_result = await db.execute(
        select(PolishMessage)
        .where(PolishMessage.session_id == session.id)
        .order_by(PolishMessage.created_at.desc())
        .limit(MAX_ROUNDS * 2)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(hist_result.scalars().all())
        if m.role in ("user", "assistant")
    ]

    async def event_gen():
        full_text = ""
        try:
            async for delta in polish_chat.stream_polish_reply(history, session.context_snapshot or ""):
                full_text += delta
                yield _sse({"type": "delta", "text": delta})
        except Exception as e:  # noqa: BLE001 —— LLM 失败：退还额度并告知前端
            logger.error("润色对话失败: %s", e, exc_info=True)
            await _release_quota(redis, user.id)
            yield _sse({"type": "error", "message": "AI 响应失败，额度已退还，请稍后重试"})
            return

        suggestions = polish_chat.parse_suggestions(full_text)
        display_text = polish_chat.strip_suggestion_blocks(full_text)
        # 落库助手消息（展示文本 + 结构化建议分离存储）
        db.add(PolishMessage(
            session_id=session.id,
            role="assistant",
            content=display_text,
            suggestions=suggestions or None,
        ))
        await db.commit()
        yield _sse({"type": "suggestions", "items": suggestions})
        yield _sse({"type": "done", "quota_used": used})

    return StreamingResponse(event_gen(), media_type="text/event-stream")
