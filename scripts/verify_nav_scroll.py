"""侧边栏高亮滚入可视区 E2E（需 :8000 + :3000 在线，Playwright）。

背景：侧边栏功能多、列表可滚动，点进 ATS 体检等靠下功能后，视口顶部
停留的仍是「首页」，高亮项在可视区外。修复 = 路由/activeKey 变化时把
激活项滚进滚动容器可视区。

覆盖（对每个深链页面）：
1. 正确的菜单项带 active 高亮类
2. 高亮项的包围盒落在导航滚动容器可视区内（无需用户手动滚动即可看到）

运行：.venv/Scripts/python.exe scripts/verify_nav_scroll.py
"""
from __future__ import annotations

import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

# 深链页面 → 期望高亮的菜单文案
CASES = [
    ("/ats", "ATS 体检"),
    ("/capability", "岗位能力测评"),
    ("/batch", "批量优化"),
    ("/scoring", "简历评分"),
    ("/dashboard", "首页"),
]

passed, failed = 0, 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def login() -> tuple[str, str, dict]:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"], body["refresh_token"], body.get("user", {})


def main() -> int:
    token, refresh, user = login()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 800}).new_page()
        # 登录态注入（与 verify_auth_gate 同款：localStorage init script + cookie 预置）
        kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user) if user else None}
        page.add_init_script(
            "(() => { const kv = %s; localStorage.clear();"
            " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
            % json.dumps(kv)
        )
        page.context.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": refresh, "url": BASE},
        ])

        for path, label in CASES:
            page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            page.wait_for_selector(".wb-navitem.active", timeout=15000)
            active_text = (page.locator(".wb-navitem.active").first.text_content() or "").strip()
            check(f"{path} 高亮项为「{label}」", label in active_text, f"actual={active_text}")

            # 高亮项是否落在导航容器可视区内
            state = page.evaluate("""() => {
                const nav = document.querySelector('.wb-nav-scroll');
                const el = document.querySelector('.wb-navitem.active');
                if (!nav || !el) return null;
                const n = nav.getBoundingClientRect();
                const r = el.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, nTop: n.top, nBottom: n.bottom,
                         scrollTop: nav.scrollTop };
            }""")
            ok = bool(state) and state["top"] >= state["nTop"] - 1 and state["bottom"] <= state["nBottom"] + 1
            check(f"{path} 高亮项在可视区内（scrollTop={state['scrollTop'] if state else '-'}）", ok, str(state))

        browser.close()

    print(f"\n结果：{passed} PASS / {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
