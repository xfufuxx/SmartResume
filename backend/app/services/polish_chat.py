"""AI 对话润色服务 —— 系统提示词、流式对话、建议协议解析。

建议协议（与前端契约）：
模型在回复中可输出零到多个 ```suggestion 代码块，块内为单行 JSON：
  {"target": "位置描述", "original": "原文", "improved": "改写后的文本", "reason": "改写理由"}
前端把块渲染为「应用」卡片；用户点击后才由前端经既有端点写回。
本模块只解析与透出，绝不直接修改简历数据。
"""
from __future__ import annotations

import json
import logging
import re
from typing import AsyncIterator

logger = logging.getLogger(__name__)

#: 单个建议块的 JSON 必填字段
_REQUIRED_FIELDS = ("target", "original", "improved")

_SUGGESTION_BLOCK = re.compile(r"```suggestion\s*\n(.*?)```", re.DOTALL)


def polish_system_prompt(context_text: str) -> str:
    """构建润色对话的系统提示词。"""
    return f"""你是资深简历顾问，帮用户用对话的方式润色简历内容。

工作方式：
- 先理解用户意图，再给出具体、可落地的改写；用强动作动词与量化表达
- 与用户保持同一语言（中文提问用中文回答）
- 每次给出具体改写时，必须附带 suggestion 代码块（格式见下），让用户可以一键应用
- 没有具体改写时（如纯讨论、提问），正常文字回答即可，不要输出空块

suggestion 代码块格式（可输出多个）：
```suggestion
{{"target": "内容位置描述", "original": "简历中的原文", "improved": "改写后的文本", "reason": "改写理由"}}
```

规则：
- original 必须是当前简历内容中真实存在的文本（允许适度截取核心句），否则用户无法应用
- improved 保持专业、简洁，不夸大、不编造经历
- 除 suggestion 块外，正常解释你的改写思路

以下是当前简历内容（JSON）：
{context_text or '（未提供简历上下文）'}"""


def parse_suggestions(text: str) -> list[dict]:
    """从回复中提取全部 suggestion 块 → 结构化建议列表。

    容错：单块 JSON 损坏时跳过该块（记录警告），不影响其它建议。
    """
    suggestions: list[dict] = []
    for idx, match in enumerate(_SUGGESTION_BLOCK.finditer(text or "")):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.warning("suggestion 块 JSON 解析失败（第 %d 个），已跳过", idx + 1)
            continue
        if not isinstance(data, dict):
            continue
        if not all(isinstance(data.get(f), str) and data.get(f).strip() for f in _REQUIRED_FIELDS):
            logger.warning("suggestion 块缺少必填字段（第 %d 个），已跳过", idx + 1)
            continue
        suggestions.append({
            "id": f"sug-{idx + 1}",
            "target": data["target"].strip(),
            "original": data["original"],
            "improved": data["improved"],
            "reason": str(data.get("reason") or "").strip(),
        })
    return suggestions


def strip_suggestion_blocks(text: str) -> str:
    """剥除 suggestion 块与多余空行，返回纯展示文本。"""
    if not text:
        return ""
    stripped = _SUGGESTION_BLOCK.sub("", text)
    # 压缩 3+ 连续空行，去掉块前后遗留的孤立空行
    stripped = re.sub(r"\n{3,}", "\n\n", stripped)
    return stripped.strip()


async def stream_polish_reply(
    history: list[dict],
    context_text: str,
) -> AsyncIterator[str]:
    """流式调用 LLM，逐段 yield 文本增量（SSE delta 的上游）。

    history: [{"role": "user"/"assistant", "content": str}, ...]，已截断到最近若干轮。
    """
    from openai import AsyncOpenAI

    from app.config import settings
    from app.services import has_valid_api_key

    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY 未配置或未生效，无法进行对话润色")

    client = AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)
    messages = [
        {"role": "system", "content": polish_system_prompt(context_text)},
        *history,
    ]
    stream = await client.chat.completions.create(
        model=settings.LLM_MODEL_TEXT,
        messages=messages,
        temperature=0.6,
        max_tokens=4096,
        stream=True,
        timeout=120.0,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


def extract_context_from_optimized(optimized_json: dict | None) -> str:
    """把优化记录 JSON 压成上下文文本（控制长度，保留结构）。"""
    if not optimized_json:
        return ""
    try:
        text = json.dumps(optimized_json, ensure_ascii=False, indent=1)
    except (TypeError, ValueError):
        return ""
    # 兜底截断，防止上下文超长（约 6000 字符）
    if len(text) > 6000:
        text = text[:6000] + "\n…（内容过长已截断）"
    return text
