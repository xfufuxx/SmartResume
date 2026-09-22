"""平台引导投递「一键准备包」服务（阶段4：通道 C）。

职责与合规边界（零合规风险通道）：
- build_guide_pack：识别岗位来源平台（BOSS直聘/智联/前程无忧/猎聘/拉勾/LinkedIn），
  优先使用 JD 内出现的平台岗位链接作为深链，否则退化为「平台搜索页 + 岗位关键词」
  深链。**只生成链接，绝不代替用户投递**——最后一步「发送」由用户在官方平台完成。
- resume_plain_text：把简历 parsed_json 渲染成可直接粘贴到招聘平台输入框的纯文本。

不做的事（红线）：
- 不逆向平台接口、不模拟登录态、不自动提交——坚决不做（封号 + 法律风险）。
"""
import re
from urllib.parse import quote_plus

# 已知招聘平台：key → (展示名, 域名特征, 搜索深链模板)
# 搜索模板用 {kw} 占位（quote_plus 转义后填充）；仅用官方公开搜索页，非逆向接口。
PLATFORMS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "boss": (
        "BOSS直聘",
        ("zhipin.com",),
        "https://www.zhipin.com/web/geek/job?query={kw}",
    ),
    "zhilian": (
        "智联招聘",
        ("zhaopin.com",),
        "https://sou.zhaopin.com/?kw={kw}",
    ),
    "51job": (
        "前程无忧",
        ("51job.com",),
        "https://we.51job.com/pc/search?jobArea=000000&keyword={kw}",
    ),
    "liepin": (
        "猎聘",
        ("liepin.com",),
        "https://www.liepin.com/zhaopin/?key={kw}",
    ),
    "lagou": (
        "拉勾招聘",
        ("lagou.com",),
        "https://www.lagou.com/wn/jobs?pn=1&kd={kw}",
    ),
    "linkedin": (
        "LinkedIn",
        ("linkedin.com",),
        "https://www.linkedin.com/jobs/search/?keywords={kw}",
    ),
}

# 平台名常见写法（JD 文本里可能写「boss直聘」「BOSS」「智联」等）
_PLATFORM_NAME_HINTS: dict[str, tuple[str, ...]] = {
    "boss": ("boss直聘", "boss直歵", "boss直", "zhipin"),
    "zhilian": ("智联", "zhaopin"),
    "51job": ("前程无忧", "51job", "51job"),
    "liepin": ("猎聘", "liepin"),
    "lagou": ("拉勾", "拉钩", "lagou"),
    "linkedin": ("领英", "linkedin"),
}

_URL_RE = re.compile(r"https?://[^\s<>'\"（）()，,。；;]+", re.IGNORECASE)


def detect_platform(parsed_job_json: dict | None, ocr_text: str | None) -> str | None:
    """从岗位解析 JSON / OCR 文本识别招聘平台；识别不出返回 None。"""
    texts: list[str] = []
    for source in (parsed_job_json or {}, ocr_text or ""):
        vals = list(source.values()) if isinstance(source, dict) else [source]
        texts.extend(v for v in vals if isinstance(v, str))
    blob = "\n".join(texts).lower()
    if not blob:
        return None
    for key, hints in _PLATFORM_NAME_HINTS.items():
        if any(h in blob for h in hints):
            return key
    return None


def _platform_of_url(url: str) -> str | None:
    low = url.lower()
    for key, (_, domains, _) in PLATFORMS.items():
        if any(d in low for d in domains):
            return key
    return None


def _search_deep_link(key: str, title: str | None, company: str | None) -> str:
    kw = " ".join(x for x in (title or "", company or "") if x) or "职位"
    return PLATFORMS[key][2].format(kw=quote_plus(kw))


def build_guide_pack(
    parsed_job_json: dict | None,
    ocr_text: str | None,
    title: str | None = None,
    company: str | None = None,
) -> dict:
    """构建一键准备包的平台引导信息。

    深链优先级：
    1. JD 文本中出现的已知平台岗位/职位页链接（link_source="job_url"）；
    2. 平台名识别 → 官方搜索页 + 岗位关键词（link_source="platform_search"）；
    3. 兜底 BOSS直聘搜索（国内主流）。
    """
    candidates: list[str] = []
    for source in (parsed_job_json or {}, ocr_text or ""):
        vals = list(source.values()) if isinstance(source, dict) else [source]
        for t in vals:
            if isinstance(t, str):
                candidates.extend(_URL_RE.findall(t))

    for c in candidates:
        c = c.rstrip(".,;，。；）)")
        key = _platform_of_url(c)
        if key:
            return {
                "platform_key": key,
                "platform_name": PLATFORMS[key][0],
                "deep_link": c,
                "link_source": "job_url",
            }

    key = detect_platform(parsed_job_json, ocr_text) or "boss"
    return {
        "platform_key": key,
        "platform_name": PLATFORMS[key][0],
        "deep_link": _search_deep_link(key, title, company),
        "link_source": "platform_search",
    }


def resume_plain_text(parsed_json: dict | None, raw_text: str | None = None, title: str | None = None) -> str:
    """把简历渲染为「可粘贴到平台 App/网页输入框」的纯文本。

    优先用 parsed_json 结构化渲染（姓名/联系方式/总结/经历/教育/技能/项目），
    结构缺失时回退 raw_text 原文（截断到 8000 字防粘贴爆炸）。
    """
    data = parsed_json or {}
    lines: list[str] = []

    pi = data.get("personal_info") or {}
    if isinstance(pi, dict):
        name = pi.get("name") or ""
        contact = " | ".join(
            str(pi[k]) for k in ("phone", "email", "location", "linkedin", "github") if pi.get(k)
        )
        head = " ".join(x for x in (name, title or "") if x)
        if head:
            lines.append(head)
        if contact:
            lines.append(contact)
    if data.get("summary"):
        lines += ["", "【个人总结】", str(data["summary"])]

    experience = data.get("experience") or []
    if isinstance(experience, list) and experience:
        lines += ["", "【工作经历】"]
        for exp in experience:
            if not isinstance(exp, dict):
                continue
            head = " · ".join(x for x in (exp.get("title"), exp.get("company")) if x)
            period = " - ".join(x for x in (exp.get("start"), exp.get("end")) if x)
            if head:
                lines.append(period and f"{head}（{period}）" or head)
            for p in (exp.get("points") or []):
                if p:
                    lines.append(f"• {p}")

    education = data.get("education") or []
    if isinstance(education, list) and education:
        lines += ["", "【教育背景】"]
        for edu in education:
            if not isinstance(edu, dict):
                continue
            parts = [edu.get("school"), " - ".join(x for x in (edu.get("degree"), edu.get("major")) if x)]
            head = " ".join(x for x in parts if x)
            period = " - ".join(x for x in (edu.get("start"), edu.get("end")) if x)
            if head:
                lines.append(period and f"{head}（{period}）" or head)

    skills = data.get("skills") or []
    if isinstance(skills, list) and skills:
        lines += ["", "【技能】", "、".join(str(s) for s in skills if s)]

    projects = data.get("projects") or []
    if isinstance(projects, list) and projects:
        lines += ["", "【项目经历】"]
        for proj in projects:
            if not isinstance(proj, dict):
                continue
            if proj.get("name"):
                lines.append(str(proj["name"]))
            if proj.get("description"):
                lines.append(str(proj["description"]))
            if proj.get("tech"):
                lines.append("技术栈：" + "、".join(str(t) for t in proj["tech"] if t))

    text = "\n".join(x for x in lines if x).strip()
    if not text:
        text = (raw_text or "").strip()[:8000]
    return text[:8000]
