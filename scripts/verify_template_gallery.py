"""模板画廊页 /templates E2E 回归。

覆盖：
1. 导航入口（侧边栏「模板库」）
2. 卡片数量 = 注册表模板数，分类 Tabs / 标签 chips / 搜索
3. 预览弹窗（点击卡片打开）
4. 「使用此模板」无记录闭环 → /?template=<id>，优化页按钮预选
5. 「使用此模板」带 ?record= 闭环 → PUT 落库 + 跳回 /history/{id}，按钮显示新模板

运行（backend/.venv，需 :3000/:8000 在线）：
    cd backend && .venv/Scripts/python.exe ../scripts/verify_template_gallery.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright  # noqa: E402

# 注意：不 import verify_template_consistency（它无 __main__ 保护，import 即整跑）。
BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
EXPECTED = [
    "专业分栏", "简约单栏", "现代渐变", "紧凑高效", "优雅金边", "深色科技",
    "清新绿意", "经典黑白", "海洋之蓝", "暖阳落日", "紫韵流光", "学术严谨",
    # ── jadeAI 迁移批次 A（15 套）──
    "经典单栏专业版", "现代双栏创意版",
    "极简留白版", "现代渐变头部版", "时间线版", "浅色侧边栏双栏版", "高管稳重版",
    "专业深蓝版", "创意渐变版", "ATS 友好纯文本版", "学术版", "优雅柔和版",
    "开发者双栏版", "设计师作品集版", "初创活力版",
    # ── jadeAI 迁移（批次 B：行业/职业 5 套）──
    "北欧冷淡版", "企业正式版", "咨询顾问版", "金融投行版", "医疗健康版",
    # ── jadeAI 迁移（批次 C：现代/科技 5 套）──
    "渐变现代版", "磁贴格纹版", "质感卡片版", "代码终端版", "块状网格版",
    # ── jadeAI 迁移（批次 D：创意/艺术 5 套）──
    "杂志排版版", "艺术创想版", "复古雅致版", "霓虹暗夜版", "水彩晕染版",
]

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")

from playwright.sync_api import sync_playwright  # noqa: E402

RECORD_ID = "9d65fbd1-d1be-4cbc-a64d-8b53001183f1"  # demo 账号的专业分栏记录


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s)


def login(page) -> None:
    page.goto(f"{BASE}/login", wait_until="load", timeout=90_000)
    page.wait_for_timeout(2_000)
    page.fill('input[placeholder="邮箱地址"]', EMAIL)
    page.fill('input[placeholder="密码"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60_000)


def gallery_cards(page):
    cards = page.locator(".ant-card")
    labels = [norm(cards.nth(i).inner_text()) for i in range(cards.count())]
    return labels


import json as _json  # noqa: E402
import urllib.error as _uerr  # noqa: E402
import urllib.request as _ureq  # noqa: E402

_opener = _ureq.build_opener(_ureq.ProxyHandler({}))


def record_template() -> str | None:
    """API 读取演示记录当前模板（落库事实源）。"""
    req = _ureq.Request(
        f"http://127.0.0.1:8000/api/auth/login",
        data=_json.dumps({"email": EMAIL, "password": PASSWORD}).encode(), method="POST",
    )
    req.add_header("Content-Type", "application/json")
    token = _json.loads(_opener.open(req, timeout=30).read())["access_token"]
    req2 = _ureq.Request(f"http://127.0.0.1:8000/api/optimize/{RECORD_ID}", method="GET")
    req2.add_header("Authorization", f"Bearer {token}")
    try:
        return _json.loads(_opener.open(req2, timeout=30).read()).get("template")
    except _uerr.HTTPError:
        return None


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        login(page)
        print("[1] 登录成功，进入画廊页")

        # ── 导航入口 ──
        nav = page.locator("a:has-text('模板库'), [role=menuitem]:has-text('模板库')")
        nav.first.wait_for(timeout=30_000)  # 侧边栏水合后再断言
        check("侧边栏存在「模板库」入口", nav.count() >= 1)
        nav.first.click()
        page.wait_for_url("**/templates**", timeout=60_000)
        page.wait_for_selector("text=简历模板库", timeout=60_000)
        page.wait_for_timeout(800)

        # ── 卡片数量 ──
        page.wait_for_timeout(500)
        labels = gallery_cards(page)
        # 网格视图下每模板一张卡
        check(f"画廊卡片数 = {len(EXPECTED)}", len(labels) == len(EXPECTED), f"got {len(labels)}")
        missing = [e for e in EXPECTED if not any(norm(e) in lb for lb in labels)]
        check("全部模板名均出现", not missing, f"缺失: {missing}")

        # ── 分类 Tabs ──
        tabs = page.locator(".ant-tabs-tab")
        tab_names = [norm(tabs.nth(i).inner_text()) for i in range(tabs.count())]
        check("分类 Tabs 含「全部」", any("全部" in t for t in tab_names), f"tabs={tab_names}")

        # ── 搜索 ──
        page.fill('input[placeholder="搜索模板 / 行业 / 标签"]', "jade")
        page.wait_for_timeout(600)
        labels_jade = gallery_cards(page)
        # 搜索命中模板 id：批次 A 15 套 + 批次 B 5 套 + 批次 C 5 套 = 25 套 jade-* 模板
        check("搜索 jade → 30 张卡（jadeAI 批次 A+B+C+D）", len(labels_jade) == 30, f"got {len(labels_jade)}")
        page.fill('input[placeholder="搜索模板 / 行业 / 标签"]', "")
        page.wait_for_timeout(500)

        # ── 预览弹窗 ──
        page.locator(".ant-card", has_text="现代双栏创意版").first.click()
        page.wait_for_selector("text=预览", timeout=15_000)
        modal = page.locator(".ant-modal:visible")
        check("预览弹窗打开", modal.count() >= 1)
        page.locator(".ant-modal-wrap:visible .ant-modal-close").last.click()
        page.wait_for_timeout(800)

        # ── 无记录闭环：使用此模板 → /?template= ──
        print("[2] 无记录闭环")
        page.locator(".ant-card", has_text="现代双栏创意版").first.click()
        page.wait_for_selector("button:has-text('使用此模板')", timeout=15_000)
        page.locator("button:has-text('使用此模板')").last.click()
        page.wait_for_url(lambda url: "/?template=jade-twocol" in url, timeout=60_000)
        check("跳转优化页带模板参数", "/?template=jade-twocol" in page.url, page.url)
        page.wait_for_timeout(1_500)
        tpl_btn = page.locator("button", has_text="现代双栏创意版")
        check("优化页按钮预选「现代双栏创意版」", tpl_btn.count() >= 1)

        # ── 带记录闭环：/templates?record= ──
        print("[3] 带记录闭环")
        page.goto(f"{BASE}/templates?record={RECORD_ID}", wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_selector("text=简历模板库", timeout=60_000)
        page.wait_for_timeout(1_200)
        check("提示正在为记录挑选模板", page.locator("text=正在为一条优化记录挑选模板").count() == 1)
        current = page.locator(".ant-card", has_text="当前使用中")
        check("记录当前模板卡片高亮「当前使用中」", current.count() == 1, f"got {current.count()}")

        page.locator(".ant-card", has_text="现代双栏创意版").first.click()
        page.wait_for_selector("button:has-text('使用此模板')", timeout=15_000)
        page.locator("button:has-text('使用此模板')").last.click()
        page.wait_for_url(f"**/history/{RECORD_ID}**", timeout=60_000)
        page.wait_for_selector("text=简历内容对比", timeout=60_000)
        check("落库生效（API 读记录 template=jade-twocol）",
              record_template() == "jade-twocol", f"got {record_template()!r}")

        # 还原：经详情页「更多模板」回画廊，应用回 professional
        page.locator("button", has_text="更多模板").first.click()
        page.wait_for_url("**/templates?record=**", timeout=60_000)
        page.wait_for_selector("text=简历模板库", timeout=60_000)
        page.wait_for_timeout(1_200)
        current = page.locator(".ant-card", has_text="当前使用中")
        check("画廊再次进入时高亮 jade-twocol", "现代双栏创意版" in current.first.inner_text())
        page.locator(".ant-card", has_text="专业分栏").first.click()
        page.wait_for_selector("button:has-text('使用此模板')", timeout=15_000)
        page.locator("button:has-text('使用此模板')").last.click()
        page.wait_for_url(f"**/history/{RECORD_ID}**", timeout=60_000)
        page.wait_for_selector("text=简历内容对比", timeout=60_000)
        check("还原为 professional（落库）", record_template() == "professional", f"got {record_template()!r}")

        browser.close()

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
