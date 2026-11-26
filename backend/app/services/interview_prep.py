"""AI 面试预测：基于「简历 + 岗位」生成押题清单与答题指导。"""
import json
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.prompts.interview_prep import INTERVIEW_PREP_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
VALID_CATEGORIES = {"技术能力", "项目深挖", "行为面试", "岗位匹配", "职业规划"}


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def _call_with_retry(client, **kwargs):
    """带退避重试的 LLM 调用，自动处理 response_format 不兼容。

    仅对可重试错误（429/5xx/网络）重试；403/401/400 等确定性错误立即上抛，
    避免额度耗尽时白等 3 次（与 llm_errors.is_retryable_error 的口径一致）。
    """
    from app.core.llm_errors import is_retryable_error

    kwargs.setdefault("timeout", 180.0)
    kwargs.setdefault("temperature", 0.6)  # 面试题需要一定多样性
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:  # noqa: BLE001
            last_err = e
            msg = str(e).lower()
            if "response_format" in msg or "json_object" in msg:
                fallback = {k: v for k, v in kwargs.items() if k != "response_format"}
                try:
                    return await client.chat.completions.create(**fallback)
                except Exception as e2:  # noqa: BLE001
                    last_err = e2
                    e = e2
            if not is_retryable_error(e):
                break
            if attempt < MAX_RETRIES - 1:
                import asyncio
                await asyncio.sleep(2 * (attempt + 1))
    raise last_err or RuntimeError("LLM 调用失败")


def sanitize_question(item: dict, order_index: int = 0) -> dict | None:
    """校验并规范化单道题；题面为空返回 None（两套链路共用）。"""
    if not isinstance(item, dict):
        return None
    question = (item.get("question") or "").strip()
    if not question:
        return None
    category = (item.get("category") or "职业规划").strip()
    if category not in VALID_CATEGORIES:
        category = "职业规划"
    outline = item.get("answer_outline") or []
    if isinstance(outline, str):
        outline = [outline]
    outline = [str(o).strip() for o in outline if str(o).strip()][:6]
    difficulty = (item.get("difficulty") or "中等").strip()
    if difficulty not in {"简单", "中等", "困难"}:
        difficulty = "中等"
    return {
        "order_index": order_index,
        "category": category,
        "difficulty": difficulty,
        "question": question,
        "intent": (item.get("intent") or "").strip(),
        "answer_outline": outline,
        "sample_answer": (item.get("sample_answer") or "").strip(),
    }


def _sanitize(raw: dict, question_count: int) -> dict:
    """清洗 LLM 输出，保证字段结构与类型稳定。"""
    questions: list[dict] = []
    for idx, item in enumerate(raw.get("questions") or []):
        q = sanitize_question(item, idx)
        if q:
            questions.append(q)
    questions = questions[: max(1, min(question_count, 20))]
    for i, q in enumerate(questions):
        q["order_index"] = i
    return {
        "overall_advice": (raw.get("overall_advice") or "").strip(),
        "questions": questions,
    }


async def generate_interview_questions(
    resume_json: dict, job_json: dict, question_count: int = 8
) -> dict:
    """生成面试押题。

    与项目其他 AI 链路保持一致：无有效 API Key 时直接抛错，绝不返回假题目
    ——编造的面试题会误导用户准备方向，风险与假简历同级。
    """
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY 未配置或未生效，无法生成面试题。请检查 backend/.env 中的 LLM_API_KEY。")

    from app.core.llm_errors import wrap_llm_error
    from app.core.llm_policy import check_before_call, resolve_model

    model, note = resolve_model(settings.LLM_MODEL_TEXT)
    if note:
        logger.warning("[模型降级] %s", note)
    check_before_call(model, "面试押题")

    prompt = INTERVIEW_PREP_SYSTEM_PROMPT.format(
        resume_json=json.dumps(resume_json, ensure_ascii=False, indent=2),
        job_json=json.dumps(job_json, ensure_ascii=False, indent=2),
        question_count=question_count,
    )

    try:
        resp = await _call_with_retry(
            _get_client(),
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=8192,
        )
    except Exception as e:  # noqa: BLE001 —— 统一转中文可操作异常
        raise wrap_llm_error(e, model) from e

    content = resp.choices[0].message.content or "{}"
    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        # 部分模型会在 JSON 外包一层 ```json，做一次兜底剥离
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        raw = json.loads(cleaned)

    if not isinstance(raw, dict):
        raw = {}
    return _sanitize(raw, question_count)
