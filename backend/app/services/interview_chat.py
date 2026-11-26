"""模拟押题对话服务 —— 提示词组装、流式调用、结构化块解析。

协议（与前端契约）：
模型回复 = 正文 + 至多三个 fenced 块：
  ```question  {...}   一道题（题干/考察点/要点/参考答案）
  ```feedback  {...}   对上一次回答的点评（1-5 分 + 命中/缺失 + 建议）
  ```summary   {...}   复盘（覆盖度/强项/短板/行动建议）

正文用于聊天气泡流式展示；块由本模块解析成 payload 落库与渲染。
解析失败只丢该块，不影响正文——绝不因为块坏了就整轮报错。
"""
from __future__ import annotations

import json
import logging
import re
from typing import AsyncIterator

from app.config import settings
from app.prompts.interview_chat import INTERVIEW_CHAT_SYSTEM_PROMPT
from app.services.interview_prep import sanitize_question

logger = logging.getLogger(__name__)

MAX_RESUME_CHARS = 3000
MAX_JOB_CHARS = 2000
MAX_HISTORY_MESSAGES = 16

STAGE_LABELS = {
    "briefing": "刚开场：先简短定位（岗位最关键要求 × 简历最强证据），再问第 1 题",
    "asking": "出题/点评中：点评上一答后，追问一层或出下一题",
    "finished": "已结束：只输出复盘，不再出题",
}

_BLOCK_RE = re.compile(r"```(question|feedback|summary)\s*\n(.*?)```", re.DOTALL)


def _truncate_json(data: dict | None, limit: int) -> str:
    """把上下文压成 JSON 文本并截断，防止长简历占满上下文。"""
    if not data:
        return "（未提供）"
    try:
        text = json.dumps(data, ensure_ascii=False, indent=1)
    except (TypeError, ValueError):
        return "（无法序列化）"
    if len(text) > limit:
        text = text[:limit] + "\n…（内容过长已截断）"
    return text


def build_system_prompt(
    resume_json: dict | None,
    job_json: dict | None,
    *,
    target_count: int,
    asked_questions: list[str],
    stage: str,
) -> str:
    """组装系统提示词（含简历/岗位上下文、已出题目、当前阶段）。"""
    asked = "\n".join(f"- {q}" for q in asked_questions[-30:]) or "（还没有出过题）"
    return INTERVIEW_CHAT_SYSTEM_PROMPT.substitute(
        resume_json=_truncate_json(resume_json, MAX_RESUME_CHARS),
        job_json=_truncate_json(job_json, MAX_JOB_CHARS),
        target_count=target_count,
        asked_count=len(asked_questions),
        stage_label=STAGE_LABELS.get(stage, STAGE_LABELS["asking"]),
        asked_questions=asked,
    )


def _loads_tolerant(raw: str) -> dict | None:
    """容错解析块内 JSON：去围栏/前后杂字，再不行返回 None。"""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def parse_blocks(text: str) -> dict:
    """提取三类结构化块；同名多块时取第一个有效块。"""
    out: dict = {"question": None, "feedback": None, "summary": None}
    for match in _BLOCK_RE.finditer(text or ""):
        kind = match.group(1)
        if out.get(kind):
            continue
        data = _loads_tolerant(match.group(2))
        if data:
            out[kind] = data
        else:
            logger.warning("模拟押题：%s 块 JSON 解析失败，已跳过", kind)
    return out


def strip_blocks(text: str) -> str:
    """剥离结构化块，返回纯展示正文（压缩多余空行）。"""
    if not text:
        return ""
    stripped = _BLOCK_RE.sub("", text)
    stripped = re.sub(r"\n{3,}", "\n\n", stripped)
    return stripped.strip()


def sanitize_feedback(raw: dict | None) -> dict | None:
    """规范化点评块；缺字段时只保留有效部分。"""
    if not isinstance(raw, dict):
        return None

    def _str_list(value, limit: int = 5, item_len: int = 60) -> list[str]:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        return [str(v).strip()[:item_len] for v in value if str(v).strip()][:limit]

    try:
        score = int(raw.get("score"))
    except (TypeError, ValueError):
        score = 3
    score = max(1, min(5, score))
    hits = _str_list(raw.get("hits"))
    gaps = _str_list(raw.get("gaps"))
    advice = str(raw.get("advice") or "").strip()[:120]
    if not (hits or gaps or advice):
        return None
    return {"score": score, "hits": hits, "gaps": gaps, "advice": advice}


def sanitize_summary(raw: dict | None) -> dict | None:
    """规范化复盘块：覆盖度只保留正整数字段，三个列表各自截断。"""
    if not isinstance(raw, dict):
        return None

    def _str_list(value, limit: int = 6) -> list[str]:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        return [str(v).strip()[:80] for v in value if str(v).strip()][:limit]

    coverage_raw = raw.get("coverage")
    coverage: dict[str, int] = {}
    if isinstance(coverage_raw, dict):
        for key, value in list(coverage_raw.items())[:8]:
            try:
                num = int(value)
            except (TypeError, ValueError):
                continue
            if num > 0:
                coverage[str(key).strip()[:20]] = min(num, 99)

    strong = _str_list(raw.get("strong"))
    weak = _str_list(raw.get("weak"))
    actions = _str_list(raw.get("actions"))
    if not (coverage or strong or weak or actions):
        return None
    return {"coverage": coverage, "strong": strong, "weak": weak, "actions": actions}


def sanitize_turn(blocks: dict) -> dict:
    """把解析出的原始块转成可入库/可下发前端的结构。"""
    question_raw = blocks.get("question")
    return {
        "question": sanitize_question(question_raw, 0) if isinstance(question_raw, dict) else None,
        "feedback": sanitize_feedback(blocks.get("feedback")),
        "summary": sanitize_summary(blocks.get("summary")),
    }


async def stream_reply(history: list[dict], system_prompt: str) -> AsyncIterator[str]:
    """流式调用 LLM，逐段 yield 文本增量。

    history 为最近若干条消息（role/content），content 已是剥离块的干净正文。
    与润色链路共用 llm_policy：自动降级 + 计费预检 + 中文错误。
    """
    from openai import AsyncOpenAI

    from app.core.llm_errors import wrap_llm_error
    from app.core.llm_policy import check_before_call, resolve_model
    from app.services import has_valid_api_key

    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY 未配置或未生效，无法进行模拟押题。请检查 backend/.env 中的 LLM_API_KEY。")

    model, note = resolve_model(settings.LLM_MODEL_TEXT)
    if note:
        logger.warning("[模型降级] %s", note)
    check_before_call(model, "模拟押题")

    client = AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)
    messages = [{"role": "system", "content": system_prompt}, *history[-MAX_HISTORY_MESSAGES:]]
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,  # 面试官口吻需要一点自然变化
            max_tokens=4096,  # 思考模型在小 max_tokens 下会返回空 content
            stream=True,
            timeout=180.0,
        )
    except Exception as e:  # noqa: BLE001 —— 统一中文化，SSE 直接展示 str(e)
        raise wrap_llm_error(e, model) from e

    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta
