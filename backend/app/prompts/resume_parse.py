RESUME_PARSE_SYSTEM_PROMPT = """你是一个简历解析器。请从以下简历文本中提取信息，返回JSON。

结构：
{
  "personal_info": {"name": "", "email": "", "phone": ""},
  "summary": "",
  "experience": [{"company": "", "title": "", "start": "", "end": "", "points": []}],
  "education": [{"school": "", "degree": "", "major": "", "start": "", "end": ""}],
  "skills": [],
  "projects": [{"name": "", "role": "", "start": "", "end": "", "points": []}]
}

说明：
- projects 与 experience 同构：name=项目名称，role=担任角色，start/end=起止时间，points=项目职责与成果要点（每条一句话，带量化数据）。
- 简历中若只有项目描述没有分点，也请拆成 points；不要把大段文字塞进单个字段。

请仅返回JSON，不要包含任何解释。"""

RESUME_PARSE_USER_PROMPT = "简历文本：\n{raw_text}"
