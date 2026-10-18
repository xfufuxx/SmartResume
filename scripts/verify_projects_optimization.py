# -*- coding: utf-8 -*-
"""问题二 E2E：项目经历正常参与优化流程的前端验证。

覆盖：
1. 历史详情页「项目经历」展示优化前/后对照（含 role/起止/points 全文）
2. 优化后的项目要点与原始数据确实不同（LLM 优化真实生效）
3. 在线编辑器可编辑项目 points，保存后持久化（不丢字段）
4. 还原修改，保持演示数据干净
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SHOT_DIR = "D:/下载/智能简历/.workbuddy/tmp"
os.makedirs(SHOT_DIR, exist_ok=True)

RECORD_ID = "48ff4b63-4d99-4c1b-b144-210e31ca81d8"
ORIG_POINT = "负责后端代码编写、自测与性能优化"
OPT_POINT_HEAD = "主导平台后端架构设计与核心代码实现"
OPT_POINT_FULL = ("主导平台后端架构设计与核心代码实现，针对日均200万条监测数据的实时性与一致性挑战，"
                  "设计了基于Redis+MySQL的多级缓存与事务补偿机制。")
MARKER = "E2E验证标记-"

errors = []
checks = []


def check(name, ok, extra=""):
    checks.append((name, ok))
    print(("PASS" if ok else "FAIL"), "|", name, ("| " + str(extra) if extra else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. 登录（antd 两字文案加空格坑：用 type=submit；等水合 3s 再交互）
    page.goto(f"{BASE}/login", wait_until="load", timeout=90000)
    page.wait_for_timeout(3000)
    page.fill('input[placeholder="邮箱地址"]', "demo@smart-resume.com")
    page.fill('input[placeholder="密码"]', "Demo@123456")
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)
    check("登录跳转 dashboard", True)

    # 2. 打开历史详情页
    page.goto(f"{BASE}/history/{RECORD_ID}", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=简历内容对比", timeout=60000)
    page.wait_for_timeout(1000)

    # 3. 项目经历前后对照
    body = page.inner_text("body")
    check("项目经历区块标题存在", "项目经历" in body)
    check("项目名称渲染", "全域直流管控平台" in body)
    check("项目角色渲染", "后端负责人" in body)
    check("项目起止时间渲染", "2022.03" in body and "2023.08" in body)
    check("优化前要点原文展示", ORIG_POINT in body)
    check("优化后要点全文展示", OPT_POINT_HEAD in body and "多级缓存与事务补偿机制" in body)
    # 「优化前/优化后」成对卡片
    check("前后对照卡片（优化前 x1 / 优化后 x1）",
          page.locator("text=优化前").count() >= 2 and page.locator("text=优化后").count() >= 2,
          f"before={page.locator('text=优化前').count()} after={page.locator('text=优化后').count()}")
    page.screenshot(path=f"{SHOT_DIR}/proj_01_compare.png", full_page=False)

    # 4. 编辑器：项目字段完整可编辑（作用域限定在「项目经历」卡片，避开工作经历同名输入框）
    page.click("button:has-text('编辑内容')")
    page.wait_for_selector("text=编辑优化结果", timeout=15000)
    proj_section = page.locator(".ant-card").filter(
        has=page.locator(".ant-card-head-title", has_text="项目经历")
    ).last
    name_input = proj_section.locator('input[placeholder="项目名称"]').first
    role_input = proj_section.locator('input[placeholder^="角色"]').first
    start_input = proj_section.locator('input[placeholder^="开始"]').first
    end_input = proj_section.locator('input[placeholder^="结束"]').first
    check("编辑器-项目名称回填", name_input.input_value() == "全域直流管控平台", name_input.input_value())
    check("编辑器-项目角色回填", role_input.input_value() == "后端负责人", role_input.input_value())
    check("编辑器-起止时间回填", start_input.input_value() == "2022.03" and end_input.input_value() == "2023.08",
          f"{start_input.input_value()} ~ {end_input.input_value()}")
    point_ta = proj_section.locator('textarea[placeholder*="设计接口服务与数据库模型"]').first
    check("编辑器-要点输入框存在", point_ta.count() == 1)
    check("编辑器-要点内容回填", OPT_POINT_HEAD in point_ta.input_value())
    check("编辑器-要点条数=3", proj_section.locator('textarea[placeholder*="设计接口服务与数据库模型"]').count() == 3,
          str(proj_section.locator('textarea[placeholder*="设计接口服务与数据库模型"]').count()))
    page.screenshot(path=f"{SHOT_DIR}/proj_02_editor.png", full_page=False)

    # 5. 修改第一个要点 → 保存 → 刷新后仍在（字段不丢）
    point_ta.fill(MARKER + OPT_POINT_FULL)
    page.click("button:has-text('保存修改')")
    page.wait_for_selector("text=已保存", timeout=20000)
    page.wait_for_timeout(1500)
    page.reload(wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=简历内容对比", timeout=60000)
    page.wait_for_timeout(1000)
    body2 = page.inner_text("body")
    check("保存后要点持久化（标记仍在）", MARKER in body2)
    check("保存后其余要点未丢", "构建实时监控与告警子系统" in body2)
    check("保存后角色/时间未丢", "后端负责人" in body2 and "2022.03" in body2)

    # 6. 还原为原始优化文本，保持演示数据干净
    page.click("button:has-text('编辑内容')")
    page.wait_for_selector("text=编辑优化结果", timeout=15000)
    point_ta2 = page.locator('textarea[placeholder*="设计接口服务与数据库模型"]').first
    point_ta2.fill(OPT_POINT_FULL)
    page.click("button:has-text('保存修改')")
    page.wait_for_selector("text=已保存", timeout=20000)
    page.wait_for_timeout(1500)
    page.reload(wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=简历内容对比", timeout=60000)
    page.wait_for_timeout(1000)
    body3 = page.inner_text("body")
    check("还原成功（标记已清除）", MARKER not in body3)
    check("还原后内容完整", OPT_POINT_HEAD in body3)
    page.screenshot(path=f"{SHOT_DIR}/proj_03_restored.png", full_page=False)

    # 7. 未捕获 JS 异常（antd 的 console.error dev 警告为既有现象，不计入）
    js_errors = list(errors)
    check("无未捕获 JS 异常", len(js_errors) == 0, "; ".join(js_errors[:3]))

    browser.close()

failed = [n for n, ok in checks if not ok]
print(f"\n===== {len(checks) - len(failed)}/{len(checks)} 通过 =====")
if failed:
    print("失败项:", failed)
    sys.exit(1)
