"""简历批量管理：整卡点选 + 选中高亮 E2E（需 :3000 在线，只读操作，不改动演示数据）。

覆盖：
1. 开启「批量管理」后，卡片/列表行内不再出现复选框；
2. 点击卡片正文任意位置即选中，并出现高亮（描边 + 背景变化）；
3. 卡片内的按钮（更多操作）不触发选中；
4. 再次点击取消选中，样式还原；
5. 列表视图同样整行点选且无复选框；
6. 键盘 Enter 可切换选中；
7. 退出批量管理后卡片恢复普通态，点击不再改动选中集合。

运行：.venv/Scripts/python.exe scripts/verify_resume_select.py
"""
from __future__ import annotations

import json
import re
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


def style_of(page, card) -> str:
    """选中态视觉快照：描边色 + 背景色（不硬编码主题色，靠前后对比判定）。
    先把鼠标移出卡片并等过渡结束，否则量到的是 hover 描边而不是选中态。"""
    page.mouse.move(5, 5)
    page.wait_for_timeout(260)
    return card.evaluate(
        "el => { const s = getComputedStyle(el); return s.borderTopColor + '|' + s.backgroundColor; }"
    )


def counter_text(page) -> str:
    return page.locator(".resume-toolbar, body").first.inner_text()


def main() -> int:
    token = login()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 950}).new_page()
        page.add_init_script(
            "localStorage.setItem('token', %s); localStorage.setItem('refreshToken', %s);"
            % (json.dumps(token), json.dumps(token))
        )
        page.context.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": token, "url": BASE},
        ])

        page.goto(f"{BASE}/resumes", wait_until="domcontentloaded")
        cards = page.locator('[data-testid^="resume-card-"]')
        cards.first.wait_for(state="visible", timeout=40000)
        total = cards.count()
        check("前置：简历库存在卡片", total >= 1, f"count={total}")

        # ── 1. 进入批量管理：不应再出现复选框 ──
        page.get_by_role("button", name="批量管理").click()
        page.wait_for_timeout(300)
        check("批量管理：卡片内无复选框", page.locator('[data-testid^="resume-card-"] .ant-checkbox').count() == 0)
        check("批量管理：工具栏出现全选入口", page.get_by_role("button", name=re.compile(r"全\s*选")).count() == 1)
        check("批量管理：卡片进入可点选态", "is-selectable" in (cards.first.get_attribute("class") or ""))

        # ── 2. 点击卡片正文 → 选中 + 高亮 ──
        first = cards.first
        before = style_of(page, first)
        first.click(position={"x": 220, "y": 40})
        page.wait_for_timeout(350)
        check("点选：整卡点击即选中", first.get_attribute("data-selected") == "true")
        check("点选：卡片带 is-selected 类", "is-selected" in (first.get_attribute("class") or ""))
        after = style_of(page, first)
        check("高亮：描边/背景发生变化", after != before, f"{before} -> {after}")
        body_txt = page.inner_text("body")
        check("点选：计数显示已选 1", "已选 1 /" in body_txt, body_txt[:0])
        check("点选：无障碍状态 aria-checked=true", first.get_attribute("aria-checked") == "true")

        # ── 3. 卡片内按钮不触发选中（更多操作菜单） ──
        more_btn = page.locator('[data-testid^="resume-more-"]').first
        more_btn.click()
        page.wait_for_timeout(350)
        menu_open = page.locator(".ant-dropdown:not(.ant-dropdown-hidden)").count() >= 1
        check("控件隔离：点「更多」仍能正常展开菜单", menu_open)
        check("控件隔离：点「更多」不会误取消选中", first.get_attribute("data-selected") == "true")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # ── 4. 再次点击取消选中，样式还原 ──
        first.click(position={"x": 220, "y": 40})
        page.wait_for_timeout(350)
        check("取消点选：data-selected 移除", first.get_attribute("data-selected") is None)
        check("取消点选：高亮样式还原", style_of(page, first) == before, f"{before} -> {style_of(page, first)}")
        check("取消点选：计数回到 0", "已选 0 /" in page.inner_text("body"))

        # ── 5. 键盘 Enter 切换选中（可达性） ──
        first.focus()
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        check("键盘：Enter 选中卡片", first.get_attribute("data-selected") == "true")
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        check("键盘：再次 Enter 取消选中", first.get_attribute("data-selected") is None)

        # ── 6. 列表视图：整行点选、无复选框 ──
        # 页面有两个 Segmented：上面的 Tab 筛选、下面的视图切换（列表图标 = bars）
        page.locator(".ant-segmented-item:has(.anticon-bars)").click()
        page.wait_for_timeout(600)
        rows = page.locator('[data-testid^="resume-row-"]')
        rows.first.wait_for(state="visible", timeout=20000)
        check("列表视图：行内无复选框", page.locator('[data-testid^="resume-row-"] .ant-checkbox').count() == 0)
        row = rows.first
        row_before = style_of(page, row)
        row.click(position={"x": 420, "y": 30})
        page.wait_for_timeout(350)
        check("列表视图：整行点击即选中", row.get_attribute("data-selected") == "true")
        check("列表视图：选中行有高亮", style_of(page, row) != row_before, f"{row_before} -> {style_of(page, row)}")
        row.click(position={"x": 420, "y": 30})
        page.wait_for_timeout(300)

        # ── 7. 退出批量管理：恢复普通态 ──
        page.get_by_role("button", name="取消选择").click()
        page.wait_for_timeout(400)
        row = rows.first
        check("退出批量管理：可点选态移除", "is-selectable" not in (row.get_attribute("class") or ""))
        check("退出批量管理：无残留选中", row.get_attribute("data-selected") is None)
        check("退出批量管理：全选入口消失", page.get_by_role("button", name=re.compile(r"全\s*选")).count() == 0)

        browser.close()

    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
