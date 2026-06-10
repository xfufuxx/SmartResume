import re
import json
from collections import Counter


async def calculate_score(resume_parsed: dict, job_parsed: dict | None = None) -> dict:
    """
    计算简历评分，四个维度：
    - completeness: 必填字段是否缺失
    - keyword_match: 与JD关键词匹配度
    - quantification: 量化成果密度（每段经历是否包含数字）
    - format_readability: 排版清晰度
    """
    suggestions: list[str] = []

    completeness = _score_completeness(resume_parsed, suggestions)
    keyword_match = _score_keyword_match(resume_parsed, job_parsed, suggestions) if job_parsed else 50
    quantification = _score_quantification(resume_parsed, suggestions)
    format_readability = _score_format_readability(resume_parsed, suggestions)

    total = int(
        completeness * 0.30
        + keyword_match * 0.35
        + quantification * 0.20
        + format_readability * 0.15
    )

    return {
        "total_score": min(total, 100),
        "dimensions": {
            "completeness": completeness,
            "keyword_match": keyword_match,
            "quantification": quantification,
            "format_readability": format_readability,
        },
        "suggestions": suggestions,
    }


def _score_completeness(resume: dict, suggestions: list[str]) -> int:
    score = 100
    required_fields = {
        "personal_info.name": 15,
        "personal_info.email": 10,
        "personal_info.phone": 10,
        "experience": 25,
        "education": 10,
        "skills": 15,
        "summary": 10,
        "projects": 5,
    }

    for path, weight in required_fields.items():
        parts = path.split(".")
        val = resume
        for p in parts:
            if isinstance(val, dict):
                val = val.get(p)
            else:
                val = None
                break
        if not val or (isinstance(val, (list, str)) and len(val) == 0):
            score -= weight
            field_name = path.replace("_", " ").replace(".", " > ")
            suggestions.append(f"缺少「{field_name}」信息，建议补充")

    return max(score, 10)


def _score_keyword_match(resume: dict, job: dict | None, suggestions: list[str]) -> int:
    if not job:
        return 50

    job_keywords = _extract_job_keywords(job)
    resume_keywords = _extract_resume_keywords(resume)

    if not job_keywords:
        return 50

    matched = [kw for kw in job_keywords if kw.lower() in (rk.lower() for rk in resume_keywords)]
    missing = [kw for kw in job_keywords if kw.lower() not in (rk.lower() for rk in resume_keywords)]

    score = int((len(matched) / len(job_keywords)) * 100)

    for kw in missing[:5]:
        jd_count = _count_in_job(job, kw)
        suggestions.append(f"缺少「{kw}」关键词，JD中要求{jd_count}次")

    return min(score, 100)


def _score_quantification(resume: dict, suggestions: list[str]) -> int:
    experiences = resume.get("experience", []) or []
    projects = resume.get("projects", []) or []

    total_sections = len(experiences) + len(projects)
    if total_sections == 0:
        suggestions.append("缺少工作经历或项目描述，无法评估量化密度")
        return 30

    quantified_count = 0
    for exp in experiences:
        points = exp.get("points", []) or []
        description = exp.get("description", "") or ""
        all_text = " ".join(points) + " " + description
        if _has_quantification(all_text):
            quantified_count += 1
        else:
            company = exp.get("company", exp.get("title", "某公司"))
            suggestions.append(f"增加「{company}」工作经历的量化结果，如'提升效率30%'")

    for proj in projects:
        desc = proj.get("description", "") or ""
        all_text = " ".join(proj.get("tech", []) or []) + " " + desc
        if _has_quantification(all_text):
            quantified_count += 1
        else:
            name = proj.get("name", "某项目")
            suggestions.append(f"增加「{name}」项目的量化成果")

    score = int((quantified_count / total_sections) * 100) if total_sections > 0 else 0
    return min(score, 100)


