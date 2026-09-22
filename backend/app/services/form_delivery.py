"""官网表单半自动投递服务（阶段3：通道 B）。

职责与合规边界（见 docs/官网表单投递合规核查清单.md）：
- probe_form_page：只读探测 careers/ATS 页面——robots.txt 核查 + 投递表单结构识别
  （姓名/邮箱/电话/附言/简历附件字段定位器）。**不提交任何数据**。
- prefill_on_page：在已打开的 Playwright Page 上按探测结果预填字段（含简历附件
  上传），**绝不点击提交按钮**——提交必须由用户亲眼确认后手动完成。
- detect_apply_url：从 JD 解析文本中正则探测官网投递入口（用户可在弹窗中修改）。

可测试性设计：prefill_on_page 接收任意 Page-like 对象，回归脚本用 headless
浏览器 + 本地测试表单页即可端到端断言「字段已填、附件已传、未触发提交」。
"""
import logging
import re
from dataclasses import dataclass, field as dc_field
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import requests

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
FETCH_TIMEOUT = 15

# JD 文本中常见的官网投递入口特征（正则探测，用户可人工纠正）
_APPLY_URL_RE = re.compile(
    r"https?://[^\s<>'\"（）()，,。；;]+",
    re.IGNORECASE,
)
_APPLY_URL_KEYWORDS = (
    "career", "careers", "job", "jobs", "apply", "recruit", "zhaopin",
    "mokahr", "talent", "hire", "hr", "campus", "position", "应聘", "招聘",
)
# 明显不是投递入口的链接
_APPLY_URL_EXCLUDE = (
    "javascript:", "mailto:", "#", "privacy", "about", "blog", "login",
    "register", "terms", "beian", ".png", ".jpg", ".jpeg", ".gif", ".css", ".js",
)


def is_valid_url(url: str | None) -> bool:
    return bool(url and re.match(r"^https?://", url.strip(), re.IGNORECASE))


def detect_apply_url(parsed_job_json: dict | None, ocr_text: str | None) -> str | None:
    """从岗位解析 JSON / OCR 文本中探测官网投递链接；找不到返回 None。

    命中含招聘特征的 URL 才返回（用户可确认/修改）；多命中取第一个。
    """
    candidates: list[str] = []
    for source in (parsed_job_json or {}, ocr_text or ""):
        texts = list(source.values()) if isinstance(source, dict) else [source]
        for t in texts:
            if isinstance(t, str):
                candidates.extend(_APPLY_URL_RE.findall(t))
    for c in candidates:
        c = c.rstrip(".,;，。；")
        low = c.lower()
        if any(k in low for k in _APPLY_URL_EXCLUDE):
            continue
        if any(k in low for k in _APPLY_URL_KEYWORDS):
            return c
    return None


# ── robots.txt 核查 ──

def check_robots_allowed(url: str, timeout: int = FETCH_TIMEOUT) -> tuple[bool, str]:
    """核查目标 URL 是否被该站点 robots.txt 允许抓取（以 SmartResumeBot 身份，回退 *）。

    返回 (allowed, detail)。robots.txt 不存在/不可达视为允许（无明确禁止）。
    """
    parts = urlsplit(url)
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    try:
        resp = requests.get(
            robots_url, timeout=timeout, headers={"User-Agent": USER_AGENT},
            proxies={"http": None, "https": None},
        )
    except Exception as e:  # noqa: BLE001 —— robots 不可达不必然禁止，放行并说明
        return True, f"robots.txt 不可达（{type(e).__name__}），按未禁止处理"
    if resp.status_code >= 400:
        return True, "站点未提供 robots.txt，按未禁止处理"
    parser = RobotFileParser()
    parser.parse(resp.text.splitlines())
    agent = "SmartResumeBot"
    if not parser.can_fetch(agent, url):
        if parser.can_fetch("*", url):
            return True, "robots.txt 对通配 UA 允许该路径"
        return False, f"robots.txt 禁止抓取该路径（{robots_url}）"
    return True, "robots.txt 允许该路径"


# ── 表单结构识别 ──

# 字段用途分类：定位键（name/id/label 关键词）→ kind
_KIND_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("email", ("email", "mail", "邮箱")),
    ("phone", ("phone", "mobile", "tel", "手机", "电话")),
    ("name", ("name", "姓名", "名字")),
    ("resume_file", ("resume", "cv", "file", "attachment", "简历", "附件")),
    ("cover_letter", ("cover", "letter", "message", "comment", "note", "desc",
                      "self", "introduce", "附言", "自荐", "介绍", "留言", "备注")),
]


