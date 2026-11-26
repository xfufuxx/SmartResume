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
from app.services import interview_flow as flow
from app.services.interview_prep import sanitize_question

logger = logging.getLogger(__name__)

MAX_RESUME_CHARS = 3000
MAX_JOB_CHARS = 2000
MAX_HISTORY_MESSAGES = 16

# 每个环节的当轮指令：告诉模型「这一题该问什么、什么时候必须换环节」。
# 环节顺序与配额由 interview_flow 决定，这里只描述该环节的提问方式。
_STAGE_RULES: dict[str, str] = {
    flow.OPENING: (
        "这是开场第一题：先用 2 句播报流程（今天大概几个问题、聊 10~15 分钟、最后留时间给候选人提问），"
        "再请候选人做自我介绍。本轮不要问技术细节。"
    ),
    flow.RESUME: (
        "在「简历深挖」里问：挑简历中最贴近岗位的一段经历，问具体动作、量化结果、难点取舍与个人贡献。"
        "本环节题数用完就换下一环节，不要在这里多问。"
    ),
    flow.SKILL: (
        "在「专业能力」里问：对照岗位要求的硬技能逐条验证，可出场景题或原理题；"
        "优先问 JD 明确列出、且简历有对应证据的技能。"
    ),
    flow.BEHAVIOR: (
        "在「行为面试」里问：用 STAR 挖冲突处理、失败复盘、跨团队协作或高压交付；"
        "追问真实行为细节（当时谁说了什么、你具体做了什么），不接受抽象总结。"
    ),
    flow.MOTIVATION: (
        "在「求职动机」里问：离职/转岗原因、为什么选这家公司、3 年职业规划；"
        "对「想挑战自己」这类空话追问真实考量。"
    ),
    flow.SALARY: (
        "在「薪资与到岗」里问：期望薪资区间与依据、手上是否有其它 offer、最快到岗时间；"
        "口吻务实，不替候选人砍价，也不做录用承诺。"
    ),
    flow.REVERSE: (
        "这是最后的反问环节：先问「你有什么想问我的吗？」。候选人提问后，"
        "以面试官身份直接回答（给具体信息：团队、汇报关系、考核、当前最大挑战），"
        "不要反问、不要点评问题本身，也不要再出下一题。"
    ),
}

_FINISHED_RULE = (
    "本次模拟已结束：输出复盘（覆盖度、强项、短板、3 条行动建议）与一句真实收尾"
    "（后续流程、多久给反馈），不要再输出 question 块。"
)

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
    stage: str = "asking",
    plan: list[dict] | None = None,
    asked_count: int | None = None,
) -> str:
    """组装系统提示词（简历/岗位上下文 + 环节表 + 当前环节 + 已出题目）。

    stage 是会话生命周期（briefing/asking/finished），只用来判断「是否收尾」；
    具体处在哪个面试环节，由 plan + 已出题数算出，不让模型自己决定。

    asked_count 传「正式题数」（追问不计）。默认退化为 asked_questions 的长度，
    但调用方应显式传入：asked_questions 里含追问，直接用长度会让环节超前。
    """
    plan = plan or flow.build_plan(target_count)
    progress = len(asked_questions) if asked_count is None else max(0, int(asked_count))
    asked = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(asked_questions[-30:])) or "（还没有出过题）"
    current = flow.current_stage(plan, progress)
    stage_key = str(current.get("key") or flow.SKILL)
    rule = _FINISHED_RULE if stage == "finished" else _STAGE_RULES.get(stage_key, _STAGE_RULES[flow.SKILL])
    return INTERVIEW_CHAT_SYSTEM_PROMPT.substitute(
        resume_json=_truncate_json(resume_json, MAX_RESUME_CHARS),
        job_json=_truncate_json(job_json, MAX_JOB_CHARS),
        target_count=target_count,
        asked_count=progress,
        flow_table=flow.plan_table(plan, progress),
        stage_label=current.get("label") or flow.stage_label(stage_key),
        stage_focus=current.get("focus") or "",
        stage_left=flow.remaining_in_stage(plan, progress),
        stage_rule=rule,
        asked_questions=asked,
    )


def stage_default_category(stage_key: str | None) -> str:
    """当前环节对应的默认题目分类（模型没给或给错分类时兜底）。"""
    stage = flow.STAGE_MAP.get(str(stage_key or ""))
    return stage.category if stage else "职业规划"


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


def sanitize_turn(blocks: dict, default_category: str | None = None) -> dict:
    """把解析出的原始块转成可入库/可下发前端的结构。

    default_category 传当前面试环节的分类，避免反问环节的题被标成「职业规划」。
    followup 是模型自报的「这是对上一题的追问」，只有它为真时才不占目标题数，
    避免追问把 8 题的面试拖成 12 题；模型忘记标注时退化为普通题，不会卡住进度。
    """
    question_raw = blocks.get("question")
    followup = bool(question_raw.get("followup")) if isinstance(question_raw, dict) else False
    return {
        "question": sanitize_question(question_raw, 0, default_category or "职业规划")
        if isinstance(question_raw, dict) else None,
        "feedback": sanitize_feedback(blocks.get("feedback")),
        "summary": sanitize_summary(blocks.get("summary")),
        "followup": followup,
    }


def drop_opening_feedback(turn: dict, has_questions: bool) -> dict:
    """开场轮（此前还没有任何题目）不该有点评。

    模型被「每轮必须给 feedback」的规则逼着评价一次不存在的回答，
    实测会写「候选人尚未作答」并给 3 分，前端看起来像答过了。
    这里统一丢弃，点评只保留给真实作答。
    """
    if not has_questions:
        turn["feedback"] = None
    return turn


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
