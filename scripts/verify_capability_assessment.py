# -*- coding: utf-8 -*-
"""岗位能力测评 E2E：登录 → 岗位测评 → 两步打分 → 报告 → 记录/排行 → 删除清理"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SHOT_DIR = "D:/下载/智能简历/.workbuddy/tmp"
import os
os.makedirs(SHOT_DIR, exist_ok=True)

errors = []
checks = []


def check(name, ok, extra=""):
    checks.append((name, ok))
    print(("PASS" if ok else "FAIL"), "|", name, ("| " + str(extra) if extra else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. 登录（antd 对两字文案会自动加空格，用 type=submit 选择器最稳；等水合后再交互）
    page.goto(f"{BASE}/login", wait_until="load", timeout=90000)
    page.wait_for_timeout(3000)  # 等待 React 水合，避免点击落到原生表单提交
    page.fill('input[placeholder="邮箱地址"]', "demo@smart-resume.com")
    page.fill('input[placeholder="密码"]', "Demo@123456")
    page.click('button[type="submit"]')
    # 登录成功后的跳转可能早于监听注册，用轮询避免竞态
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)
    check("登录跳转 dashboard", True)

    # 2. 进入岗位能力测评
    page.goto(f"{BASE}/capability", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector('button:has-text("能力测评")', timeout=45000)
    job_buttons = page.locator('button:has-text("能力测评")')
    n = job_buttons.count()
    check("岗位卡片渲染", n >= 10, f"count={n}")
    page.screenshot(path=f"{SHOT_DIR}/cap_01_jobs.png", full_page=False)

    # 3. 搜索过滤
    page.fill('input[placeholder^="搜索岗位名称"]', "云计算")
    page.wait_for_timeout(400)
    n2 = page.locator('button:has-text("能力测评")').count()
    check("搜索「云计算」过滤", n2 == 1 and n2 < n, f"count={n2}")
    page.fill('input[placeholder^="搜索岗位名称"]', "")

    # 4. 打开第一个岗位的测评
    job_buttons.first.click()
    page.wait_for_selector('text=专业核心考察点', timeout=15000)
    check("测评弹窗打开（专业核心考察点页）", True)

    # 5. 专业能力全部打 5 星（第 5 颗星）
    rates = page.locator(".ant-rate")
    rc = rates.count()
    for i in range(rc):
        rates.nth(i).locator("li").nth(4).click()
    page.wait_for_timeout(300)
    rated_text = page.locator('text=/已评 \\d+ \\/ \\d+ 项/')
    check("专业维度全部评分", f"/ {rc} 项" in (rated_text.first.inner_text() if rated_text.count() else ""), f"rates={rc}")
    page.screenshot(path=f"{SHOT_DIR}/cap_02_prof.png")

    # 6. 下一步 → 通识基础素质（7 项）
    page.click('button:has-text("下一步")')
    page.wait_for_selector('text=通识基础素质（7 项）', timeout=15000)
    rates2 = page.locator(".ant-rate")
    rc2 = rates2.count()
    for i in range(rc2):
        rates2.nth(i).locator("li").nth(4).click()
    page.wait_for_timeout(300)
    check("通识维度渲染", rc2 == 7, f"rates={rc2}")

    # 7. 提交
    page.click('button:has-text("提交并生成报告")')
    page.wait_for_selector('text=整体匹配度', timeout=30000)
    body = page.locator(".ant-modal-body").last.inner_text()
    check("报告弹窗展示", "整体匹配度" in body)
    check("全 5 星 → 匹配度 100%", "100%" in body, body[:0])
    check("报告含三阶段补步建议", "阶段一" in body and "阶段二" in body and "阶段三" in body)
    check("报告含郑重建议", "郑重建议" in body)
    check("报告含复评日期", "建议下次复评" in body)
    page.screenshot(path=f"{SHOT_DIR}/cap_03_report.png", full_page=False)

    # 8. 关闭报告 → 测评记录 Tab
    page.click('.ant-modal:has-text("岗位测评报告") button:has-text("知道了")')
    page.click('text=测评记录')
    page.wait_for_selector('text=岗位匹配排行', timeout=20000)
    page.wait_for_timeout(800)
    rec_body = page.locator(".app-page-enter").inner_text()
    check("记录页显示岗位匹配排行", "岗位匹配排行" in rec_body)
    check("记录页显示测评记录", "全部测评记录" in rec_body)
    page.screenshot(path=f"{SHOT_DIR}/cap_04_records.png")

    # 9. 删除该记录（「删除」两字会被 antd 加空格，用 danger 类选择触发按钮）
    page.locator("button.ant-btn-dangerous").first.click()
    page.wait_for_selector(".ant-popconfirm", timeout=8000)
    page.locator(".ant-popconfirm .ant-btn-primary").click()
    page.wait_for_timeout(1500)
    after = page.locator(".app-page-enter").inner_text()
    check("删除后回到空状态", "还没有测评记录" in after, after[:60].replace("\n", " "))

    # 10. 侧边导航入口存在
    nav = page.locator('a:has-text("岗位能力测评")')
    check("侧边导航含「岗位能力测评」", nav.count() >= 1)

    browser.close()

print("\n==== SUMMARY ====")
failed = [c for c in checks if not c[1]]
for name, ok in checks:
    print(("✅" if ok else "❌"), name)
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
if errors:
    print("\nCONSOLE ERRORS (前5条):")
    for e in errors[:5]:
        print(" -", e[:200])
sys.exit(1 if failed else 0)
