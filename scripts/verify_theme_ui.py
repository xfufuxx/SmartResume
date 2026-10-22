"""问题 6-D/E 主题定制抽屉 E2E 回归（需 :3000/:8000 在线）。

覆盖：
1. 详情页入口与抽屉打开（标题/预览 iframe/控件）
2. 预览 iframe 的主题参数随控件联动（默认值 = 模板默认）
3. 字号滑块键盘调整 → 预览 URL 同步更新（预览与导出同链的第一重保障）
4. 保存并重新导出 → theme_config 落库 + PDF 元数据含 theme-base-size（第二重保障）
5. 清理：清空 theme_config 并重导出还原
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
RECORD_ID = "9d65fbd1-d1be-4cbc-a64d-8b53001183f1"

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


def record_theme(token):
    st, body = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
    return (json.loads(body) if st == 200 else {}).get("theme_config")


def reset_theme():
    """开跑前清空记录的主题定制（上一轮异常退出时可能留残留，导致初始值不是模板默认）。"""
    import subprocess
    subprocess.run(
        [sys.executable, "-c",
         "import asyncio, asyncpg\n"
         "async def m():\n"
         "    c = await asyncpg.connect('postgresql://postgres:root@localhost:5432/smart_resume')\n"
         "    await c.execute('UPDATE optimized_resumes SET theme_config = NULL WHERE id = $1', "
         f"'{RECORD_ID}')\n"
         "    await c.close()\n"
         "asyncio.run(m())"],
        check=True, timeout=60,
    )


def main() -> int:
    reset_theme()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto(f"{BASE}/login", wait_until="load", timeout=90_000)
        page.wait_for_timeout(2_000)
        page.fill('input[placeholder="邮箱地址"]', EMAIL)
        page.fill('input[placeholder="密码"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60_000)

        page.goto(f"{BASE}/history/{RECORD_ID}", wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_selector("text=简历内容对比", timeout=60_000)
        page.wait_for_timeout(1_200)

        # 1. 打开抽屉
        page.locator("button", has_text="主题定制").first.click()
        page.wait_for_selector("text=主题定制", timeout=15_000)
        drawer = page.locator(".ant-drawer:visible")
        check("抽屉打开", drawer.count() >= 1)
        frame = drawer.locator('iframe[title="主题实时预览"]')
        check("预览 iframe 存在", frame.count() == 1)

        # 2. 预览 URL 默认参数（professional: 主色 #2c6fbb / 11pt）
        src0 = frame.get_attribute("src") or ""
        check("预览 URL 含默认主色", "primary=%232c6fbb" in src0, src0[:160])
        check("预览 URL 含默认字号 11pt", "base_font_size=11" in src0, src0[:160])

        # 3. 滑块键盘调整字号（11 → 13）
        handle = drawer.locator(".ant-slider-handle").first
        handle.focus()
        for _ in range(4):
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(600)
        src1 = frame.get_attribute("src") or ""
        check("调字号后预览 URL 同步（base_font_size=13）", "base_font_size=13" in src1, src1[:160])
        slider_text = drawer.locator("text=正文字号（13pt）")
        check("滑块读数更新为 13pt", slider_text.count() >= 1)

        # 4. 保存并重新导出
        drawer.locator("button", has_text="保存并重新导出").click()
        page.wait_for_selector("text=主题已保存", timeout=30_000)
        check("保存成功提示", True)
        page.wait_for_timeout(2_000)

        st, body = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
        token = json.loads(body)["access_token"]
        theme = record_theme(token) or {}
        check("theme_config 落库（baseFontSizePt=13）", theme.get("baseFontSizePt") == 13, f"got {theme}")

        st, body = api("POST", f"/api/optimize/{RECORD_ID}/reexport", token=token)
        payload = json.loads(body) if st == 200 else {}
        pdf_url = (payload.get("pdf_url") or "").replace("http://localhost:8000", "http://127.0.0.1:8000")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        pdf = opener.open(urllib.request.Request(pdf_url), timeout=180).read()
        import fitz
        doc = fitz.open(stream=pdf, filetype="pdf")
        kw = doc.metadata.get("keywords") or ""
        doc.close()
        check("PDF 元数据含 theme-base-size=13pt", "theme-base-size=13pt" in kw, f"kw={kw[:200]}")

        # 5. 清理：清空主题并重导出
        # （playwright sync 的线程里已有运行中的事件循环，asyncio.run 会炸，走子进程）
        import subprocess
        subprocess.run(
            [sys.executable, "-c",
             "import asyncio, asyncpg\n"
             "async def m():\n"
             "    c = await asyncpg.connect('postgresql://postgres:root@localhost:5432/smart_resume')\n"
             "    await c.execute('UPDATE optimized_resumes SET theme_config = NULL WHERE id = $1', "
             f"'{RECORD_ID}')\n"
             "    await c.close()\n"
             "asyncio.run(m())"],
            check=True, timeout=60,
        )
        st, body = api("POST", f"/api/optimize/{RECORD_ID}/reexport", token=token)
        check("清理：清空主题并重导出", st == 200, f"st={st}")

        browser.close()

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
