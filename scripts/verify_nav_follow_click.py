"""侧边栏高亮跟随点击模块 交互级 E2E（需 :8000 + :3000 在线，Playwright）。

背景：用户从首页快捷工具/侧边栏点进 ATS 体检、岗位能力测评等模块后，
左侧导航的高亮要么停在「首页」、要么在可视区外。本轮修复：
1. 路由变化后双 rAF 等新布局绘制完，再把高亮项滚进导航可视区
2. 高亮样式加强（蓝色淡底 + 左侧 3px 蓝色竖条），一眼可见
3. 移动端抽屉重新打开时同样滚到高亮项

覆盖（矮视口 1366×640，强制导航区出现滚动）：
A. 真实交互：/dashboard 点快捷工具「ATS 体检」→ 高亮 ATS 体检且可视
B. 真实交互：/dashboard 点快捷工具「岗位匹配罗盘」→ 高亮 岗位匹配罗盘 且可视
C. 深链：/capability → 高亮 岗位能力测评 且可视
D. 样式：高亮项有 inset 蓝色竖条（box-shadow 非空）

运行：.venv/Scripts/python.exe scripts/verify_nav_follow_click.py
"""
from __future__ import annotations

import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

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


def assert_active(page, path: str, label: str) -> None:
    """断言当前页高亮项为 label 且落在导航可视区内、带竖条样式"""
    page.wait_for_selector(".wb-navitem.active", timeout=15000)
    info = page.evaluate("""() => {
        const nav = document.querySelector('.wb-nav-scroll');
        const el = document.querySelector('.wb-navitem.active');
        if (!nav || !el) return null;
        const n = nav.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
            text: (el.textContent || '').trim(),
            visible: r.top >= n.top - 1 && r.bottom <= n.bottom + 1,
            scrollTop: Math.round(nav.scrollTop),
            accent: getComputedStyle(el).boxShadow !== 'none',
        };
    }""")
    check(f"{path} 高亮项为「{label}」", bool(info) and label in info["text"], str(info and info["text"]))
    check(f"{path} 高亮项在导航可视区内（scrollTop={info['scrollTop'] if info else '-'}）",
          bool(info) and info["visible"], str(info))
    check(f"{path} 高亮样式带蓝色竖条", bool(info) and info["accent"])


def main() -> int:
    token, refresh, user = login()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # 矮视口：导航列表必然溢出，强制检验滚动逻辑
        page = browser.new_context(viewport={"width": 1366, "height": 640}).new_page()
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

        # ── A/B. 真实交互：首页快捷工具点击进入 ──
        for tool, expect in (("ATS 体检", "ATS 体检"), ("岗位匹配罗盘", "岗位匹配罗盘")):
            page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            page.wait_for_selector(".wb-navitem.active", timeout=15000)
            card = page.locator("div", has_text=tool).locator(f"xpath=//div[contains(., '{tool}') and contains(@style, 'cursor: pointer')]").last
            card.click()
            page.wait_for_timeout(1500)  # 等路由提交 + 双 rAF 滚动
            assert_active(page, f"点击快捷工具「{tool}」", expect)

        # ── C. 深链：/capability ──
        page.goto(f"{BASE}/capability", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        assert_active(page, "/capability", "岗位能力测评")

        browser.close()

    print(f"\n结果：{passed} PASS / {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