@dataclass
class ProbeField:
    selector: str
    kind: str
    input_type: str = "text"
    label: str | None = None


@dataclass
class ProbeResult:
    ok: bool
    url: str
    robots_allowed: bool = True
    robots_detail: str | None = None
    form_detected: bool = False
    fields: list[ProbeField] = dc_field(default_factory=list)
    site_title: str | None = None
    detail: str | None = None


def _classify_field(name: str, label: str, input_type: str) -> str:
    """按 name/id/label 关键词把字段归类到用途（顺序即优先级）。"""
    hay = f"{name} {label}".lower()
    for kind, keys in _KIND_RULES:
        if any(k in hay for k in keys):
            if kind == "resume_file" and input_type != "file":
                # 文件类关键词但不是文件输入 → 可能是「粘贴简历文本」
                return "cover_letter"
            return kind
    return "other"


def _selector_for(el, base: str) -> str:
    """为表单元素生成稳健定位器：优先 #id，其次 [name=]，最后标签+序号兜底。"""
    el_id = el.get("id")
    if el_id:
        return f"#{el_id}"
    name = el.get("name")
    if name:
        return f'{base}[name="{name}"]'
    return base  # 由调用方按出现顺序补 nth


def probe_form_page(url: str) -> ProbeResult:
    """只读探测官网投递页：robots 核查 + 主表单字段识别。不提交任何数据。"""
    result = ProbeResult(ok=False, url=url)

    allowed, detail = check_robots_allowed(url)
    result.robots_allowed, result.robots_detail = allowed, detail
    if not allowed:
        result.detail = "robots.txt 禁止抓取该页面，已按合规要求停止（可联系招聘方指定其它投递方式）"
        return result

    try:
        resp = requests.get(
            url, timeout=FETCH_TIMEOUT, headers={"User-Agent": USER_AGENT},
            proxies={"http": None, "https": None},
        )
    except Exception as e:  # noqa: BLE001
        result.detail = f"页面抓取失败：{type(e).__name__}"
        return result
    if resp.status_code >= 400:
        result.detail = f"页面返回 HTTP {resp.status_code}，可能需要登录或已失效"
        return result

    from bs4 import BeautifulSoup

    soup = BeautifulSoup(resp.text, "html.parser")
    result.site_title = (soup.title.get_text(strip=True) if soup.title else None)

    # 静态 HTML 无 form 时，多为 SPA/ATS 动态页——探测不出结构，交给浏览器内预填
    forms = soup.find_all("form")
    inputs = soup.find_all(["input", "textarea", "select"])
    if not forms and not inputs:
        result.detail = "页面为动态渲染（未发现静态表单），可尝试直接打开预填浏览器在页面中确认"
        return result

    for el in inputs:
        tag = el.name
        itype = (el.get("type") or ("textarea" if tag == "textarea" else "text")).lower()
        if itype in ("hidden", "submit", "button", "image", "reset", "checkbox", "radio"):
            continue
        if el.get("disabled") is not None:
            continue
        name = (el.get("name") or el.get("id") or "").strip()
        label_text = ""
        el_id = el.get("id")
        if el_id:
            label = soup.find("label", attrs={"for": el_id})
            if label:
                label_text = label.get_text(" ", strip=True)
        kind = _classify_field(name, label_text, itype)
        if kind == "other" and itype not in ("file", "email", "tel"):
            continue  # 无法归类的普通字段不预填，避免误填风险
        selector = _selector_for(el, tag if tag != "input" else f'input[type="{itype}"]')
        result.fields.append(ProbeField(selector=selector, kind=kind, input_type=itype,
                                        label=label_text or None))

    result.form_detected = bool(result.fields)
    result.ok = result.form_detected
    if not result.form_detected:
        result.detail = result.detail or "未识别到可自动预填的投递字段（字段命名非通用），请在浏览器中手动填写"
    return result


# ── 预填（Playwright Page，绝不提交）──

_KIND_TO_DATA = {
    "name": "applicant_name",
    "email": "email",
    "phone": "phone",
    "cover_letter": "cover_letter",
}