def _score_format_readability(resume: dict, suggestions: list[str]) -> int:
    score = 100
    raw_text = resume.get("raw_text", "") or ""
    parsed_json = resume.get("parsed_json", resume)

    experience = parsed_json.get("experience", []) or []
    for exp in experience:
        points = exp.get("points", []) or []
        if len(points) > 8:
            score -= 10
            suggestions.append(f"「{exp.get('company', exp.get('title', '某公司'))}」的工作描述过于冗长（{len(points)}条），建议精简到5-6条")

    if parsed_json.get("skills", []) and len(parsed_json.get("skills", [])) > 15:
        score -= 5
        suggestions.append("技能列表过长，建议只保留与目标岗位相关的10-15项核心技能")

    if raw_text and _has_table_or_column_format(raw_text):
        score -= 15
        suggestions.append("检测到表格或分栏格式，建议使用标准单栏排版以确保ATS解析兼容")

    return max(score, 30)


def _extract_job_keywords(job: dict) -> list[str]:
    keywords: set[str] = set()
    must_have = job.get("must_have", {}) or {}
    nice_to_have = job.get("nice_to_have", {}) or {}

    for skill in must_have.get("skills", []):
        keywords.add(skill.lower().strip())
    for skill in nice_to_have.get("skills", []):
        keywords.add(skill.lower().strip())
    for qual in nice_to_have.get("qualifications", []):
        keywords.add(qual.lower().strip())

    responsibilities = job.get("responsibilities", []) or []
    for resp in responsibilities:
        for tech_term in _extract_tech_terms(resp):
            keywords.add(tech_term.lower())

    soft_skills = job.get("soft_skills", []) or []
    for ss in soft_skills:
        keywords.add(ss.lower().strip())

    return list(keywords)


def _extract_resume_keywords(resume: dict) -> list[str]:
    keywords: set[str] = set()

    skills = resume.get("skills", []) or []
    for s in skills:
        keywords.add(s.lower().strip())

    summary = resume.get("summary", "") or ""
    for tech_term in _extract_tech_terms(summary):
        keywords.add(tech_term.lower())

    experience = resume.get("experience", []) or []
    for exp in experience:
        for point in exp.get("points", []):
            for tech_term in _extract_tech_terms(point):
                keywords.add(tech_term.lower())
        title = exp.get("title", "") or ""
        for word in title.split():
            if len(word) > 2:
                keywords.add(word.lower().strip(","))

    projects = resume.get("projects", []) or []
    for proj in projects:
        for tech in proj.get("tech", []):
            keywords.add(tech.lower().strip())
        desc = proj.get("description", "") or ""
        for tech_term in _extract_tech_terms(desc):
            keywords.add(tech_term.lower())

    return list(keywords)


COMMON_TECH = {
    "python", "java", "javascript", "typescript", "go", "rust", "c++", "c#", "ruby", "php", "swift", "kotlin",
    "react", "vue", "angular", "node.js", "express", "fastapi", "django", "flask", "spring", "next.js",
    "docker", "kubernetes", "k8s", "jenkins", "gitlab", "github", "terraform", "ansible",
    "aws", "azure", "gcp", "阿里云", "腾讯云",
    "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "kafka", "rabbitmq",
    "graphql", "restful", "grpc", "websocket",
    "机器学习", "深度学习", "nlp", "cv", "tensorflow", "pytorch", "llm",
    "微服务", "分布式", "高并发", "性能优化", "agile", "scrum",
}


def _extract_tech_terms(text: str) -> set[str]:
    found: set[str] = set()
    text_lower = text.lower()
    for term in COMMON_TECH:
        term_lower = term.lower()
        if term_lower in text_lower or term in text:
            found.add(term_lower)
    return found


def _count_in_job(job: dict, keyword: str) -> int:
    job_str = json.dumps(job, ensure_ascii=False).lower()
    return job_str.count(keyword.lower())


def _has_quantification(text: str) -> bool:
    patterns = [
        r'\d+%', r'\d+倍', r'\d+万', r'\d+亿', r'\d+人',
        r'\d+个', r'\d+次', r'\d+天', r'\d+月', r'\d+年',
        r'提升\d+', r'降低\d+', r'增长\d+', r'节省\d+',
        r'\d+k', r'\d+\.?\d*%',
    ]
    for pat in patterns:
        if re.search(pat, text):
            return True
    return False


def _has_table_or_column_format(text: str) -> bool:
    if re.search(r'\t{2,}', text):
        return True
    lines = text.split('\n')
    pipe_lines = sum(1 for l in lines if l.strip().startswith('|'))
    if pipe_lines >= 3:
        return True
    return False