import json
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.services.agent_optimizer import _call_with_retry, _get_client


REFINE_PROMPT_TEMPLATE = """原始简历段落：{original_text}
AI上一轮建议：{suggested_text}
用户补充指令：{instruction}
请根据指令修改AI建议，只输出修改后的段落，不要额外解释。"""


async def refine_optimization(
    original_text: str,
    suggested_text: str,
    instruction: str,
) -> str:
    """
    根据用户补充指令微调AI建议文本
    返回新的建议文本
    """
    if not has_valid_api_key():
        return _mock_refine(original_text, suggested_text, instruction)

    prompt = REFINE_PROMPT_TEMPLATE.format(
        original_text=original_text,
        suggested_text=suggested_text,
        instruction=instruction,
    )

    resp = await _call_with_retry(
        _get_client(),
        model=settings.LLM_MODEL_TEXT,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4096,
    )

    return resp.choices[0].message.content or suggested_text


def _mock_refine(original_text: str, suggested_text: str, instruction: str) -> str:
    return suggested_text + f"\n\n[根据指令微调：{instruction}]"