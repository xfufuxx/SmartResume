import json
import asyncio
import logging
from openai import AsyncOpenAI

from app.config import settings
from app.core.llm_errors import is_retryable_error, wrap_llm_error
from app.core.llm_policy import check_before_call
from app.core.llm_policy import resolve_model as resolve_policy_model
from app.services import ensure_mock_allowed, has_valid_api_key
from app.prompts.match_analysis import MATCH_ANALYSIS_SYSTEM_PROMPT
from app.prompts.optimize import OPTIMIZE_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def _call_with_retry(client, task: str = "LLM 调用", **kwargs):
    """带指数退避重试的 LLM 调用。

    与裸重试的区别：
    - 模型名先过 llm_policy.resolve_model：免费额度已过期/不覆盖的模型
      在 LLM_AUTO_FALLBACK 开启时自动换成仍在免费期内的替补（如 2026-10-23 后
      qwen3.7-flash 额度到期 → 自动切 qwen3.7-max），用户无感；
    - 调用前 check_before_call 预检：仅免费模式下命中付费模型直接拒绝，绝不发请求；
    - 403/400/401 等确定性错误不重试（重试结果不会变），直接抛中文友好异常；
    - response_format 不兼容时去掉该参数重试。
    """
    kwargs.setdefault("timeout", 120.0)
    kwargs.setdefault("temperature", 0.2)  # 匹配/优化/改写需稳定输出，默认低温

    # 模型解析与降级（resolve_model 是纯函数，失败行为 = 原样返回）
    requested = kwargs.get("model", "")
    resolved, note = resolve_policy_model(requested)
    if note:
        logger.warning("[模型降级] %s", note)
    kwargs["model"] = resolved

    # 调用前计费预检（免费额度内直接放行；付费且 LLM_ALLOW_PAID=false → 抛 PaidCallBlocked）
    check_before_call(resolved, task, retry_budget=MAX_RETRIES)

    for attempt in range(MAX_RETRIES):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            error_msg = str(e).lower()
            # response_format 不兼容时去掉该参数重试（使用副本，不影响后续 retry）
            if "response_format" in error_msg or "json_object" in error_msg:
                fallback_kwargs = {k: v for k, v in kwargs.items() if k != "response_format"}
                try:
                    return await client.chat.completions.create(**fallback_kwargs)
                except Exception as e2:
                    if not is_retryable_error(e2):
                        raise wrap_llm_error(e2, resolved) from e2
                    if attempt == MAX_RETRIES - 1:
                        raise wrap_llm_error(e2, resolved) from e2
                    await asyncio.sleep(1 * (attempt + 1))
                    continue
            # 确定性错误（403 额度/权限、400、401…）：重试无意义，直接抛中文友好异常
            if not is_retryable_error(e):
                raise wrap_llm_error(e, resolved) from e
            if attempt == MAX_RETRIES - 1:
                raise wrap_llm_error(e, resolved) from e
            await asyncio.sleep(1 * (attempt + 1))


async def analyze_match(resume_json: dict, job_json: dict) -> dict:
    if not has_valid_api_key():
        ensure_mock_allowed("匹配分析")
        return _mock_match_analysis()

    resume_str = json.dumps(resume_json, ensure_ascii=False, indent=2)
    job_str = json.dumps(job_json, ensure_ascii=False, indent=2)

    resp = await _call_with_retry(
        _get_client(),
        task="匹配分析",
        model=settings.LLM_MODEL_TEXT,
        messages=[
            {
                "role": "user",
                "content": MATCH_ANALYSIS_SYSTEM_PROMPT.format(
                    resume_json=resume_str, job_json=job_str
                ),
            }
        ],
        response_format={"type": "json_object"},
        max_tokens=4096,
    )

    return json.loads(resp.choices[0].message.content or "{}")


