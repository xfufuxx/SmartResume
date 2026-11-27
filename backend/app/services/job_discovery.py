"""AI 岗位检索与五维适配度评估。

与旧「岗位匹配罗盘」的区别
--------------------------
旧实现：拿用户**自己上传的岗位截图**（JobImage）逐条算规则分。
新实现：以**简历**为起点，AI 主动检索市场上与之相关的岗位（招聘渠道 / 公开网络），
       再按技能、经验、学历、地点、薪资五个维度算出适配度，并给出理由、差距与建议。

两条通道
--------
1. ``web``  ：配置了 TAVILY_API_KEY / SERPER_API_KEY 时，先真实检索公开招聘信息，
             再由模型结构化 + 评分（来源域名、原始链接都保留）。
2. ``ai``   ：未配置检索 Key 时的默认通道。由模型基于简历画像与公开招聘信息特征
             生成**代表性岗位画像**，公司匿名化、链接留空，前端明确标注「AI 岗位画像」。
             绝不伪造真实企业名称与链接。

评分口径
--------
模型只给五个维度各自的分与理由；总分由后端按固定权重合成，
这样前端展示的维度条与总分永远自洽（模型自报总分常常与维度分打架）。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Awaitable, Callable

import httpx
from openai import AsyncOpenAI

from app.config import settings
from app.prompts.job_discovery import (
    JOB_DISCOVERY_SYSTEM_PROMPT,
    SCORING_RULES,
    WEB_JOB_STRUCTURING_PROMPT,
)
from app.services import has_valid_api_key

logger = logging.getLogger(__name__)

TZ_UTC8 = timezone(timedelta(hours=8))

# 五维权重（和为 1）。技能与经验是硬门槛，地点与薪资是现实约束。
DIMENSION_WEIGHTS: dict[str, float] = {
    "skills": 0.30,
    "experience": 0.25,
    "education": 0.10,
    "location": 0.15,
    "salary": 0.20,
}

DIMENSION_LABELS: dict[str, str] = {
    "skills": "技能匹配",
    "experience": "经验年限",
    "education": "学历要求",
    "location": "工作地点",
    "salary": "薪资水平",
}

MIN_JOBS, MAX_JOBS = 3, 12
DEFAULT_JOBS = 5

Progress = Callable[[str], Awaitable[None]] | None

_DEGREE_RANK = (
    ("博士", 50), ("硕士", 40), ("研究生", 40), ("mba", 40),
    ("本科", 30), ("学士", 30), ("大专", 20), ("专科", 20), ("高中", 10), ("中专", 10),
)

_DATE_RE = re.compile(r"((?:19|20)\d{2})\D{0,3}(\d{1,2})?")
_PRESENT_WORDS = ("至今", "现在", "今", "present", "now", "current")


# ─────────────────────────────────────────────────────────────
# 简历画像（确定性提取，不花额度）
# ─────────────────────────────────────────────────────────────
def parse_year_month(value: str | None) -> tuple[int, int] | None:
    """把 "2021.03" / "2021-3" / "2021年3月" / "2021" 解析成 (年, 月)。"""
    if not value:
        return None
    if any(w in str(value).lower() for w in _PRESENT_WORDS):
        return None
    m = _DATE_RE.search(str(value))
    if not m:
        return None
    year = int(m.group(1))
    month = int(m.group(2)) if m.group(2) else 1
    if not 1 <= month <= 12:
        month = 1
    return year, month


def _is_present(value: str | None) -> bool:
    return bool(value) and any(w in str(value).lower() for w in _PRESENT_WORDS)


def compute_years_experience(experience: list[dict], now: datetime | None = None) -> float:
    """按最早入职到最晚离职（或在职=今天）计算工作年限；无日期返回 0。"""
    now = now or datetime.now(TZ_UTC8)
    starts: list[tuple[int, int]] = []
    ends: list[tuple[int, int]] = []
    has_present = False
    for exp in experience or []:
        if not isinstance(exp, dict):
            continue
        s = parse_year_month(exp.get("start"))
        if s:
            starts.append(s)
        if _is_present(exp.get("end")):
            has_present = True
        else:
            e = parse_year_month(exp.get("end"))
            if e:
                ends.append(e)
    if not starts:
        return 0.0
    start_y, start_m = min(starts)
    if has_present:
        end_y, end_m = now.year, now.month
    elif ends:
        end_y, end_m = max(ends)
    else:
        end_y, end_m = now.year, now.month
    months = (end_y - start_y) * 12 + (end_m - start_m)
    if months <= 0:
        return 0.0
    return round(min(months / 12, 50), 1)


def highest_education(education: list[dict]) -> dict:
    """返回最高学历 {degree, school, major}；学历按常见层级取最高。"""
    best = {"degree": "", "school": "", "major": ""}
    best_rank = -1
    for edu in education or []:
        if not isinstance(edu, dict):
            continue
        degree = str(edu.get("degree") or "").strip()
        if not degree:
            continue
        rank = 0
        low = degree.lower()
        for token, r in _DEGREE_RANK:
            if token in low:
                rank = max(rank, r)
        if rank > best_rank:
            best_rank = rank
            best = {
                "degree": degree,
                "school": str(edu.get("school") or "").strip(),
                "major": str(edu.get("major") or "").strip(),
            }
    return best


def _clean_list(values, limit: int = 20, item_limit: int = 60) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values or []:
        text = str(v or "").strip()
        if not text:
            continue
        text = text[:item_limit]
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def _base_title(title: str) -> str:
    """去掉「高级/资深/初级/中级/首席」等修饰，得到岗位基本名，用于扩展检索方向。"""
    base = re.sub(r"^(高级|资深|初级|中级|首席|主任|见习|实习)\s*", "", (title or "").strip())
    return base.strip()


def build_candidate_profile(
    parsed: dict,
    *,
    city: str | None = None,
    direction: str | None = None,
    salary: str | None = None,
    industries: list[str] | None = None,
) -> dict:
    """把 resume.parsed_json 压成「检索用画像」。

    只保留与岗位检索相关的字段，并做长度裁剪——画像会整段塞进提示词，
    原样塞整份简历既浪费 Token 也容易让模型跑偏到细枝末节。
    """
    parsed = parsed or {}
    info = parsed.get("personal_info") or {}
    experience = [e for e in (parsed.get("experience") or []) if isinstance(e, dict)]
    latest = experience[0] if experience else {}
    latest_title = str(latest.get("title") or "").strip()
    years = compute_years_experience(experience)
    edu = highest_education(parsed.get("education") or [])

    skills = _clean_list(parsed.get("skills") or [], limit=24, item_limit=40)

    # 从经历与项目要点里捞出带数字的成果，作为「匹配理由」的事实来源
    achievements: list[str] = []
    for block in experience + [p for p in (parsed.get("projects") or []) if isinstance(p, dict)]:
        for point in (block.get("points") or [])[:3]:
            text = str(point or "").strip()
            if text and re.search(r"\d", text):
                achievements.append(text[:120])
    achievements = _clean_list(achievements, limit=6, item_limit=120)

    target_titles: list[str] = []
    if direction and direction.strip():
        target_titles.append(direction.strip())
    if latest_title:
        target_titles.append(latest_title)
        base = _base_title(latest_title)
        if base and base != latest_title:
            target_titles.append(base)
    target_titles = _clean_list(target_titles, limit=4, item_limit=40)

    cities: list[str] = []
    if city and city.strip():
        cities.append(city.strip())
    for key in ("city", "location", "current_city"):
        value = info.get(key)
        if value and str(value).strip():
            cities.append(str(value).strip())
    cities = _clean_list(cities, limit=3, item_limit=20)

    return {
        "name": str(info.get("name") or "").strip(),
        "latest_title": latest_title,
        "latest_company": str(latest.get("company") or "").strip(),
        "years_experience": years,
        "education": edu,
        "skills": skills,
        "target_titles": target_titles,
        "cities": cities,
        "salary_expectation": (salary or "").strip(),
        "industries": _clean_list(industries or [], limit=4, item_limit=20),
        "achievements": achievements,
        "summary": str(parsed.get("summary") or "").strip()[:300],
        "certificates": _clean_list(parsed.get("certificates") or [], limit=8, item_limit=40),
    }


def profile_prompt_payload(profile: dict) -> dict:
    """提示词里只放画像核心字段，避免个人信息（姓名/邮箱）不必要地外发。"""
    return {
        "目标岗位": profile.get("target_titles") or [],
        "当前/最近职位": profile.get("latest_title") or "",
        "工作年限": profile.get("years_experience") or 0,
        "最高学历": profile.get("education") or {},
        "核心技能": profile.get("skills") or [],
        "期望城市": profile.get("cities") or [],
        "期望薪资": profile.get("salary_expectation") or "",
        "期望行业": profile.get("industries") or [],
        "代表性成果": profile.get("achievements") or [],
        "自我介绍": profile.get("summary") or "",
        "证书": profile.get("certificates") or [],
    }


# ─────────────────────────────────────────────────────────────
# 评分 / 清洗
# ─────────────────────────────────────────────────────────────
def _clamp_score(value, default: int = 60) -> int:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return default
    if num != num:  # NaN
        return default
    return max(0, min(100, int(round(num))))


def overall_score(dimensions: dict) -> int:
    """按固定权重合成总分；缺失维度按剩余权重归一，避免缺项把总分拉垮。"""
    total = 0.0
    weight = 0.0
    for key, w in DIMENSION_WEIGHTS.items():
        item = dimensions.get(key) or {}
        if not isinstance(item, dict) or item.get("score") is None:
            continue
        total += float(item["score"]) * w
        weight += w
    if weight <= 0:
        return 0
    return _clamp_score(total / weight)


def _list_of_text(value, limit: int = 6, item_limit: int = 160) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    return _clean_list(value, limit=limit, item_limit=item_limit)


def _job_id(title: str, company: str) -> str:
    digest = hashlib.md5(f"{title}|{company}".encode("utf-8")).hexdigest()[:8]
    return f"dj-{digest}"


def sanitize_job(raw: dict, index: int, *, source_type: str = "ai") -> dict | None:
    """把模型输出的单个岗位洗成稳定结构；没有岗位名直接丢弃（占位数据不可用）。"""
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or "").strip()
    if not title:
        return None
    company = str(raw.get("company") or "").strip() or ("某企业" if source_type == "web" else "某公司")

    dims_raw = raw.get("dimensions") or {}
    dimensions: dict[str, dict] = {}
    for key in DIMENSION_WEIGHTS:
        item = dims_raw.get(key) if isinstance(dims_raw, dict) else None
        if isinstance(item, dict):
            score = _clamp_score(item.get("score"))
            reason = str(item.get("reason") or "").strip()[:200]
        elif isinstance(item, (int, float, str)):
            score, reason = _clamp_score(item), ""
        else:
            score, reason = 60, ""
        dimensions[key] = {"score": score, "reason": reason}

    url = str(raw.get("url") or "").strip()
    if url and not url.startswith(("http://", "https://")):
        url = ""

    return {
        "id": _job_id(title, company),
        "title": title[:60],
        "company": company[:60],
        "source": str(raw.get("source") or ("公开网络" if source_type == "web" else "AI 岗位画像"))[:30],
        "source_type": source_type,
        "channel": str(raw.get("channel") or "")[:40],
        "location": str(raw.get("location") or "未标注")[:40],
        "salary": str(raw.get("salary") or "面议")[:40],
        "job_type": str(raw.get("job_type") or "全职")[:10],
        "experience_required": str(raw.get("experience_required") or "不限")[:20],
        "education_required": str(raw.get("education_required") or "不限")[:20],
        "summary": str(raw.get("summary") or "").strip()[:300],
        "skills": _list_of_text(raw.get("skills"), limit=10, item_limit=30),
        "highlights": _list_of_text(raw.get("highlights"), limit=4, item_limit=80),
        "dimensions": dimensions,
        "match_rate": overall_score(dimensions),
        "match_reasons": _list_of_text(raw.get("match_reasons"), limit=4),
        "mismatches": _list_of_text(raw.get("mismatches"), limit=4),
        "suggestions": _list_of_text(raw.get("suggestions"), limit=4),
        "jd_text": str(raw.get("jd_text") or "").strip()[:1500],
        "url": url or None,
    }


def sanitize_result(
    raw: dict,
    profile: dict,
    *,
    mode: str,
    model: str = "",
    provider: str = "ai",
    job_count: int = DEFAULT_JOBS,
) -> dict:
    """清洗整份检索结果：去重、排序、裁剪、补统计与口径说明。"""
    raw = raw if isinstance(raw, dict) else {}
    jobs: list[dict] = []
    for idx, item in enumerate(raw.get("jobs") or []):
        job = sanitize_job(item, idx, source_type="web" if mode == "web" else "ai")
        if job:
            jobs.append(job)

    # 同标题同公司只留分最高的那条（模型偶尔把同一岗位写两遍）
    deduped: dict[tuple[str, str], dict] = {}
    for job in jobs:
        key = (job["title"].lower(), job["company"].lower())
        if key not in deduped or job["match_rate"] > deduped[key]["match_rate"]:
            deduped[key] = job
    jobs = sorted(deduped.values(), key=lambda j: j["match_rate"], reverse=True)
    jobs = jobs[: max(MIN_JOBS, min(job_count, MAX_JOBS))]

    if not jobs:
        raise ValueError("模型没有返回可用的岗位，请稍后重试")

    rates = [j["match_rate"] for j in jobs]
    return {
        "mode": mode,
        "mode_label": "公开网络检索" if mode == "web" else "AI 岗位画像",
        "notice": (
            "本结果来自公开招聘信息的实网检索，岗位链接原样保留；匹配分为系统按五维加权计算。"
            if mode == "web"
            else "未接入实时招聘接口，本结果由 AI 基于该简历的方向与公开招聘信息特征生成代表性岗位画像："
                 "公司名已匿名化、不提供外链，匹配分为系统按五维加权计算，可用于判断投递方向，不等同于真实在招岗位。"
        ),
        "provider": provider,
        "model": model,
        "generated_at": datetime.now(TZ_UTC8).isoformat(),
        "profile": profile,
        "market_summary": str(raw.get("market_summary") or "").strip()[:400],
        "search_keywords": _list_of_text(raw.get("search_keywords"), limit=8, item_limit=30),
        "total": len(jobs),
        "best_rate": max(rates),
        "avg_rate": round(sum(rates) / len(rates), 1),
        "strong_count": sum(1 for r in rates if r >= 80),
        "items": jobs,
    }


# ─────────────────────────────────────────────────────────────
# 检索通道
# ─────────────────────────────────────────────────────────────
def resolve_search_provider() -> str:
    """决定走实网检索还是 AI 画像：优先用户显式配置，auto 时看有没有 Key。"""
    pref = (getattr(settings, "JOB_SEARCH_PROVIDER", "auto") or "auto").strip().lower()
    tavily = bool(getattr(settings, "TAVILY_API_KEY", "") or "")
    serper = bool(getattr(settings, "SERPER_API_KEY", "") or "")
    if pref == "ai":
        return "ai"
    if pref == "tavily":
        return "tavily" if tavily else "ai"
    if pref == "serper":
        return "serper" if serper else "ai"
    if tavily:
        return "tavily"
    if serper:
        return "serper"
    return "ai"


def build_search_query(profile: dict, count: int = DEFAULT_JOBS) -> str:
    """拼一条自然语言检索式：城市 + 方向 + 招聘 + 核心技能。"""
    parts: list[str] = []
    cities = profile.get("cities") or []
    if cities:
        parts.append(str(cities[0]))
    titles = profile.get("target_titles") or []
    if titles:
        parts.append(str(titles[0]))
    parts.append("招聘")
    parts.extend([str(s) for s in (profile.get("skills") or [])[:3]])
    parts.append("岗位要求")
    return " ".join(parts)


async def _search_tavily(query: str, count: int) -> list[dict]:
    resp = await _http_post(
        "https://api.tavily.com/search",
        json={
            "api_key": settings.TAVILY_API_KEY,
            "query": query,
            "max_results": max(6, min(count * 2, 16)),
            "search_depth": "basic",
            "include_answer": False,
        },
    )
    results = resp.get("results") or []
    return [
        {
            "title": str(r.get("title") or ""),
            "url": str(r.get("url") or ""),
            "content": str(r.get("content") or ""),
        }
        for r in results
        if r.get("url")
    ]


async def _search_serper(query: str, count: int) -> list[dict]:
    resp = await _http_post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": settings.SERPER_API_KEY, "Content-Type": "application/json"},
        json={"q": f"{query} site:zhipin.com OR site:lagou.com OR site:liepin.com OR 招聘", "num": max(10, count * 2)},
    )
    results = resp.get("organic") or []
    return [
        {
            "title": str(r.get("title") or ""),
            "url": str(r.get("link") or ""),
            "content": str(r.get("snippet") or ""),
        }
        for r in results
        if r.get("link")
    ]


async def _http_post(url: str, **kwargs) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, **kwargs)
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, dict) else {}


# ─────────────────────────────────────────────────────────────
# LLM
# ─────────────────────────────────────────────────────────────
def _get_client() -> AsyncOpenAI:
    if not has_valid_api_key():
        raise ValueError(
            "LLM_API_KEY 未配置或未生效，无法检索岗位。请检查 backend/.env 中的 LLM_API_KEY。"
        )
    # max_retries=0：重试由本模块自己控制。SDK 默认内部重试 2 次，叠加上外层重试
    # 最坏会变成 6 次 × 240s 的等待（实测出现过任务卡 13 分钟不动）。
    return AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE, max_retries=0)


async def _chat_json(messages: list[dict], *, task: str, max_tokens: int = 6144,
                     temperature: float = 0.4) -> tuple[dict, str]:
    """调用模型并解析 JSON；返回 (解析结果, 实际使用的模型)。"""
    from app.core.llm_errors import is_retryable_error, wrap_llm_error
    from app.core.llm_policy import check_before_call, resolve_model

    model, note = resolve_model(settings.LLM_MODEL_TEXT)
    if note:
        logger.warning("[模型降级] %s", note)
    check_before_call(
        model, task, estimated_input_tokens=6000, estimated_output_tokens=max_tokens, retry_budget=2
    )

    client = _get_client()
    kwargs = dict(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=420.0,
    )

    last_err: Exception | None = None
    content = ""
    for attempt in range(2):
        try:
            resp = await client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content or ""
            break
        except Exception as e:  # noqa: BLE001
            last_err = e
            if "response_format" in str(e).lower() or "json_object" in str(e).lower():
                kwargs.pop("response_format", None)
                continue
            if attempt < 1 and is_retryable_error(e):
                continue
            raise wrap_llm_error(e, model) from e

    if not content.strip():
        raise ValueError("模型返回为空，可能是当前模型不支持结构化输出，请重试或更换模型")

    raw = _loads_json(content)
    if not isinstance(raw, dict):
        raise ValueError("模型返回格式异常，请重试")
    return raw, model


def _loads_json(content: str) -> dict:
    """兼容 ```json 包裹、前后闲聊、BOM 等常见脏输出。"""
    text = (content or "").strip().lstrip("\ufeff")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except json.JSONDecodeError:
            pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError("模型返回内容无法解析为 JSON，请重试")


async def _emit(on_progress: Progress, text: str) -> None:
    if on_progress:
        try:
            await on_progress(text)
        except Exception:  # noqa: BLE001 —— 进度写失败不能拖垮主流程
            logger.warning("[岗位检索] 进度回调失败：%s", text, exc_info=True)


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────
async def discover_jobs(
    parsed_resume: dict,
    *,
    job_count: int = DEFAULT_JOBS,
    city: str | None = None,
    direction: str | None = None,
    salary: str | None = None,
    industries: list[str] | None = None,
    on_progress: Progress = None,
) -> dict:
    """检索岗位并评分。异常直接抛出（API 层统一转中文可操作错误）。"""
    job_count = max(MIN_JOBS, min(int(job_count or DEFAULT_JOBS), MAX_JOBS))

    await _emit(on_progress, "正在提取简历画像…")
    profile = build_candidate_profile(
        parsed_resume, city=city, direction=direction, salary=salary, industries=industries
    )
    payload = profile_prompt_payload(profile)

    provider = resolve_search_provider()
    web_results: list[dict] = []
    fallback_note = ""

    if provider in ("tavily", "serper"):
        await _emit(on_progress, "正在检索公开招聘信息…")
        query = build_search_query(profile, job_count)
        try:
            if provider == "tavily":
                web_results = await _search_tavily(query, job_count)
            else:
                web_results = await _search_serper(query, job_count)
        except Exception as e:  # noqa: BLE001 —— 检索通道故障不应让整个功能不可用
            logger.warning("[岗位检索] %s 检索失败，回退 AI 画像：%s", provider, e)
            fallback_note = f"实网检索通道暂不可用（{type(e).__name__}），已回退到 AI 岗位画像。"

    if web_results:
        await _emit(on_progress, f"已获取 {len(web_results)} 条招聘信息，正在结构化…")
        prompt = WEB_JOB_STRUCTURING_PROMPT.format(
            profile_json=json.dumps(payload, ensure_ascii=False, indent=2),
            direction=direction or (profile["target_titles"] or ["不限"])[0],
            city=city or ("、".join(profile["cities"]) or "不限"),
            salary=salary or profile["salary_expectation"] or "不限",
            industries="、".join(industries or profile["industries"]) or "不限",
            search_results=json.dumps(web_results[:16], ensure_ascii=False, indent=2),
            job_count=job_count,
            scoring_rules=SCORING_RULES,
        )
        mode = "web"
    else:
        if provider != "ai" and not fallback_note:
            fallback_note = "实网检索没有拿到有效结果，已回退到 AI 岗位画像。"
        await _emit(on_progress, "正在检索匹配岗位…")
        prompt = JOB_DISCOVERY_SYSTEM_PROMPT.format(
            profile_json=json.dumps(payload, ensure_ascii=False, indent=2),
            direction=direction or (profile["target_titles"] or ["不限"])[0],
            city=city or ("、".join(profile["cities"]) or "不限"),
            salary=salary or profile["salary_expectation"] or "不限",
            industries="、".join(industries or profile["industries"]) or "不限",
            job_count=job_count,
            scoring_rules=SCORING_RULES,
        )
        mode = "ai"

    await _emit(on_progress, "正在按技能 / 经验 / 学历 / 地点 / 薪资评分…")
    raw, model = await _chat_json(
        [{"role": "user", "content": prompt}],
        task="AI 岗位检索",
        # 每个岗位（含 JD）约 800-900 token，按数量缩放；超过 8192 会被上游截断成坏 JSON
        max_tokens=min(8192, 1400 + job_count * 900),
        temperature=0.5 if mode == "ai" else 0.3,
    )

    await _emit(on_progress, "正在生成匹配理由与优化建议…")
    result = sanitize_result(
        raw, profile, mode=mode, model=model, provider=provider, job_count=job_count
    )
    if fallback_note:
        result["fallback_note"] = fallback_note
        result["notice"] = f"{fallback_note} {result['notice']}"
    return result
