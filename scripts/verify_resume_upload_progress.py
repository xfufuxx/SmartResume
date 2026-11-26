"""简历上传四态进度条 E2E（需 :3000 在线；上传接口用 route mock，不耗 LLM 额度）。

覆盖：
1. /resumes 页：失败态（红条 + 失败原因 + 关闭按钮 → 关闭回 idle）
2. /resumes 页：解析中态（挂起响应：动画条 + 等待时长文案）→ 放行响应 → 成功态（绿条 100%）
3. 首页 Dragger：解析中态 → 成功态 + 「重新上传」按钮回拖拽界面

注意：route 回调里不能 sleep（会阻塞 sync Playwright 主线程，错过 parsing 窗口）；
「解析中」通过挂起 route（保存 route 对象暂不 fulfill）实现，断言完再手动放行。

运行：.venv/Scripts/python.exe scripts/verify_resume_upload_progress.py
"""
from __future__ import annotations

import json
import sys
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
        page.get_by_role("button", name="关闭").click()
        page.wait_for_timeout(400)
        check("失败态：点击关闭回 idle（进度条消失）", prog.count() == 0)

        # ── 2. /resumes：解析中（挂起响应）→ 放行 → 成功 ──
        held: dict = {}
        page.route("**/api/resumes/upload", lambda route: held.setdefault("route", route))
        page.set_input_files("#upload-resume", {"name": "good.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        page.wait_for_selector(".resume-upload-progress.is-parsing", timeout=15000)
        txt = (prog.text_content() or "").strip()
        check("解析中态：进入解析样式（含等待时长文案）", "AI 正在解析简历" in txt, txt[:60])
        bar_cls = page.eval_on_selector('[data-testid="resume-upload-progress"] .ant-progress', "el => el.className")
        check("解析中态：进度条动画态（active）", "status-active" in bar_cls, bar_cls[:150])
        check("解析中态：不显示数字（showInfo=false）", "show-info" not in bar_cls, bar_cls[:150])
        check("解析中态：提示勿关闭页面", "请勿关闭页面" in txt, txt[:120])

        held["route"].fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(SUCCESS_PAYLOAD, ensure_ascii=False),
        )
        page.wait_for_selector(".resume-upload-progress.is-done", timeout=15000)
        txt = (prog.text_content() or "").strip()
        check("成功态：绿条 +「解析完成」文案", "解析完成" in txt and "good.pdf 已就绪" in txt, txt[:80])
        check("成功态：进度条 success 样式", page.locator('[data-testid="resume-upload-progress"] .ant-progress-status-success').count() >= 1)
        page.get_by_role("button", name="关闭").click()
        page.wait_for_timeout(400)
        check("成功态：点击关闭回 idle", prog.count() == 0)

        # ── 3. 首页 Dragger：解析中（挂起）→ 成功 + 重新上传 ──
        held2: dict = {}
        page.route("**/api/resumes/upload", lambda route: held2.setdefault("route", route))
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        dragger_input = page.locator(".opt-dragger input[type='file']").first
        dragger_input.wait_for(state="attached", timeout=30000)
        dragger_input.set_input_files({"name": "home.pdf", "mimeType": "application/pdf", "buffer": small_pdf})
        home_prog = page.locator('[data-testid="resume-upload-progress"]')
        page.wait_for_selector(".resume-upload-progress.is-parsing", timeout=15000)
        check("首页：解析中态在 Dragger 内展示", home_prog.count() == 1 and "AI 正在解析简历" in (home_prog.text_content() or ""))
        held2["route"].fulfill(
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
