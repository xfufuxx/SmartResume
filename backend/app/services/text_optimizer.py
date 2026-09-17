"""
文本优化调度器。

职责：
1. 识别哪些字段需要优化（保护字段白名单）
2. 将需要优化的文本片段分批发送给大模型（settings.LLM_MODEL_TEXT）
3. 将优化结果映射回原位置（block_index → new_text）

设计原则：
- 姓名、联系方式、教育背景：保护不优化，只做格式修正
- 个人总结、工作经历、项目描述、技能：发送给大模型优化
- 保持上下文：将同一字段类型的多个块合并发送，保留上下文连贯性
"""

import asyncio
import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.services.pdf_layout_editor import TextBlock, PROTECTED_FIELDS, OPTIMIZABLE_FIELDS

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

# ─── 优化提示词 ──────────────────────────────────────────────────


BLOCK_OPTIMIZE_PROMPT = """你是一位资深简历优化专家。请根据岗位要求优化以下简历文本片段。

岗位要求：
{job_json}

优化规则：
1. 保持原文的格式和结构，只优化文字内容。
2. 用 JD 中的术语和关键词替换原有描述，但不能捏造不存在的技能或经历。
3. 量化表达：将模糊描述改为具体数字（如"提升效率"→"提升效率30%"），但数字需要合理。
4. 突出与岗位要求匹配的经验和能力。
5. 如果某段文字是标题（如"工作经历"、"项目经验"等），保持原标题不变。
6. 输出必须与输入一一对应：每个输入片段对应一个输出片段，顺序一致。

以下是需要优化的文本片段（每段以 [BLOCK_N] 开头）：

{input_blocks}

请返回 JSON 格式，key 为 BLOCK_N（如 "BLOCK_0"），value 为优化后的文本：
{{
  "BLOCK_0": "优化后的文本",
  "BLOCK_1": "优化后的文本"
}}

请仅返回 JSON，不要包含任何解释。"""


# ─── 调度器 ──────────────────────────────────────────────────────


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def optimize_text_blocks(
    blocks: list[TextBlock],
    job_json: dict,
    custom_instructions: Optional[str] = None,
) -> dict[int, str]:
    """
    优化文本块内容。

    策略：
    1. 区分保护字段和优化字段
    2. 保护字段：原样返回
    3. 优化字段：分批发送给大模型，返回优化后的文本
    4. 结果映射回 {block_index: new_text}

    Args:
        blocks: 文本块列表（来自 PDF 解析）
        job_json: 岗位要求 JSON
        custom_instructions: 用户自定义优化指令

    Returns:
        {block_index: new_text} 映射
    """
    result: dict[int, str] = {}

    # 1. 保护字段：原样保留
    protected_blocks = [b for b in blocks if b.field_type in PROTECTED_FIELDS]
    for b in protected_blocks:
        result[b.block_index] = b.text

    # 2. 优化字段：收集需要优化的块
    optimizable_blocks = [b for b in blocks if b.field_type in OPTIMIZABLE_FIELDS]
    # 也包含 unknown 类型的块（可能是落网之鱼）
    unknown_blocks = [b for b in blocks if b.field_type == "unknown"]
    optimizable_blocks.extend(unknown_blocks)

    if not optimizable_blocks:
        return result

    # 3. 按字段类型分组优化
    groups: dict[str, list[TextBlock]] = {}
    for b in optimizable_blocks:
        groups.setdefault(b.field_type, []).append(b)

    for field_type, group_blocks in groups.items():
        # 分批发送（每批最多 15 个块，避免 token 超限）
        batch_size = 15
        for batch_start in range(0, len(group_blocks), batch_size):
            batch = group_blocks[batch_start:batch_start + batch_size]

            # 构建输入
            input_parts = []
            for i, block in enumerate(batch):
                block_id = batch_start + i
                input_parts.append(f"[BLOCK_{block_id}] {block.text}")

            input_text = "\n\n".join(input_parts)

            # 调用大模型（settings.LLM_MODEL_TEXT）
            try:
                optimized = await _call_llm_optimize(
                    input_text=input_text,
                    job_json=job_json,
                    custom_instructions=custom_instructions,
                )
                # 解析结果并映射回 block_index
                for i, block in enumerate(batch):
                    block_id = batch_start + i
                    key = f"BLOCK_{block_id}"
                    if key in optimized:
                        result[block.block_index] = optimized[key]
                    else:
                        # 模型未返回该块，保留原文
                        result[block.block_index] = block.text
                        logger.warning(f"大模型未返回 {key} 的优化结果，保留原文")
            except Exception as e:
                logger.error(f"优化失败 (field={field_type}, batch={batch_start}): {e}")
                # 失败时保留原文
                for block in batch:
                    result[block.block_index] = block.text

    return result


