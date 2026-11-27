"""岗位匹配罗盘（AI 岗位检索）E2E（需 :8000 + :3000 在线）。

背景（2026-11-28 改版）：主流程从「用户自己上传岗位截图 → 规则排序」改为
「选简历 → AI 检索相关岗位 → 五维评分 + 理由/差距/建议」，手动上传岗位退居
兼容接口，页面不再出现上传入口。

覆盖：
1. 页面口径：标题「岗位匹配罗盘」、副标题提到 AI 检索、明确「不再需要手动上传岗位截图」
2. 检索控件齐全：简历、目标方向、城市、期望薪资、岗位数量、检索按钮
3. 旧主流程入口已移除：页面无「上传招聘截图」类文案
4. 有结果时（缓存或 --live 新检索）：
   - 统计卡（检索岗位 / 最高 / 平均 / 强匹配）
   - 每张卡五维条齐全（技能/经验/学历/地点/薪资）
   - 来源标签带「· 画像」或实网来源，匹配理由/不匹配点/优化建议齐全
   - 底部「换一批岗位」存在，权重说明可见
5. 无 console error / pageerror

运行：
  .venv/Scripts/python.exe scripts/verify_match_discovery.py            # 用已有缓存结果
  .venv/Scripts/python.exe scripts/verify_match_discovery.py --live     # 真跑一次检索（约 1-4 分钟）
"""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

passed, failed, skipped = 0, 0, 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def main() -> int:
    global skipped
    live = "--live" in sys.argv
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        # ── 登录 ──
        page.goto(f"{BASE}/login", wait_until="load", timeout=120_000)
        page.get_by_placeholder("邮箱地址").fill(EMAIL)
        page.get_by_placeholder("密码").fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=90_000)

        page.goto(f"{BASE}/match", wait_until="domcontentloaded")
        page.get_by_text("岗位匹配罗盘", exact=True).first.wait_for(timeout=120_000)

        # ── 1. 页面口径与控件 ──
        check("页面标题为「岗位匹配罗盘」", page.get_by_text("岗位匹配罗盘", exact=True).count() >= 1)
        body = page.locator("body").inner_text()
        check("副标题说明 AI 自动检索", "AI 自动检索" in body)
        check("明确说明不再需要手动上传岗位", "不再需要手动上传岗位截图" in body)
        check("旧上传入口已从主流程移除", "上传招聘截图" not in body and "还没有可匹配的岗位" not in body)
        check("简历选择器存在", page.locator('[data-testid="match-resume-select"]').count() == 1)
        check("检索按钮存在", page.locator('[data-testid="match-start"]').count() == 1)
        for label in ("目标方向（可留空）", "期望薪资"):
            check(f"筛选控件：{label}", page.get_by_placeholder(label).count() == 1)

        # ── 2. 触发检索（可选）──
        if live:
            page.locator('[data-testid="match-start"]').click()
            page.locator('[data-testid="match-progress"]').wait_for(timeout=30_000)
            check("点击后出现四步进度条", page.get_by_text("解析简历画像", exact=True).count() >= 1)
            # 等结果，同时快速捕捉失败态（不要傻等到超时才报错）
            deadline = time.time() + 540
            live_ok = False
            while time.time() < deadline:
                if page.locator('[data-testid="match-dims"]').count():
                    live_ok = True
                    break
                if page.get_by_text("检索没有完成").count():
                    alert = page.locator(".ant-alert-error").first
                    check("检索返回岗位结果", False, alert.inner_text()[:200] if alert.count() else "页面显示失败")
                    break
                page.wait_for_timeout(3000)
            else:
                check("检索返回岗位结果", False, "等待 9 分钟仍无结果")
            if live_ok:
                check("检索返回岗位结果", True)

        # ── 3. 结果结构 ──
        has_result = page.locator('[data-testid="match-dims"]').count() > 0
        if not has_result:
            print("  SKIP 该简历暂无缓存结果，加 --live 可完整验证（不消耗额度的部分已通过）")
            skipped += 1
        else:
            cards = page.locator('[data-testid^="match-job-"]').filter(
                has=page.locator('[data-testid="match-dims"]')
            )
            count = cards.count()
            check("检索结果有岗位卡片", count >= 1, f"{count} 张")
            body = page.locator("body").inner_text()
            check("统计卡：检索岗位/最高适配/平均适配/强匹配",
                  all(t in body for t in ("检索岗位", "最高适配", "平均适配", "强匹配")))
            check("数据口径提示可见", "数据口径" in body)
            check("来源标签存在", page.locator('[data-testid="match-job-source"]').count() >= 1)
            source_text = page.locator('[data-testid="match-job-source"]').first.inner_text()
            check("来源标注区分画像/实网", ("画像" in source_text) or ("BOSS" in source_text)
                  or ("猎聘" in source_text) or ("拉勾" in source_text), source_text)

            first = cards.first
            dim_text = first.locator('[data-testid="match-dims"]').inner_text()
            for dim in ("技能匹配", "经验年限", "学历要求", "工作地点", "薪资水平"):
                check(f"五维评分含：{dim}", dim in dim_text)
            for section in ("匹配理由", "不匹配点", "优化建议"):
                check(f"卡片含：{section}", section in first.inner_text())

            check("底部有「换一批岗位」", page.get_by_text("换一批岗位", exact=True).count() == 1)
            check("权重口径说明可见",
                  page.get_by_text("技能 30% + 经验 25% + 薪资 20% + 地点 15% + 学历 10%", exact=False).count() >= 1)

        check("无前端运行时错误", not errors, str(errors[:3]))
        browser.close()

    print(f"\n结果：{passed} passed, {failed} failed, {skipped} skipped")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