# 预填后浏览器保持打开的最长等待（用户人工确认提交期间）；超时自动收尾
DEFAULT_KEEP_OPEN_SECONDS = 900


def open_and_prefill(
    apply_url: str,
    data: dict,
    resume_path: str | None = None,
    *,
    headless: bool = False,
    keep_open_seconds: int = DEFAULT_KEEP_OPEN_SECONDS,
) -> dict:
    """打开官网投递页并预填表单（同步阻塞，调用方须在后台线程执行）。

    流程：robots 核查 → 打开页面 → 静态探测字段预填（含简历附件上传）
    → 保持浏览器打开供用户人工检查并**手动点击提交** → 页面关闭/超时后收尾。

    本函数**绝不点击任何提交按钮**。headless 仅用于回归测试。

    返回 {ok, robots_allowed, filled, uploaded, skipped, detail}。
    """
    from playwright.sync_api import sync_playwright

    probe = probe_form_page(apply_url)
    if not probe.robots_allowed:
        return {"ok": False, "robots_allowed": False, "filled": [], "uploaded": False,
                "skipped": [], "detail": probe.detail}

    report = {"ok": False, "robots_allowed": True, "filled": [], "uploaded": False,
              "skipped": [], "detail": None}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=headless)
            try:
                page = browser.new_context().new_page()
                page.goto(apply_url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(1_500)  # 给 SPA/ATS 动态渲染留出时间
                fields = [f.__dict__ if hasattr(f, "__dict__") else dict(f) for f in probe.fields]
                filled_report = prefill_on_page(page, fields, data, resume_path)
                report.update(filled_report)
                report["ok"] = True
                # 同线程等待用户人工确认提交（只监视，不操作页面）
                import time
                deadline = time.time() + max(5, keep_open_seconds)
                while time.time() < deadline:
                    try:
                        if page.is_closed():
                            break
                    except Exception:  # noqa: BLE001
                        break
                    time.sleep(2)
            finally:
                try:
                    browser.close()
                except Exception:  # noqa: BLE001
                    pass
    except Exception as e:  # noqa: BLE001
        report["detail"] = f"浏览器预填失败：{type(e).__name__}: {str(e)[:200]}"
        return report
    if not report["filled"] and not report["uploaded"]:
        report["detail"] = report["detail"] or "未识别到可自动预填的字段，已在浏览器打开页面，请手动填写后提交"
    return report


def prefill_on_page(page, fields: list[dict], data: dict, resume_path: str | None = None) -> dict:
    """在已打开的页面上预填投递表单。**绝不点击任何提交按钮**（合规硬约束）。

    参数
    ----
    page:   Playwright Page（headed 由调用方决定）。
    fields: probe_form_page 产出的字段列表（selector/kind/input_type）。
    data:   {applicant_name, email, phone, cover_letter}。
    resume_path: 简历文件路径（file 类字段上传）。

    返回 {filled: [...], uploaded: bool, skipped: [{selector, reason}]}。
    """
    filled: list[str] = []
    skipped: list[dict] = []
    uploaded = False

    for f in fields:
        selector, kind, itype = f["selector"], f["kind"], f.get("input_type", "text")
        try:
            loc = page.locator(selector).first
            if itype == "file":
                if resume_path and not uploaded:
                    loc.set_input_files(resume_path)
                    uploaded = True
                    filled.append(f"{selector}(附件)")
                else:
                    skipped.append({"selector": selector,
                                    "reason": "无可用简历文件" if not resume_path else "已上传过附件"})
                continue
            value_key = _KIND_TO_DATA.get(kind)
            if not value_key or not (data.get(value_key) or "").strip():
                skipped.append({"selector": selector, "reason": "无对应资料或资料为空"})
                continue
            if itype == "select":
                # select 只在选项文本能精确匹配时选择，避免误选
                value = data[value_key].strip()
                try:
                    loc.select_option(label=value)
                except Exception:  # noqa: BLE001
                    skipped.append({"selector": selector, "reason": "下拉无可匹配选项"})
                else:
                    filled.append(selector)
                continue
            loc.fill(data[value_key].strip())
            filled.append(selector)
        except Exception as e:  # noqa: BLE001 —— 单字段失败不中断预填
            skipped.append({"selector": selector, "reason": f"{type(e).__name__}: {str(e)[:80]}"})

    return {"filled": filled, "uploaded": uploaded, "skipped": skipped}
