"""
将简历/岗位的 parsed_json 转为结构化可读文字，供用户个人中心展示。
"""


def format_resume_text(parsed_json: dict) -> str:
    """将简历解析结果转为可读文字。"""
    if not parsed_json:
        return ""

    sections: list[str] = []

    # 个人信息
    personal = parsed_json.get("personal_info") or {}
    if personal:
        lines = ["【个人信息】"]
        if personal.get("name"):
            lines.append(f"姓名: {personal['name']}")
        if personal.get("email"):
            lines.append(f"邮箱: {personal['email']}")
        if personal.get("phone"):
            lines.append(f"电话: {personal['phone']}")
        if personal.get("gender"):
            lines.append(f"性别: {personal['gender']}")
        if personal.get("age"):
            lines.append(f"年龄: {personal['age']}")
        if personal.get("location"):
            lines.append(f"所在地: {personal['location']}")
        if personal.get("website"):
            lines.append(f"个人网站: {personal['website']}")
        if personal.get("linkedin"):
            lines.append(f"LinkedIn: {personal['linkedin']}")
        sections.append("\n".join(lines))

    # 个人简介
    summary = parsed_json.get("summary") or ""
    if summary.strip():
        sections.append(f"【个人简介】\n{summary.strip()}")

    # 工作经历
    experience = parsed_json.get("experience") or []
    if experience:
        lines = ["【工作经历】"]
        for i, exp in enumerate(experience, 1):
            company = exp.get("company", "未知公司")
            title = exp.get("title", "未知职位")
            start = exp.get("start", "")
            end = exp.get("end", "至今")
            date_range = f"({start} - {end})" if start else ""
            lines.append(f"{i}. {company} - {title} {date_range}")
            for point in exp.get("points") or exp.get("responsibilities") or []:
                lines.append(f"   - {point}")
        sections.append("\n".join(lines))

    # 教育背景
    education = parsed_json.get("education") or []
    if education:
        lines = ["【教育背景】"]
        for i, edu in enumerate(education, 1):
            school = edu.get("school", "未知学校")
            degree = edu.get("degree", "")
            major = edu.get("major", "")
            start = edu.get("start", "")
            end = edu.get("end", "")
            date_range = f"({start} - {end})" if start else ""
            parts = [school]
            if degree:
                parts.append(degree)
            if major:
                parts.append(major)
            lines.append(f"{i}. {' - '.join(parts)} {date_range}")
        sections.append("\n".join(lines))

    # 技能
    skills = parsed_json.get("skills") or []
    if skills:
        sections.append(f"【技能】\n{', '.join(skills)}")

    # 项目经历
    projects = parsed_json.get("projects") or []
    if projects:
        lines = ["【项目经历】"]
        for i, proj in enumerate(projects, 1):
            name = proj.get("name", "未知项目")
            lines.append(f"{i}. {name}")
            if proj.get("description"):
                lines.append(f"   描述: {proj['description']}")
            if proj.get("tech"):
                lines.append(f"   技术栈: {', '.join(proj['tech'])}")
            for point in proj.get("points") or proj.get("responsibilities") or []:
                lines.append(f"   - {point}")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


def format_job_text(parsed_json: dict) -> str:
    """将岗位解析结果转为可读文字。"""
    if not parsed_json:
        return ""

    sections: list[str] = []

    # 岗位信息
    info_lines = ["【岗位信息】"]
    if parsed_json.get("title"):
        info_lines.append(f"岗位: {parsed_json['title']}")
    if parsed_json.get("company"):
        info_lines.append(f"公司: {parsed_json['company']}")
    if parsed_json.get("salary_range"):
        info_lines.append(f"薪资: {parsed_json['salary_range']}")
    if parsed_json.get("location"):
        info_lines.append(f"地点: {parsed_json['location']}")
    if parsed_json.get("industry"):
        info_lines.append(f"行业: {parsed_json['industry']}")
    if len(info_lines) > 1:
        sections.append("\n".join(info_lines))

    # 必备要求
    must_have = parsed_json.get("must_have") or {}
    if must_have:
        lines = ["【必备要求】"]
        for skill in must_have.get("skills") or []:
            lines.append(f"- {skill}")
        if must_have.get("experience"):
            lines.append(f"- 经验要求: {must_have['experience']}")
        if must_have.get("education"):
            lines.append(f"- 学历要求: {must_have['education']}")
        if len(lines) > 1:
            sections.append("\n".join(lines))

    # 加分项
    nice_to_have = parsed_json.get("nice_to_have") or {}
    if nice_to_have:
        lines = ["【加分技能】"]
        for skill in nice_to_have.get("skills") or []:
            lines.append(f"- {skill}")
        for qual in nice_to_have.get("qualifications") or []:
            lines.append(f"- {qual}")
        if len(lines) > 1:
            sections.append("\n".join(lines))

    # 岗位职责
    responsibilities = parsed_json.get("responsibilities") or []
    if responsibilities:
        lines = ["【岗位职责】"]
        for resp in responsibilities:
            lines.append(f"- {resp}")
        sections.append("\n".join(lines))

    # 软技能
    soft_skills = parsed_json.get("soft_skills") or []
    if soft_skills:
        lines = ["【软技能要求】"]
        for skill in soft_skills:
            lines.append(f"- {skill}")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)