async def optimize_resume(resume_json: dict, job_json: dict, strategy: dict, custom_instructions: str | None = None) -> dict:
    if not has_valid_api_key():
        ensure_mock_allowed("简历优化")
        return _mock_optimize()

    resume_str = json.dumps(resume_json, ensure_ascii=False, indent=2)
    job_str = json.dumps(job_json, ensure_ascii=False, indent=2)
    strategy_str = json.dumps(strategy, ensure_ascii=False, indent=2)

    extra = ""
    if custom_instructions and custom_instructions.strip():
        extra = f"\n用户额外要求（优先遵从）：{custom_instructions.strip()}"

    resp = await _call_with_retry(
        _get_client(),
        task="简历优化",
        model=settings.LLM_MODEL_TEXT,
        messages=[
            {
                "role": "user",
                "content": OPTIMIZE_SYSTEM_PROMPT.format(
                    resume_json=resume_str, job_json=job_str, strategy_json=strategy_str,
                    extra_instructions=extra,
                ),
            }
        ],
        response_format={"type": "json_object"},
        max_tokens=8192,
    )

    return json.loads(resp.choices[0].message.content or "{}")


async def generate_changes_description(resume_json: dict, optimized_json: dict) -> str:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY 未配置或未生效，无法生成修改说明。请检查 backend/.env 中的 LLM_API_KEY。")

    resp = await _call_with_retry(
        _get_client(),
        task="修改说明生成",
        model=settings.LLM_MODEL_TEXT,
        messages=[
            {
                "role": "user",
                "content": f"""对比原简历和优化后的简历，用中文简要列出所有的修改点（3-5条）。
原简历JSON：{json.dumps(resume_json, ensure_ascii=False, indent=2)}
优化后JSON：{json.dumps(optimized_json, ensure_ascii=False, indent=2)}
格式：每条一行，以"- "开头。""",
            }
        ],
        max_tokens=1024,
    )
    return resp.choices[0].message.content or ""


def _mock_match_analysis() -> dict:
    return {
        "match_score": 72,
        "strengths": ["Python 后端开发经验丰富", "有高并发系统设计经验", "熟悉 PostgreSQL"],
        "gaps": ["缺乏消息队列使用经验", "Kubernetes 经验较少"],
        "rewrite_strategy": {
            "summary": "在个人总结中突出高并发系统设计和 Python 架构能力",
            "experience": "将现有经历中的性能优化成果与岗位要求的高并发场景对齐",
            "skills": "将 Python、FastAPI、Docker 放在最前面",
            "projects": "突出项目中与后端架构、性能优化相关的内容",
        },
    }


def _mock_optimize() -> dict:
    return {
        "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"},
        "summary": "5年后端开发经验，精通 Python 和 FastAPI，具备高并发系统设计与性能优化能力，熟悉 Docker 容器化部署。",
        "experience": [
            {
                "company": "星辰科技",
                "title": "高级后端工程师",
                "start": "2021-03",
                "end": "2024-12",
                "points": [
                    "负责电商平台核心订单系统架构设计，支撑日订单 50 万+ 的高并发场景",
                    "将核心接口响应时间从 800ms 优化至 120ms，系统吞吐量提升 6 倍",
                    "引入 Docker + K8s 实现服务容器化部署与自动化扩缩容",
                    "主导数据库索引优化和缓存策略设计，降低 PostgreSQL 负载 40%",
                ],
            },
            {
                "company": "云帆软件",
                "title": "后端开发工程师",
                "start": "2019-07",
                "end": "2021-02",
                "points": [
                    "参与企业级 OA 系统后端 RESTful API 开发",
                    "使用 PostgreSQL 设计高扩展性数据库表结构",
                    "编写 API 文档并与前端团队协作完成接口联调",
                ],
            },
        ],
        "education": [{"school": "华中科技大学", "degree": "本科", "major": "计算机科学与技术", "start": "2015-09", "end": "2019-06"}],
        "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git", "性能优化", "系统架构设计"],
        "projects": [
            {"name": "智能简历优化平台", "role": "核心开发", "start": "2023-03", "end": "2023-12", "points": ["基于 FastAPI + React 构建简历解析与优化系统，日处理简历 1000+ 份", "接入视觉模型实现简历版面识别，解析准确率达 95%", "使用 WeasyPrint 与 Playwright 双通道导出 PDF，导出成功率 99.5%"]},
        ],
    }