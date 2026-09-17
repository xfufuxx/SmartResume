"""简历分析聚合接口：为「AI 简历优化」主页面一次算全所需指标。

设计动机：
- 优化页需要「职位匹配度 / 关键词匹配 / AI 优化建议 / 简历分析(ATS·关键词密度·可读性·影响力)」
  四块真实数据，且要能对「原始简历」和「AI 优化后简历」分别计算以展示环比提升。
- 这些能力后端已存在（match_calculator / scoring_engine / ats_check），
  但此前分散在 /api/match（需落库的 resume_id）、/api/resume/{id}/score（需落库）、
  /api/ats/check（只返回 ATS 分）三个接口里，且都拿不到「尚未落库的优化后 JSON」的评分。
- 因此这里做一个纯函数聚合端点：入参是简历 JSON（可为任意来源）与可选岗位 JSON，
  不落库、不调用 AI、不消耗额度，可放心反复调用。
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.user import User
from app.services.ats_check import ats_check
from app.services.match_calculator import calculate_match
from app.services.scoring_engine import (
    _extract_job_keywords,
    _extract_resume_keywords,
    calculate_score,
)

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


class AnalysisRequest(BaseModel):
    resume_json: dict
    job_json: Optional[dict] = None


# ── 建议归类：把后端零散的建议文案映射成设计图要求的「标题 + 说明」卡片 ──
# 顺序敏感：先匹配更具体的「排版 / 量化 / 关键词」，最后才落到泛化的「补充信息」。
_SUGGESTION_RULES: list[tuple[tuple[str, ...], str, str]] = [
    (("排版", "表格", "分栏", "单栏", "冗长", "精简", "过长"), "调整简历格式", "收敛版式与篇幅，提升 ATS 解析与可读性"),
    (("量化", "数据化"), "增强项目成果描述", "量化工作成果，用数据体现你的影响力与产出"),
    (("关键词",), "优化技能关键词", "补齐岗位描述中出现、但简历尚未体现的关键词"),
    (("个人总结", "summary", "简介", "亮点", "优势", "技能中体现"), "完善个人亮点", "突出核心竞争力与岗位匹配度更高的一面"),
    (("缺少", "补充", "信息"), "完善简历信息", "补齐缺失的必填信息，让简历更完整可信"),
]

_DEFAULT_SUGGESTION = ("完善简历细节", "补齐缺失信息，让简历信息更完整可信")


def _classify_suggestion(text: str) -> tuple[str, str]:
    for keys, title, desc in _SUGGESTION_RULES:
        if any(k in text for k in keys):
            return title, desc
    return _DEFAULT_SUGGESTION


def _build_suggestions(*groups: list[str]) -> list[dict]:
    """合并多组建议文案，按「标题」去重，保留每组首条原文作为细节说明。"""
    seen: dict[str, dict] = {}
    for group in groups:
        for raw in group or []:
            if not isinstance(raw, str) or not raw.strip():
                continue
            text = raw.strip()
            title, desc = _classify_suggestion(text)
            if title in seen:
                if len(seen[title]["detail"]) < 60:
                    seen[title]["detail"] = text
                continue
            seen[title] = {"title": title, "desc": desc, "detail": text}
    return list(seen.values())


def _norm_keywords(items: Any) -> list[str]:
    """关键词归一化：去空、去重、保持原始大小写顺序。"""
    out: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        if item is None:
            continue
        text = str(item).strip()
        if not text:
            continue
        low = text.lower()
        if low in seen:
            continue
        seen.add(low)
        out.append(text)
    return out


@router.post("/resume", summary="简历分析（匹配度 / 关键词 / ATS / 四维指标 / 建议）")
async def analyze_resume(
    body: AnalysisRequest,
    user: User = Depends(get_current_user),
):
    """对任意简历 JSON（+ 可选岗位 JSON）做规则化分析，无需落库、不消耗 AI 额度。

    返回：
      match_rate / matched_keywords / missing_keywords / job_keywords
      dimensions: { ats_score, keyword_density, readability, impact, keyword_match }
      total_score / ats / suggestions
    """
    resume_json: dict = body.resume_json or {}
    job_json: dict | None = body.job_json or None

    # 1) 关键词：岗位词表（must_have + nice_to_have + 技术词）与简历词表求交集
    job_keywords = _norm_keywords(_extract_job_keywords(job_json)) if job_json else []
    resume_keywords = set(_norm_keywords(_extract_resume_keywords(resume_json)))
    matched: list[str] = []
    missing: list[str] = []
    for kw in job_keywords:
        (matched if kw.lower() in resume_keywords else missing).append(kw)

    # 2) 岗位技能标签：用于前端「关键词匹配」芯片（技能优先，语义更直观）
    must_have = (job_json or {}).get("must_have") or {}
    nice_to_have = (job_json or {}).get("nice_to_have") or {}
    if isinstance(must_have, str):
        must_have = {"skills": [must_have]}
    if isinstance(nice_to_have, str):
        nice_to_have = {"skills": [nice_to_have]}
    skill_tags = _norm_keywords(
        list(must_have.get("skills") or []) + list(nice_to_have.get("skills") or [])
    )

    # 3) 匹配度（与 /api/match 同一套规则引擎，保证口径一致）
    if job_json:
        match_result = await calculate_match(resume_json, job_json)
        match_rate = int(match_result.get("match_rate", 0))
    else:
        match_rate = 0

    # 4) 四维评分（与 /api/resume/{id}/score 同一套引擎）
    score_data = await calculate_score(resume_json, job_json)
    dims = score_data.get("dimensions", {})

    # 5) ATS 友好度：把岗位技能拍平成顶层 skills，让 ats_check 的关键词覆盖生效
    job_for_ats = None
    if job_json:
        job_for_ats = dict(job_json)
        job_for_ats["skills"] = skill_tags or list(job_json.get("skills") or [])
    ats_result = ats_check(resume_json, job_for_ats)

    # 6) 关键词密度：岗位明确要求的技能在简历中的覆盖率
    #    优先用 JD 技能标签（与前端「关键词匹配」芯片同一集合，保证两个数字自洽），
    #    没有技能标签时退化为岗位全量关键词，再退化为引擎的关键词维度。
    density_source = skill_tags or job_keywords
    matched_lower = {k.lower() for k in matched}
    if density_source:
        covered = sum(1 for t in density_source if t.lower() in matched_lower)
        keyword_density = int(round(covered / len(density_source) * 100))
    else:
        keyword_density = int(dims.get("keyword_match", 0))

    return {
        "match_rate": match_rate,
        "job_keywords": job_keywords,
        "skill_tags": skill_tags,
        "matched_keywords": matched,
        "missing_keywords": missing,
        "dimensions": {
            "ats_score": int(ats_result.get("score", 0)),
            # 关键词密度：百分比（0-100）
            "keyword_density": max(0, min(100, keyword_density)),
            # 关键词匹配：引擎口径（0-100）
            "keyword_match": int(dims.get("keyword_match", 0)),
            # 可读性 / 影响力：0-10 分，与设计图「8.2 分」一致
            "readability": round(int(dims.get("format_readability", 0)) / 10, 1),
            "impact": round(int(dims.get("quantification", 0)) / 10, 1),
        },
        "total_score": int(score_data.get("total_score", 0)),
        "ats": {
            "score": int(ats_result.get("score", 0)),
            "passed": bool(ats_result.get("passed", False)),
            "issues": ats_result.get("issues", []),
        },
        "suggestions": _build_suggestions(
            ats_result.get("suggestions") or [],
            score_data.get("suggestions") or [],
        ),
    }
