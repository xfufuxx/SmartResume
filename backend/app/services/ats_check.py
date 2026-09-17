"""ATS（ applicant tracking system ）预检：纯规则化检查，不调用任何 AI。

目标：在导出/投递前提示简历可能存在的「过不了 ATS 解析」或「信息不完整」问题，
给出可执行的修改建议。全部基于结构化 JSON，无需渲染原文件。
"""
import re

# 常见 ATS 不友好信号（仅作启发式提示）
_SUSPICIOUS_KEYWORDS = ["表格", "截图", "图片", "图标", "图表", "照片", "头像"]
_QUANT_RE = re.compile(r"\d")


def _section_present(data: dict, key: str) -> bool:
    val = data.get(key)
    if isinstance(val, list):
        return len(val) > 0
    return bool(val)


def _count_quantified(points: list) -> float:
    """经历要点中含有量化数字的比例（0-1）。"""
    if not points:
        return 0.0
    n = 0
    for p in points:
        if isinstance(p, str) and _QUANT_RE.search(p):
            n += 1
    return n / len(points)


def ats_check(resume_json: dict, job_json: dict | None = None) -> dict:
    """对简历 JSON 做 ATS 友好度预检。

    返回：
      {
        "score": int (0-100),
        "passed": bool,
        "issues": [ {level: "error"|"warn"|"info", message: str} ],
        "suggestions": [str],
        "keyword_coverage": { "covered": [...], "missing": [...] } | None
      }
    """
    data = resume_json or {}
    info = data.get("personal_info") or {}
    issues: list[dict] = []
    suggestions: list[str] = []

    # 1. 联系信息完整性
    missing_contact = [f for f in ("name", "phone", "email") if not info.get(f)]
    if missing_contact:
        issues.append({
            "level": "error",
            "message": f"缺少关键联系信息：{', '.join(missing_contact)}，ATS 无法定位候选人",
        })
        suggestions.append("补充姓名、手机号、邮箱等基础联系信息。")

    # 2. 必要板块完整性
    required_sections = {
        "summary": "个人总结",
        "experience": "工作经历",
        "education": "教育背景",
        "skills": "专业技能",
    }
    for key, label in required_sections.items():
        if not _section_present(data, key):
            issues.append({
                "level": "warn",
                "message": f"缺少「{label}」板块，ATS 关键词匹配度会下降",
            })
            suggestions.append(f"补充「{label}」板块以提升匹配度。")

    # 3. 量化经历比例
    exp_points = []
    for exp in (data.get("experience") or []):
        exp_points.extend(exp.get("points") or [])
    if exp_points:
        ratio = _count_quantified(exp_points)
        if ratio < 0.3:
            issues.append({
                "level": "warn",
                "message": f"仅有约 {int(ratio*100)}% 的工作经历要点包含量化结果，ATS 与HR更偏好数据化表达",
            })
            suggestions.append("为关键成就补充量化指标（如「提升 30% 效率」「服务 5 万+ 用户」）。")
    else:
        issues.append({
            "level": "warn",
            "message": "未检测到任何工作经历要点",
        })

    # 4. 关键词覆盖（若提供岗位 JD）
    keyword_coverage = None
    if job_json:
        jd_skills = job_json.get("skills") or []
        if isinstance(jd_skills, str):
            jd_skills = [s.strip() for s in re.split(r"[,，、/]", jd_skills) if s.strip()]
        resume_skill_text = " ".join(str(s) for s in (data.get("skills") or []))
        resume_blob = " ".join([
            resume_skill_text,
            (data.get("summary") or ""),
            " ".join(exp_points),
        ]).lower()
        covered, missing = [], []
        for s in jd_skills:
            s_lower = str(s).lower()
            (covered if s_lower in resume_blob else missing).append(str(s))
        keyword_coverage = {"covered": covered, "missing": missing}
        if missing:
            issues.append({
                "level": "info",
                "message": f"岗位要求的 {len(missing)} 项技能未在简历中体现：{', '.join(missing[:8])}",
            })
            suggestions.append("在技能或经历中体现岗位要求的缺失关键词（如确无，则谨慎补充）。")

    # 5. 文本长度提示
    full_text = " ".join(exp_points) + " " + (data.get("summary") or "")
    if len(full_text.strip()) < 200:
        issues.append({
            "level": "warn",
            "message": "简历内容偏短，可能被 ATS 判定为信息不足",
        })

    # 6. 排版风险（基于文本启发式，无法直接读渲染文件）
    blob = str(data)
    for kw in _SUSPICIOUS_KEYWORDS:
        if kw in blob:
            issues.append({
                "level": "info",
                "message": f"内容中提及「{kw}」，建议导出为单栏纯文本/标准排版以提升 ATS 通过率",
            })
            break

    # 计算分数：基准 100，每个 error -25，warn -10，info -5，下限 0
    score = 100
    for it in issues:
        if it["level"] == "error":
            score -= 25
        elif it["level"] == "warn":
            score -= 10
        else:
            score -= 5
    score = max(0, min(100, score))

    return {
        "score": score,
        "passed": score >= 70,
        "issues": issues,
        "suggestions": suggestions,
        "keyword_coverage": keyword_coverage,
    }
