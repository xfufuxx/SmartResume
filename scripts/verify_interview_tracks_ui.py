"""面试追踪（手动录入）端到端回归：空状态 → 添加 → 统计图表 → 编辑 → 多视口 → 删除。

前置：Redis + 后端(:8000) + 前端 dev(:3000) 均在运行；演示账号可登录。
用法：backend/.venv/Scripts/python.exe scripts/verify_interview_tracks_ui.py <access_token> <refresh_token> [截图前缀]

脚本会先清空该账号已有的面试记录，因此可重复运行（幂等）。
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

WEB = "http://localhost:3000"
API = "http://localhost:8000"
TOKEN = sys.argv[1]
REFRESH = sys.argv[2] if len(sys.argv) > 2 else ""
OUT = sys.argv[3] if len(sys.argv) > 3 else "C:/Users/fu/_tr"

# 本机设了 http_proxy，直连本地服务必须绕过代理，否则会 502/000
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

results = []


def check(cond, msg, extra=""):
    results.append((bool(cond), msg, extra))
    print(("  PASS " if cond else "  FAIL ") + msg + (f" {extra}" if extra else ""))


def api(method, path, data=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    with _opener.open(req, timeout=30) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw else None


def reset_records():
    """清空面试记录，让「空状态」断言成立（幂等前置）。"""
    items = api("GET", "/api/interview-tracks/") or []
    for it in items:
        api("DELETE", "/api/interview-tracks/" + it["id"])
    left = api("GET", "/api/interview-tracks/") or []
    print(f"前置：清理历史记录 {len(items)} 条，剩余 {len(left)} 条")
    return len(left)


def select_option(page, placeholder, option):
    # 点 .ant-select 容器本身，避免被内部 search input 拦截点击
    page.locator(
        f'.ant-select:has(.ant-select-selection-placeholder:text-is("{placeholder}"))'
    ).first.click()
    page.wait_for_timeout(400)
    page.locator(f'.ant-select-item-option-content:text-is("{option}")').first.click()
    page.wait_for_timeout(300)


left = reset_records()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    page.set_default_timeout(30000)

    # 写入登录态
    page.goto(WEB + "/login", wait_until="domcontentloaded", timeout=180000)
    page.evaluate(
        """([t, r]) => {
            localStorage.setItem('token', t);
            if (r) localStorage.setItem('refreshToken', r);
        }""",
        [TOKEN, REFRESH],
    )

    # 1. 打开页面（dev 首次编译可能很慢）
    page.goto(WEB + "/interviews", wait_until="domcontentloaded", timeout=180000)
    page.wait_for_timeout(4500)
    print("=== 1. 页面加载 ===")
    check(page.locator("text=面试追踪").count() > 0, "页面标题渲染")
    check(
        "手动记录每场面试的进展与结果" in page.content(),
        "副标题已改为「手动记录每场面试的进展与结果」（不再是投递文案）",
    )
    check("投递" not in page.inner_text("body"), "页面正文中不再出现「投递」字样")
    check(
        left == 0 and page.locator("text=还没有面试记录").count() > 0,
        "空状态引导出现（无模拟数据兜底）",
    )
    page.screenshot(path=f"{OUT}_empty_1440.png", full_page=True)

    # 2. 打开表单并填写
    print("=== 2. 手动添加面试 ===")
    page.locator('button:has-text("添加第一条面试记录"), button:has-text("添加面试")').first.click()
    page.wait_for_timeout(900)
    check(page.locator(".ant-modal-content").count() > 0, "添加弹窗打开")
    for label in ["公司名称", "应聘职位", "工作地点", "面试时间", "面试轮次", "面试方式",
                  "当前状态", "面试官 / 联系人", "关联简历", "关联岗位", "面试复盘 / 结果备注"]:
        check(label in page.inner_text(".ant-modal-content"), f"表单含字段「{label}」")
    page.screenshot(path=f"{OUT}_modal.png")

    page.fill('input[placeholder="如：字节跳动"]', "深蓝科技")
    page.fill('input[placeholder="如：前端开发工程师"]', "资深前端工程师")
    page.fill('input[placeholder="如：上海 / 远程"]', "杭州")
    select_option(page, "如：一面 / HR 面", "二面")
    select_option(page, "现场 / 线上 / 电话", "线上")
    page.fill('input[placeholder="选填"]', "王面试官")
    page.fill(
        'textarea[placeholder="记录面试问题、自己的表现、下一步准备等"]',
        "考察了 React 并发渲染与性能优化，整体表现不错。",
    )
    # 面试时间（DatePicker 输入 + 回车确认）
    dp = page.locator('input[placeholder="选择面试日期与时间"]')
    dp.click()
    dp.fill("2026-09-25 10:30")
    page.keyboard.press("Enter")
    page.wait_for_timeout(400)

    page.locator(".ant-modal-footer .ant-btn-primary").click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("深蓝科技" in body, "保存后列表中出现了新记录（公司名）")
    check("资深前端工程师" in body, "职位已显示")
    check("二面" in body, "面试轮次已显示")
    check("还没有面试记录" not in body, "空状态已消失")
    check(
        page.locator(".ant-modal-wrap:visible .ant-modal-content").count() == 0,
        "保存后弹窗自动关闭",
    )
    page.screenshot(path=f"{OUT}_list_1440.png", full_page=True)

    # 3. 统计卡片与图表基于真实数据
    print("=== 3. 统计与图表 ===")
    stat_text = page.locator(".app-stat-grid").first.inner_text()
    check("全部面试" in stat_text and "待面试" in stat_text, "统计卡片渲染状态维度")
    check(page.locator("canvas").count() >= 2, "漏斗图与结果分布图已渲染", f"canvas={page.locator('canvas').count()}")
    check("面试日历" in body, "面试日历卡片存在")

    # 4. 编辑
    print("=== 4. 编辑记录 ===")
    page.locator(".ant-table-tbody button .anticon-edit").first.click()
    page.wait_for_timeout(900)
    check("编辑面试记录" in page.inner_text(".ant-modal-content"), "编辑弹窗标题正确")
    company_val = page.input_value('input[placeholder="如：字节跳动"]')
    check(company_val == "深蓝科技", "编辑时表单已回填原值", f"company={company_val}")
    # 状态改为已获 Offer
    page.locator(".ant-modal-content .ant-select").nth(2).click()
    page.wait_for_timeout(400)
    page.locator('.ant-select-item-option-content:text-is("已获 Offer")').first.click()
    page.wait_for_timeout(250)
    page.locator(".ant-modal-footer .ant-btn-primary").click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("已获 Offer" in body, "编辑后状态更新为「已获 Offer」")
    check(
        "已获 Offer" in page.locator(".ant-table-tbody").first.inner_text(),
        "列表行内状态同步更新为「已获 Offer」",
    )

    # 5. 多视口
    print("=== 5. 多视口 ===")
    for w, h in [(768, 1000), (480, 900), (1600, 1100)]:
        page.set_viewport_size({"width": w, "height": h})
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{OUT}_list_{w}.png", full_page=True)
        check(True, f"{w}px 视口截图完成")

    # 6. 删除回到空状态
    print("=== 6. 删除记录 ===")
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(600)
    page.locator(".ant-table-tbody button .anticon-more").first.click()
    page.wait_for_timeout(700)
    # 注意：antd 关闭状态的 Dropdown 菜单仍留在 DOM 中，必须限定可见的那个，
    # 否则 :first 会命中隐藏菜单并一直等不到可见（点击超时）。
    page.locator('.ant-dropdown-menu-item:has-text("删除记录"):visible').first.click()
    page.wait_for_timeout(700)
    check(
        "删除这条面试记录" in page.inner_text(".ant-modal-confirm")
        or "删除这条面试记录" in page.inner_text("body"),
        "删除二次确认弹窗出现",
    )
    page.locator(".ant-modal-confirm .ant-btn-dangerous").first.click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("还没有面试记录" in body, "删除后回到空状态")
    check("深蓝科技" not in body, "记录已从列表移除")

    browser.close()

total = len(results)
fails = sum(1 for ok, _, _ in results if not ok)
print(f"\n结果: PASS {total - fails} / FAIL {fails}")
sys.exit(1 if fails else 0)
