"""关键词缺口分析（Keyword Gap）：对照 JD 找出简历缺失的关键词，按重要度排序。

纯规则实现，零 AI 调用：
- 关键词来源：job_json.skills 显式技能清单 + JD 正文词频启发式提取 +
  industry_keywords 词表（命中 JD 文本的才纳入）。
- 匹配：大小写不敏感 + 空格/连字符/下划线归一化后的子串匹配。
- 重要度：显式技能 / 行业 hard_skill / JD 高频词 → high；行业词表 / 中频 → medium；其余 low。
"""
import re

# 拉丁系技术词（Python、K8s、C++、Node.js 等）：长度≥2，允许 + # . - 后缀字符
_LATIN_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}")
_SPLIT_RE = re.compile(r"[,，、/;；|]")

#  JD 正文中常见的非关键词噪音（动词、虚词类），词频提取时过滤
_STOPWORDS = {
    "the", "and", "for", "with", "you", "are", "our", "your", "will", "who",
    "job", "work", "team", "ability", "experience", "responsible", "familiar",
}


def _norm(s: str) -> str:
    """归一化：小写 + 去空格/连字符/下划线，用于宽松匹配（Node.js ≈ nodejs）。"""
    return re.sub(r"[\s\-_.]+", "", str(s).lower())


def _split_terms(val) -> list[str]:
    """技能字段兼容 list 与分隔符字符串两种形态。"""
    if isinstance(val, str):
        return [s.strip() for s in _SPLIT_RE.split(val) if s.strip()]
    if isinstance(val, list):
        return [str(s).strip() for s in val if str(s).strip()]
    return []


def _jd_text(job_json: dict) -> str:
    parts = []
    for key in ("description", "responsibilities", "requirements", "duty", "jd", "content"):
        val = job_json.get(key)
        if isinstance(val, str):
            parts.append(val)
        elif isinstance(val, list):
            parts.extend(str(x) for x in val)
    return "\n".join(parts)


def _resume_blob(resume_json: dict) -> str:
    """简历全文（归一化后），用于关键词命中判断。"""
    data = resume_json or {}
    parts = [
        " ".join(_split_terms(data.get("skills"))),
        str(data.get("summary") or ""),
    ]
    for exp in data.get("experience") or []:
        if isinstance(exp, dict):
            parts.extend(str(p) for p in (exp.get("points") or exp.get("details") or []))
            parts.append(str(exp.get("title") or ""))
    for proj in data.get("projects") or []:
        if isinstance(proj, dict):
            parts.append(str(proj.get("description") or ""))
            parts.extend(_split_terms(proj.get("tech")))
    return _norm(" ".join(parts))


def extract_jd_keywords(job_json: dict, db_keywords: list[tuple[str, str]] | None = None) -> list[dict]:
    """从 JD 提取候选关键词并标注来源/频次/类别。

    db_keywords: industry_keywords 表的 [(keyword, category), ...]，仅纳入命中 JD 文本的。
    返回 [{keyword, freq, source, category}]，按重要度降序。
    """
    job_json = job_json or {}
    text = _jd_text(job_json)
    text_norm = _norm(text)

    candidates: dict[str, dict] = {}

    # 1. 显式技能清单（权重最高）
    for s in _split_terms(job_json.get("skills")):
        key = _norm(s)
        if key:
            candidates[key] = {"keyword": s, "freq": 99, "source": "jd", "category": "hard_skill"}

    # 2. JD 正文拉丁词频提取（频次 ≥2 才纳入，过滤噪音词）
    freq: dict[str, int] = {}
    for token in _LATIN_TOKEN_RE.findall(text):
        t = token.strip(".-")
        if len(t) < 2 or t.lower() in _STOPWORDS:
            continue
        freq[t] = freq.get(t, 0) + 1
    for token, n in freq.items():
        if n < 2:
            continue
        key = _norm(token)
        if key in candidates:
            continue
        candidates[key] = {"keyword": token, "freq": n, "source": "jd", "category": "hard_skill"}

    # 3. 行业词表：只纳入在 JD 文本中确实出现的（含中文词）
    for kw, category in db_keywords or []:
        key = _norm(kw)
        if not key or key in candidates:
            continue
        if key in text_norm or key in _norm(" ".join(_split_terms(job_json.get("skills")))):
            candidates[key] = {"keyword": kw, "freq": 1, "source": "industry", "category": category or "hard_skill"}

    def _rank(c: dict) -> int:
        if c["source"] == "jd" and c["freq"] >= 99:
            return 3  # 显式技能
        if c["source"] == "industry" and c["category"] == "hard_skill":
            return 3
        if c["freq"] >= 3:
            return 3
        if c["source"] == "industry" or c["freq"] >= 2:
            return 2
        return 1

    return sorted(candidates.values(), key=lambda c: (-_rank(c), -c["freq"], c["keyword"]))


def _suggest_section(category: str) -> str:
    return {"hard_skill": "skills", "soft_skill": "summary"}.get(category, "experience")


def analyze_keyword_gap(
    resume_json: dict,
    job_json: dict,
    db_keywords: list[tuple[str, str]] | None = None,
) -> dict:
    """对照 JD 分析简历关键词覆盖情况。

    返回 {matched, gaps, coverage_rate}；gaps 按重要度降序，
    每项含 importance(high/medium/low)、source(jd/industry)、suggest_section。
    """
    candidates = extract_jd_keywords(job_json, db_keywords)
    blob = _resume_blob(resume_json)

    matched, gaps = [], []
    for c in candidates:
        if _norm(c["keyword"]) in blob:
            matched.append(c["keyword"])
            continue
        rank = 3 if (c["source"] == "jd" and c["freq"] >= 99) or c["freq"] >= 3 or (
            c["source"] == "industry" and c["category"] == "hard_skill"
        ) else (2 if c["source"] == "industry" or c["freq"] >= 2 else 1)
        gaps.append({
            "keyword": c["keyword"],
            "importance": {3: "high", 2: "medium", 1: "low"}[rank],
            "source": c["source"],
            "suggest_section": _suggest_section(c["category"]),
        })

    total = len(candidates)
    return {
        "matched": matched,
        "gaps": gaps,
        "coverage_rate": round(len(matched) / total, 4) if total else None,
        "total_keywords": total,
    }
