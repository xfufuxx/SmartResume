"""简历上传阶段化进度条 + 取消上传 E2E（需 :3000 在线；上传接口用 route mock，不耗 LLM 额度）。

覆盖：
1. /resumes 页：失败态（红条 + 失败原因 + 关闭按钮 → 关闭回 idle）
2. /resumes 页：阶段化进度——早期 percent < 40（不跳终点）；解析中 percent 缓慢爬升
   （两次采样递增且 < 90）；阶段指示条高亮推进；取消按钮存在；放行后成功态
3. /resumes 页：取消上传——挂起响应 → 点「取消上传」→ cancelled 态（percent < 90、
   「已取消上传」+「重新上传」按钮）→ 点重新上传回 idle（可再次上传）
4. 首页 Dragger：解析中 → 成功 + 「重新上传」回拖拽界面

注意：route 回调里不能 sleep（会阻塞 sync Playwright 主线程，错过 parsing 窗口）；
「解析中」通过挂起 route（保存 route 对象暂不 fulfill）实现，断言完再手动放行。

运行：.venv/Scripts/python.exe scripts/verify_resume_upload_progress.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

passed = failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def login() -> str:
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


SUCCESS_PAYLOAD = {
    "id": "mock-resume-id",
    "parsed_json": {"personal_info": {"name": "进度条测试"}, "summary": "mock"},
    "original_file_url": None,
    "file_type": "pdf",
    "message": "mock ok",
}


def bar_percent(page) -> int:
    val = page.eval_on_selector(
        '[data-testid="resume-upload-progress"] .ant-progress',
        "el => el.getAttribute('aria-valuenow') || '0'",
    )
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def bar_phase(page) -> str:
    cls = page.eval_on_selector('[data-testid="resume-upload-progress"]', "el => el.className")
    for name in ("preparing", "uploading", "parsing", "done", "error", "cancelled"):
        if f"is-{name}" in cls:
            return name
    return "?"


def active_stages(page) -> int:
    return page.locator('[data-testid="resume-upload-stages"] .is-active').count()


def main() -> int:
    token = login()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        kv = {"token": token, "refreshToken": token}
        page.add_init_script(
            "(() => { const kv = %s; localStorage.clear();"
            " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
            % json.dumps(kv)
        )
        page.context.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": token, "url": BASE},
        ])

        small_pdf = b"%PDF-1.4 mock resume for progress bar test"
        prog = page.locator('[data-testid="resume-upload-progress"]')

        # ── 1. /resumes：失败态（立即 500） ──
        page.route(
            "**/api/resumes/upload",
            lambda route: route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps({"detail": "模拟：简历文件已损坏，无法解析"}, ensure_ascii=False),
            ),
        )
        page.goto(f"{BASE}/resumes", wait_until="domcontentloaded")
        page.wait_for_selector("#upload-resume", state="attached", timeout=30000)
        page.set_input_files("#upload-resume", {"name": "broken.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        prog.wait_for(state="visible", timeout=15000)
        page.wait_for_selector(".resume-upload-progress.is-error", timeout=15000)
        check("失败态：进度条转错误样式（红）", page.locator(".resume-upload-progress.is-error").count() == 1)
        txt = (prog.text_content() or "").strip()
        check("失败态：明示「上传失败」", "上传失败" in txt, txt[:60])
        check("失败态：展示后端错误原因", "文件已损坏" in txt, txt[:120])
        check("失败态：红色进度条 exception", page.locator('[data-testid="resume-upload-progress"] .ant-progress-status-exception').count() >= 1)
        check("失败态：无取消按钮（流程已终结）", page.locator('[data-testid="resume-upload-cancel"]').count() == 0)
        page.get_by_role("button", name="关闭").click()
        page.wait_for_timeout(400)
        check("失败态：点击关闭回 idle（进度条消失）", prog.count() == 0)

        # ── 2. /resumes：渐进式进度（挂起响应 10s，全程采样序列）→ 放行 → 成功 ──
        held: dict = {}
        page.route("**/api/resumes/upload", lambda route: held.setdefault("route", route))
        page.set_input_files("#upload-resume", {"name": "good.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        prog.wait_for(state="visible", timeout=15000)

        # 全程采样：500ms × 20 ≈ 10s（覆盖 准备/上传/解析 三段）
        seq = []
        for _ in range(20):
            seq.append((bar_phase(page), bar_percent(page)))
            time.sleep(0.5)

        pcts = [p for _, p in seq]
        up_samples = [p for ph, p in seq if ph in ("preparing", "uploading")]
        parse_samples = [p for ph, p in seq if ph == "parsing"]

        check("阶段化：上传段有渐进过程（存在 <35 的样本）", any(0 < p < 35 for p in up_samples), f"up={up_samples}")
        check("阶段化：上传段不突跳到解析区间", all(p < 35 for p in up_samples), f"up={up_samples}")
        check("阶段化：进度全程单调不减（无回退）", all(b >= a for a, b in zip(pcts, pcts[1:])), f"pcts={pcts}")
        check("阶段化：解析中从不出现 100%（100 只留给完成）", all(p < 100 for ph, p in seq if ph != "done"), f"seq={seq}")
        check("阶段化：解析段样本充足（≥8）", len(parse_samples) >= 8, f"n={len(parse_samples)}")
        if len(parse_samples) >= 8:
            growth = parse_samples[-1] - parse_samples[0]
            check("渐进式：解析段持续前进（10s 内增长 ≥3%）", growth >= 3, f"{parse_samples[0]} -> {parse_samples[-1]}")
            # 不得「卡住」：解析段末尾 4 个样本里仍有可见推进（≥2%）
            tail = parse_samples[-4:]
            check("渐进式：解析段末尾仍在推进（无长期停滞）", max(tail) - min(tail) >= 2, f"tail={tail}")

        txt = (prog.text_content() or "").strip()
        check("解析中态：进入解析样式（含等待时长文案）", "AI 正在解析简历" in txt, txt[:60])
        check("解析中态：提示勿关闭页面 + 预计时长", "请勿关闭页面" in txt and "预计约" in txt, txt[:160])
        check("解析中态：展示「取消上传」按钮", page.locator('[data-testid="resume-upload-cancel"]').count() == 1)
        check("解析中态：阶段指示条高亮到「解析」段", active_stages(page) == 3, f"active={active_stages(page)}")

        held["route"].fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(SUCCESS_PAYLOAD, ensure_ascii=False),
        )
        page.wait_for_selector(".resume-upload-progress.is-done", timeout=15000)
        txt = (prog.text_content() or "").strip()
        check("成功态：绿条 +「解析完成」文案", "解析完成" in txt and "good.pdf 已就绪" in txt, txt[:80])
        check("成功态：进度条 success 样式", page.locator('[data-testid="resume-upload-progress"] .ant-progress-status-success').count() >= 1)
        check("成功态：阶段指示条四段全亮", active_stages(page) == 4, f"active={active_stages(page)}")
        check("成功态：无取消按钮（已完成）", page.locator('[data-testid="resume-upload-cancel"]').count() == 0)
        # 回归「先 100 再回落」：done 后静置 3s 必须仍然是 100
        time.sleep(3)
        check("成功态：完成后 3s 进度仍为 100（无回落）", bar_percent(page) == 100 and bar_phase(page) == "done", f"{bar_phase(page)}|{bar_percent(page)}")
        page.get_by_role("button", name="关闭").click()
        page.wait_for_timeout(400)
        check("成功态：点击关闭回 idle", prog.count() == 0)

        # ── 3. /resumes：取消上传（挂起响应 → 点取消 → cancelled → 重新上传回 idle） ──
        held_cancel: dict = {}
        page.route("**/api/resumes/upload", lambda route: held_cancel.setdefault("route", route))
        page.set_input_files("#upload-resume", {"name": "cancel.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        prog.wait_for(state="visible", timeout=15000)
        page.wait_for_selector('[data-testid="resume-upload-cancel"]', timeout=15000)
        page.locator('[data-testid="resume-upload-cancel"]').click()
        page.wait_for_selector(".resume-upload-progress.is-cancelled", timeout=10000)
        txt = (prog.text_content() or "").strip()
        check("取消态：明示「已取消上传」", "已取消上传" in txt, txt[:60])
        pct = bar_percent(page)
        check("取消态：进度条停留在中途（<96，不到终点）", 0 < pct < 96, f"pct={pct}")
        check("取消态：取消按钮已隐藏", page.locator('[data-testid="resume-upload-cancel"]').count() == 0)
        # 取消后定时器必须全部清理：静置 2s 进度不得继续爬升
        time.sleep(2)
        check("取消态：进度已冻结（定时器已清理）", bar_percent(page) == pct, f"{pct} -> {bar_percent(page)}")
        # 挂起的 route 已被客户端中止，补 abort 清理（避免悬挂请求占坑）
        if "route" in held_cancel:
            try:
                held_cancel["route"].abort()
            except Exception:
                pass
        page.get_by_role("button", name="重新上传").click()
        page.wait_for_timeout(400)
        check("取消态：点「重新上传」回初始态（可再次上传）", prog.count() == 0)

        # 取消后可再次正常上传走完整流程
        held2: dict = {}
        page.route("**/api/resumes/upload", lambda route: held2.setdefault("route", route))
        page.set_input_files("#upload-resume", {"name": "again.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        page.wait_for_selector(".resume-upload-progress.is-parsing", timeout=15000)
        held2["route"].fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(SUCCESS_PAYLOAD, ensure_ascii=False),
        )
        page.wait_for_selector(".resume-upload-progress.is-done", timeout=15000)
        check("取消后重传：完整流程再次成功", "解析完成" in (prog.text_content() or ""), "")
        page.get_by_role("button", name="关闭").click()

        # ── 4. 首页 Dragger：解析中（挂起）→ 成功 + 重新上传 ──
        held3: dict = {}
        page.route("**/api/resumes/upload", lambda route: held3.setdefault("route", route))
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        dragger_input = page.locator(".opt-dragger input[type='file']").first
        dragger_input.wait_for(state="attached", timeout=30000)
        dragger_input.set_input_files({"name": "home.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        home_prog = page.locator('[data-testid="resume-upload-progress"]')
        page.wait_for_selector(".resume-upload-progress.is-parsing", timeout=15000)
        check("首页：解析中态在 Dragger 内展示", home_prog.count() == 1 and "AI 正在解析简历" in (home_prog.text_content() or ""))
        check("首页：展示「取消上传」按钮", page.locator('[data-testid="resume-upload-cancel"]').count() == 1)
        held3["route"].fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(SUCCESS_PAYLOAD, ensure_ascii=False),
        )
        page.wait_for_selector(".resume-upload-progress.is-done", timeout=15000)
        txt = (home_prog.text_content() or "").strip()
        check("首页：成功态「解析完成，home.pdf 已就绪」", "解析完成" in txt and "home.pdf" in txt, txt[:80])
        page.get_by_role("button", name="重新上传").click()
        page.wait_for_timeout(400)
        check("首页：点「重新上传」回拖拽界面", home_prog.count() == 0 and page.locator(".opt-dragger").count() >= 1)

        browser.close()

    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