async def _call_llm_optimize(
    input_text: str,
    job_json: dict,
    custom_instructions: Optional[str] = None,
) -> dict[str, str]:
    """
    调用大模型优化文本（带指数退避重试）。

    Args:
        input_text: 格式化的输入文本（包含 BLOCK_N 标记）
        job_json: 岗位要求
        custom_instructions: 用户自定义指令

    Returns:
        {"BLOCK_0": "优化后文本", ...}
    """
    job_str = json.dumps(job_json, ensure_ascii=False, indent=2)

    extra = ""
    if custom_instructions and custom_instructions.strip():
        extra = f"\n\n用户额外要求（优先遵从）：{custom_instructions.strip()}"

    prompt = BLOCK_OPTIMIZE_PROMPT.format(
        job_json=job_str,
        input_blocks=input_text,
    ) + extra

    client = _get_client()
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.chat.completions.create(
                model=settings.LLM_MODEL_TEXT,
                messages=[
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=4096,
                timeout=60.0,
            )

            content = resp.choices[0].message.content or "{}"
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                import re
                match = re.search(r'\{[\s\S]*\}', content)
                if match:
                    return json.loads(match.group())
                raise ValueError(f"大模型返回的不是有效 JSON: {content[:200]}")
        except Exception as e:
            error_msg = str(e).lower()
            if "response_format" in error_msg or "json_object" in error_msg:
                # 去掉 response_format 重试
                try:
                    resp = await client.chat.completions.create(
                        model=settings.LLM_MODEL_TEXT,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=4096,
                        timeout=60.0,
                    )
                    content = resp.choices[0].message.content or "{}"
                    import re
                    match = re.search(r'\{[\s\S]*\}', content)
                    if match:
                        return json.loads(match.group())
                    return json.loads(content)
                except json.JSONDecodeError:
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(1 * (attempt + 1))
                        continue
                    raise
            if attempt < MAX_RETRIES - 1:
                logger.warning(f"大模型调用失败 (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                await asyncio.sleep(1 * (attempt + 1))
            else:
                raise


async def optimize_image_blocks(
    blocks: list,  # ImageBlock 列表
    job_json: dict,
    custom_instructions: Optional[str] = None,
) -> dict[int, str]:
    """
    优化图片简历中的文本块（与 PDF 版本逻辑相同，但输入格式不同）。

    Args:
        blocks: ImageBlock 列表
        job_json: 岗位要求
        custom_instructions: 用户自定义指令

    Returns:
        {block_index: new_text} 映射
    """
    from app.services.image_layout_editor import PROTECTED_TYPES, OPTIMIZABLE_TYPES

    result: dict[int, str] = {}

    # 保护字段：原样保留
    for i, block in enumerate(blocks):
        if block.block_type in PROTECTED_TYPES:
            result[i] = block.text

    # 优化字段（排除章节标题）
    optimizable = [
        (i, b) for i, b in enumerate(blocks)
        if (b.block_type in OPTIMIZABLE_TYPES or b.block_type == "other") and not getattr(b, 'is_header', False)
    ]
    if not optimizable:
        return result

    # 分批发送
    batch_size = 15
    for batch_start in range(0, len(optimizable), batch_size):
        batch = optimizable[batch_start:batch_start + batch_size]

        input_parts = []
        for j, (_, block) in enumerate(batch):
            block_id = batch_start + j
            input_parts.append(f"[BLOCK_{block_id}] {block.text}")

        input_text = "\n\n".join(input_parts)

        try:
            optimized = await _call_llm_optimize(
                input_text=input_text,
                job_json=job_json,
                custom_instructions=custom_instructions,
            )
            for j, (orig_idx, block) in enumerate(batch):
                block_id = batch_start + j
                key = f"BLOCK_{block_id}"
                if key in optimized:
                    result[orig_idx] = optimized[key]
                else:
                    result[orig_idx] = block.text
        except Exception as e:
            logger.error(f"图片文本优化失败 (batch={batch_start}): {e}")
            for orig_idx, block in batch:
                result[orig_idx] = block.text

    return result