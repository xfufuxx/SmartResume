import json
import asyncio
from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key
from app.prompts.match_analysis import MATCH_ANALYSIS_SYSTEM_PROMPT
from app.prompts.optimize import OPTIMIZE_SYSTEM_PROMPT

MAX_RETRIES = 3


def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError("LLM_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)


async def _call_with_retry(client, **kwargs):
    for attempt in range(MAX_RETRIES):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            await asyncio.sleep(1 * (attempt + 1))


async def analyze_match(resume_json: dict, job_json: dict) -> dict:
    if not has_valid_api_key():
        return _mock_match_analysis()

    resume_str = json.dumps(resume_json, ensure_ascii=False, indent=2)
    job_str = json.dumps(job_json, ensure_ascii=False, indent=2)

    resp = await _call_with_retry(
        _get_client(),
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
        return _mock_optimize()

    resume_str = json.dumps(resume_json, ensure_ascii=False, indent=2)
    job_str = json.dumps(job_json, ensure_ascii=False, indent=2)
    strategy_str = json.dumps(strategy, ensure_ascii=False, indent=2)

    extra = ""
    if custom_instructions and custom_instructions.strip():
        extra = f"\n用户额外要求（优先遵从）：{custom_instructions.strip()}"

    resp = await _call_with_retry(
        _get_client(),
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
        return "- 个人总结：增加了与岗位匹配的关键词\n- 工作经历：调整了项目描述，突出高并发经验\n- 技能列表：优化了技能排序和分组"

    resp = await _call_with_retry(
        _get_client(),
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
            {"name": "智能简历优化平台", "description": "基于 AI 的简历与岗位匹配优化系统，日处理简历 1000+ 份", "tech": ["FastAPI", "OpenAI", "React", "PostgreSQL", "Docker"]},
        ],
    }