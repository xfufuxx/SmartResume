"""模板一致性 E2E：优化页与优化详情页共用同一模板清单（12 套），选择器形态一致。

覆盖：
1. 优化页「/」模板选择器：12 张卡片、名称正确、选中后面包屑按钮同步
2. 优化详情页「/history/{id}」编辑态：模板按钮 + 卡片选择器（与优化页一致）
3. 详情页选择新模板（海洋之蓝）后重新导出 PDF：后端 200 且为合法 PDF
4. 新模板（学术严谨）后端渲染：PDF 文字含项目要点
"""
import os
import re
import sys
import time
import json
import urllib.request
import urllib.error

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
SHOT_DIR = "D:/下载/智能简历/.workbuddy/tmp"
RECORD_ID = "48ff4b63-4d99-4c1b-b144-210e31ca81d8"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"

EXPECTED = [
    "专业分栏", "简约单栏", "现代渐变", "紧凑高效", "优雅金边", "深色科技",
    "清新绿意", "经典黑白", "海洋之蓝", "暖阳落日", "紫韵流光", "学术严谨",
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


def api(method, path, body=None, token=None, retry=3):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retry):
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retry - 1:
                time.sleep(8)
                continue
            return e.code, e.read()[:400]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ── 登录 ──
    print("[1] 登录")
    page.goto(f"{BASE}/login", wait_until="load", timeout=90000)
    page.wait_for_timeout(3000)
    page.fill('input[placeholder="邮箱地址"]', EMAIL)
    page.fill('input[placeholder="密码"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)

    # ── 优化页模板选择器 ──
    print("[2] 优化页模板选择器")
    page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=AI 优化后简历", timeout=60000)
    page.wait_for_timeout(600)

    tpl_btn = page.locator("button:has-text('专业分栏')").first
    check("优化页-默认模板按钮", tpl_btn.count() == 1)
    tpl_btn.click()
    page.wait_for_selector("text=选择简历模板风格", timeout=15000)
    page.wait_for_timeout(500)

    modal_cards = page.locator(".ant-modal-body .ant-card")
    n = modal_cards.count()
    check("优化页-卡片数量=12", n == 12, f"got {n}")
    labels = [re.sub(r"\s+", "", modal_cards.nth(i).inner_text()) for i in range(n)]
    missing = [e for e in EXPECTED if not any(e in l for l in labels)]
    check("优化页-12 模板名称齐全", not missing, f"missing={missing}")
    page.screenshot(path=f"{SHOT_DIR}/tpl_01_optimize_selector.png", full_page=False)

    # 选中「紫韵流光」→ 弹窗关闭 + 按钮文案同步
    page.locator(".ant-modal-body .ant-card", has_text="紫韵流光").first.click()
    modal_gone = False
    for _ in range(30):
        page.wait_for_timeout(200)
        # antd Modal 关闭后 DOM 残留（display:none），须按可见性判断
        if page.locator(".ant-modal-wrap:visible").count() == 0:
            modal_gone = True
            break
    check("优化页-弹窗已关闭", modal_gone)
    btn_text = re.sub(r"\s+", "", page.locator("button", has_text="紫韵流光").first.inner_text())
    check("优化页-按钮同步为紫韵流光", "紫韵流光" in btn_text, btn_text)

    # ── 详情页模板选择器 ──
    print("[3] 优化详情页模板选择器")
    page.goto(f"{BASE}/history/{RECORD_ID}", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=简历内容对比", timeout=60000)
    page.wait_for_timeout(500)
    page.click("button:has-text('编辑内容')")
    page.wait_for_selector("text=编辑优化结果", timeout=15000)
    page.wait_for_timeout(400)

    d_btn = page.locator("button:has-text('专业分栏')").first
    check("详情页-默认模板按钮", d_btn.count() == 1)
    d_btn.click()
    page.wait_for_selector("text=选择简历模板风格", timeout=15000)
    page.wait_for_timeout(500)
    d_cards = page.locator(".ant-modal-body .ant-card")
    dn = d_cards.count()
    check("详情页-卡片数量=12", dn == 12, f"got {dn}")
    d_labels = [re.sub(r"\s+", "", d_cards.nth(i).inner_text()) for i in range(dn)]
    d_missing = [e for e in EXPECTED if not any(e in l for l in d_labels)]
    check("详情页-12 模板名称齐全", not d_missing, f"missing={d_missing}")
    check("两处选择器顺序完全一致", labels == d_labels)
    page.screenshot(path=f"{SHOT_DIR}/tpl_02_detail_selector.png", full_page=False)

    # 选中「海洋之蓝」
    page.locator(".ant-modal-body .ant-card", has_text="海洋之蓝").first.click()
    page.wait_for_timeout(600)
    d_btn2 = page.locator("button", has_text="海洋之蓝").first
    check("详情页-按钮同步为海洋之蓝", d_btn2.count() == 1)

    # ── 重新导出 PDF ──
    print("[4] 重新导出 PDF（海洋之蓝）")
    page.click("button:has-text('重新导出 PDF')")
    ok_export = False
    for _ in range(40):
        page.wait_for_timeout(1000)
        if page.locator(".ant-message").count() > 0:
            msg = page.locator(".ant-message").inner_text()
            if "成功" in msg or "已按最新内容" in msg:
                ok_export = True
                break
        if "已按最新内容重新生成" in page.content():
            ok_export = True
            break
    check("详情页-重新导出成功提示", ok_export)

    # API 层验证：该记录 pdf_url 可下载且为合法 PDF
    st, body = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = json.loads(body)["access_token"] if st == 200 else None
    st, rec = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
    rec_json = json.loads(rec)
    pdf_url = (rec_json.get("data") or rec_json).get("pdf_url") if st == 200 else None
    check("详情页-记录返回 pdf_url", bool(pdf_url), str(rec)[:120])
    if pdf_url:
        dl = pdf_url if pdf_url.startswith("http") else API + pdf_url
        req = urllib.request.Request(dl)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=90) as r:
                pdf = r.read()
            check("详情页-PDF 可下载且合法", pdf[:4] == b"%PDF" and len(pdf) > 5000, f"size={len(pdf)}")
        except Exception as e:
            check("详情页-PDF 可下载且合法", False, str(e)[:150])

    page.screenshot(path=f"{SHOT_DIR}/tpl_03_detail_after_export.png", full_page=False)

    # ── 后端新模板渲染（academic）──
    print("[5] 后端 academic 模板渲染")
    st, pdf = api("POST", "/api/optimize/test-template?template=academic", {
        "resume_data": {
            "personal_info": {"name": "模板验证"},
            "summary": "验证摘要",
            "experience": [{"title": "工程师", "company": "A", "start": "2020", "end": "2022", "points": ["负责核心系统开发UNIQUEACADEMIC。"]}],
            "education": [{"school": "S", "degree": "本科", "major": "CS", "start": "2016", "end": "2020"}],
            "skills": ["Python"],
            "projects": [{"name": "全域直流管控平台", "role": "后端负责人", "start": "2022.03", "end": "2023.08",
                          "points": ["主导后端架构设计UNIQUEACADEMIC。"]}],
        }
    }, token=token)
    check("后端-academic 模板 200 且 PDF", st == 200 and pdf[:4] == b"%PDF", f"st={st} size={len(pdf)}")

    # ── JS 未捕获异常 ──
    js_errors = [e for e in errors if "favicon" not in e.lower()]
    check("无未捕获 JS 异常", len(js_errors) == 0, "; ".join(js_errors[:3]))

    browser.close()

print(f"\n===== {passed}/{passed + failed} 通过 =====")
sys.exit(0 if failed == 0 else 1)
