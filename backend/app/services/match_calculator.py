import json
from app.services.scoring_engine import _extract_job_keywords, _extract_resume_keywords


async def calculate_match(resume_parsed: dict, job_parsed: dict) -> dict:
    """
    岗位匹配度计算（无需AI调用，纯规则引擎）：
    匹配度 = (交集大小 / JD技能词总数) * 0.7 + (量化成果存在性) * 0.3
    """
    job_keywords = _extract_job_keywords(job_parsed)
    resume_keywords = _extract_resume_keywords(resume_parsed)

    if not job_keywords:
        return {"match_rate": 50, "missing_keywords": []}

    job_kw_set = {kw.lower() for kw in job_keywords}
    resume_kw_set = {kw.lower() for kw in resume_keywords}

    matched = job_kw_set & resume_kw_set
    keyword_score = (len(matched) / len(job_kw_set)) * 0.7

    has_quantification = _check_quantification(resume_parsed)
    quantification_score = 0.3 if has_quantification else 0.0

    match_rate = int((keyword_score + quantification_score) * 100)

    missing_keywords = sorted(list(job_kw_set - resume_kw_set))

    return {
        "match_rate": min(match_rate, 100),
        "missing_keywords": missing_keywords[:10],
    }


def _check_quantification(resume: dict) -> bool:
    import re
    experience = resume.get("experience", []) or []
    projects = resume.get("projects", []) or []

    all_text_parts: list[str] = []
    for exp in experience:
        all_text_parts.extend(exp.get("points", []) or [])
        all_text_parts.append(exp.get("description", "") or "")
    for proj in projects:
        all_text_parts.append(proj.get("description", "") or "")

    all_text = " ".join(all_text_parts)
    patterns = [
        r'\d+%', r'\d+倍', r'\d+万', r'\d+亿',
        r'提升\d+', r'降低\d+', r'增长\d+', r'节省\d+',
    ]
    for pat in patterns:
        if re.search(pat, all_text):
            return True
    return False