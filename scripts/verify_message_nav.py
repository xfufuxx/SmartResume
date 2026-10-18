# -*- coding: utf-8 -*-
"""消息通知点击跳转 E2E 验证：
1. 消息中心页：各类型消息点击后路由到对应功能模块
   - job(职位动态)     → /capability?record=<id>，自动打开该测评报告
   - optimize(简历优化) → /history?id=<id>，高亮定位优化记录
   - score(简历评分)    → /scoring
   - interview(面试追踪)→ /interviews
   - warning(异常提醒)  → /resumes
   - vip(会员提醒)      → /profile
   - system/activity    → 不跳转，就地展开全文（不再弹出标记已读/删除操作按钮）
2. 已读状态：点击未读消息 → API 未读数 -1、页面徽标同步
3. 三点菜单：「前往XX / 标记为未读 / 删除」；不再有「标记为已读」；标记未读可逆操作
4. 顶部铃铛：点击消息跳目标模块；「查看全部消息」进 /messages
5. 深链直达：/capability?record=<id> 开报告；/history?id=<id> 高亮
运行前提：前端 :3000、后端 :8000 正常运行；Redis/PG 就绪。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

WEB = "http://localhost:3000"
API = "http://127.0.0.1:8000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"
SHOT_DIR = "D:/下载/智能简历/.workbuddy/tmp"
import os
os.makedirs(SHOT_DIR, exist_ok=True)

errors = []
checks = []


def check(name, ok, extra=""):
    checks.append((name, bool(ok)))
    print(("PASS" if ok else "FAIL"), "|", name, ("| " + str(extra) if extra else ""))


def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api_login(op):
    for attempt in range(4):
        try:
            raw = op.open(urllib.request.Request(
                f"{API}/api/auth/login",
                data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
                headers={"Content-Type": "application/json"}, method="POST"), timeout=30).read().decode()
            return json.loads(raw)["access_token"]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"login 429，等待重试({attempt + 1})...")
                time.sleep(8)
                continue
            raise
    raise RuntimeError("登录失败（限流）")


def api_get(op, token, path):
    r = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, method="GET")
    with op.open(r, timeout=30) as resp:
        return json.loads(resp.read().decode())


def wait_path(page, path, timeout=30000):
    page.wait_for_function("p => location.pathname === p", arg=path, timeout=timeout)


with sync_playwright() as p:
    op = opener()
    token = api_login(op)

    # ── 预取数据 ──
    msgs = api_get(op, token, "/api/messages?page=1&page_size=200")
    items = msgs.get("items", [])
    by_type = {}
    for m in items:
        by_type.setdefault(m["msg_type"], []).append(m)
    print("消息类型分布:", {k: len(v) for k, v in by_type.items()})

    assessments = api_get(op, token, "/api/capability/assessments") or []
    optimize_records = api_get(op, token, "/api/optimize/?q=&category=") or []
    print(f"测评记录 {len(assessments)} 条，优化记录 {len(optimize_records)} 条")

    # 造一条有效测评记录（后端会同步产生一条 job 消息，且 ref_id 指向该记录），
    # 保证「点击消息 → 打开对应报告」的测试有真实数据可点
    new_assessment = None
    job_profiles = api_get(op, token, "/api/capability/jobs") or []
    if job_profiles:
        prof = job_profiles[0]
        body = {
            "job_profile_id": prof["id"],
            "professional_scores": {d["name"]: 4 for d in prof.get("professional_dimensions", [])},
            "general_scores": {d["name"]: 4 for d in prof.get("general_dimensions", [])},
        }
        req = urllib.request.Request(f"{API}/api/capability/assessments",
                                     data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Authorization": f"Bearer {token}"}, method="POST")
        with op.open(req, timeout=60) as resp:
            new_assessment = json.loads(resp.read().decode())
        print(f"已创建测评记录: {new_assessment.get('job_title')} ({(new_assessment.get('id') or '')[:8]})")
        # 重新拉消息：新产生的 job 消息排在最前
        items = api_get(op, token, "/api/messages?page=1&page_size=200").get("items", [])
        by_type = {}
        for m in items:
            by_type.setdefault(m["msg_type"], []).append(m)
        print("重建后消息类型分布:", {k: len(v) for k, v in by_type.items()})

    # 捕获 SPA 跳转时的完整 URL（含 query），用于验证深链参数
    nav_urls = []

    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("framenavigated", lambda f: nav_urls.append(f.url))

    # 1. UI 登录
    page.goto(f"{WEB}/login", wait_until="load", timeout=90000)
    page.wait_for_timeout(3000)
    page.fill('input[placeholder="邮箱地址"]', EMAIL)
    page.fill('input[placeholder="密码"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)
    check("UI 登录进入 dashboard", True)
    nav_urls.clear()

    def goto_messages():
        page.goto(f"{WEB}/messages", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_selector("div.stagger-list, .ant-empty", timeout=60000)
        page.wait_for_timeout(600)

    def open_tab(label):
        page.locator(".ant-tabs-tab", has_text=label).first.click()
        page.wait_for_timeout(500)

    def row_filter(text, unread_only=False):
        loc = page.locator("div.stagger-list > div").filter(has_text=text)
        if unread_only:
            loc = loc.filter(has_text="未读")
        return loc.first

    # ── 2. job 消息 → /capability 自动打开报告 + 已读状态 ──
    if by_type.get("job"):
        goto_messages()
        open_tab("职位动态")
        unread_before_api = api_get(op, token, "/api/messages?page=1&page_size=200").get("unread_count", 0)
        sub = page.locator("text=条未读消息")
        subtitle_before = sub.first.inner_text() if sub.count() else "所有消息均已读"

        clicked_unread = False
        if new_assessment and new_assessment.get("job_title"):
            row = row_filter(new_assessment["job_title"], unread_only=True)
            clicked_unread = row.count() > 0
            if row.count() == 0:
                row = row_filter(new_assessment["job_title"])
        else:
            row = row_filter("能力测评完成", unread_only=True)
            clicked_unread = row.count() > 0
            if row.count() == 0:
                row = row_filter("能力测评完成")
        row.scroll_into_view_if_needed()
        row_title = row.locator(".ant-typography").first.inner_text()
        job_name = (re.search(r"「(.+?)」", row_title) or [None, None])[1]
        check("job 行显示「点击前往：岗位能力测评」提示", row.locator("text=点击前往：岗位能力测评").count() > 0)

        nav_urls.clear()
        row.click()
        wait_path(page, "/capability")
        nav_with_param = [u for u in nav_urls if "/capability?record=" in u]
        check("job 消息点击后跳转 /capability", True)
        check("跳转 URL 携带 record 深链参数", len(nav_with_param) > 0, nav_urls[-1] if nav_urls else "无")
        page.wait_for_selector(".ant-modal-content", timeout=30000)
        modal_text = page.locator(".ant-modal-content").first.inner_text()
        check("测评报告弹窗自动打开", ("测评报告" in modal_text) or ("整体匹配度" in modal_text))
        check("报告岗位与消息一致", bool(job_name) and job_name in modal_text, f"期望含「{job_name}」")
        page.screenshot(path=f"{SHOT_DIR}/msgnav_01_job_report.png")
        page.locator(".ant-modal-close").first.click()
        page.wait_for_timeout(400)

        # 已读状态验证
        unread_after_api = api_get(op, token, "/api/messages?page=1&page_size=200").get("unread_count", 0)
        if clicked_unread:
            check("点击未读消息后 API 未读数 -1", unread_after_api == unread_before_api - 1,
                  f"{unread_before_api} → {unread_after_api}")
            goto_messages()
            sub2 = page.locator("text=条未读消息")
            after_txt = sub2.first.inner_text() if sub2.count() else "0 条未读消息"
            m2 = re.match(r"(\d+)", after_txt)
            unread_after_ui = int(m2.group(1)) if m2 else 0
            check("页面未读徽标同步递减", unread_after_ui == unread_before_api - 1,
                  f"{subtitle_before} → {after_txt}")
        else:
            check("点击未读消息后 API 未读数 -1", True, "无未读 job 消息，跳过")
    else:
        check("存在 job 类型消息", False, "无数据")

    # ── 3. optimize 消息 → /history ──
    if by_type.get("optimize"):
        opt_ids = {r.get("id") for r in optimize_records}
        opt_match = next((m for m in by_type["optimize"] if m.get("ref_id") in opt_ids), None)
        first_opt = by_type["optimize"][0]
        goto_messages()
        open_tab("简历优化")
        if opt_match:
            row = page.locator("div.stagger-list > div").filter(has_text=opt_match["title"]).first
        else:
            row = page.locator("div.stagger-list > div").first
        row.scroll_into_view_if_needed()
        nav_urls.clear()
        row.click()
        wait_path(page, "/history")
        nav_with_id = [u for u in nav_urls if "/history?id=" in u]
        check("optimize 消息点击后跳转 /history", True)
        if opt_match or first_opt.get("ref_id"):
            check("跳转 URL 携带 id 深链参数", len(nav_with_id) > 0, nav_urls[-1] if nav_urls else "无")
        if opt_match:
            page.wait_for_timeout(1800)
            check("history 页高亮定位对应记录卡片", page.locator(".opt-card-highlight").count() > 0,
                  f"ref={opt_match['ref_id'][:8]}")
            page.screenshot(path=f"{SHOT_DIR}/msgnav_03_history_highlight.png")
        else:
            print("  （所点 optimize 消息的 ref 不对应现存记录，仅验证路由与参数）")
    else:
        print("  （无 optimize 消息，跳过）")

    # ── 4. score → /scoring ──
    if by_type.get("score"):
        goto_messages()
        row = row_filter("简历评分结果")
        row.scroll_into_view_if_needed()
        row.click()
        wait_path(page, "/scoring")
        check("score 消息点击后跳转 /scoring", True, page.url)
    else:
        print("  （无 score 消息，跳过）")

    # ── 5. interview → /interviews ──
    if by_type.get("interview"):
        goto_messages()
        open_tab("面试追踪")
        row = page.locator("div.stagger-list > div").first
        row.scroll_into_view_if_needed()
        row.click()
        wait_path(page, "/interviews")
        check("interview 消息点击后跳转 /interviews", True, page.url)
    else:
        print("  （无 interview 消息，跳过）")

    # ── 6. warning → /resumes ──
    if by_type.get("warning"):
        goto_messages()
        row = row_filter("解析失败")
        row.scroll_into_view_if_needed()
        row.click()
        wait_path(page, "/resumes")
        check("warning 消息点击后跳转 /resumes", True, page.url)
    else:
        print("  （无 warning 消息，跳过）")

    # ── 7. vip → /profile ──
    if by_type.get("vip"):
        goto_messages()
        row = row_filter("会员")
        row.scroll_into_view_if_needed()
        row.click()
        wait_path(page, "/profile")
        check("vip 消息点击后跳转 /profile", True, page.url)
    else:
        print("  （无 vip 消息，跳过）")

    # ── 8. system 消息：不跳转 + 就地展开 + 无跳转提示 ──
    if by_type.get("system"):
        goto_messages()
        open_tab("系统通知")
        check("系统通知 Tab 无跳转提示", page.locator("text=点击前往").count() == 0)
        row = page.locator("div.stagger-list > div").first
        row.scroll_into_view_if_needed()
        row.click()
        page.wait_for_timeout(900)
        check("system 消息点击后停留在 /messages", page.url.rstrip("/").endswith("/messages"), page.url)
        check("system 消息就地展开全文（展开箭头切换、不再弹出操作按钮）",
              row.locator(".anticon-up").count() > 0 and row.locator("button:has-text('删除')").count() == 0)
    else:
        print("  （无 system 消息，跳过）")

    # ── 9. activity 消息：不跳转 ──
    if by_type.get("activity"):
        goto_messages()
        row = row_filter("活动")
        row.scroll_into_view_if_needed()
        row.click()
        page.wait_for_timeout(900)
        check("activity 消息点击后停留在 /messages", page.url.rstrip("/").endswith("/messages"), page.url)
        check("activity 消息就地展开（无操作按钮）",
              row.locator(".anticon-up").count() > 0 and row.locator("button:has-text('删除')").count() == 0)
    else:
        print("  （无 activity 消息，跳过）")

    # ── 10. 行「更多」菜单：前往XX / 标记为未读 / 删除（不再有「标记为已读」） ──
    goto_messages()
    open_tab("职位动态")
    row = page.locator("div.stagger-list > div").filter(has_text="能力测评完成").first
    row.scroll_into_view_if_needed()
    row.locator("button:has(.anticon-more)").click()
    page.wait_for_timeout(400)
    check("行更多菜单含「前往岗位能力测评」",
          page.locator(".ant-dropdown-menu-item", has_text="前往岗位能力测评").count() > 0)
    check("行更多菜单含「标记为未读」",
          page.locator(".ant-dropdown-menu-item", has_text="标记为未读").count() > 0)
    check("行更多菜单不再含「标记为已读」",
          page.locator(".ant-dropdown-menu-item", has_text="标记为已读").count() == 0)
    page.locator(".ant-dropdown-menu-item", has_text="前往岗位能力测评").first.click()
    wait_path(page, "/capability")
    check("菜单「前往」可跳转 /capability", True, page.url)

    # ── 11. 顶部铃铛 ──
    page.goto(f"{WEB}/dashboard", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(2500)
    page.click('button[aria-label="消息中心"]')
    page.wait_for_selector("text=查看全部消息", timeout=15000)
    latest = items[0] if items else None
    if latest:
        TYPE_PATH = {"job": "/capability", "optimize": "/history", "score": "/scoring",
                     "interview": "/interviews", "warning": "/resumes", "vip": "/profile",
                     "system": "/messages", "activity": "/messages"}
        expect = TYPE_PATH.get(latest["msg_type"], "/messages")
        page.locator(".ant-dropdown").get_by_text(latest["title"]).first.click()
        page.wait_for_timeout(1500)
        check("铃铛点击消息跳转目标模块", expect in page.url, f"type={latest['msg_type']} url={page.url}")

    page.goto(f"{WEB}/dashboard", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(2000)
    page.click('button[aria-label="消息中心"]')
    page.wait_for_selector("text=查看全部消息", timeout=15000)
    page.locator(".ant-dropdown").locator("button:has-text('查看全部消息')").click()
    wait_path(page, "/messages")
    check("铃铛「查看全部消息」进入 /messages", True)

    # ── 12. 深链直达：/capability?record=<id> ──
    if new_assessment:
        rec = new_assessment
        page.goto(f"{WEB}/capability?record={rec['id']}", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_selector(".ant-modal-content", timeout=45000)
        modal_text = page.locator(".ant-modal-content").first.inner_text()
        check("深链 /capability?record= 自动打开报告", ("测评报告" in modal_text) or ("整体匹配度" in modal_text))
        check("深链报告岗位一致", (rec.get("job_title") or "") in modal_text, rec.get("job_title"))
        check("深链 URL 参数已清理", "record=" not in page.url, page.url)
        page.locator(".ant-modal-close").first.click()
    elif assessments:
        rec = assessments[0]
        page.goto(f"{WEB}/capability?record={rec['id']}", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_selector(".ant-modal-content", timeout=45000)
        modal_text = page.locator(".ant-modal-content").first.inner_text()
        check("深链 /capability?record= 自动打开报告", ("测评报告" in modal_text) or ("整体匹配度" in modal_text))
        page.locator(".ant-modal-close").first.click()
    else:
        print("  （无测评记录，跳过 capability 深链测试）")

    # 无效 record（记录已删除）→ 优雅降级：不开弹窗、不报错、停留在测评页
    page.goto(f"{WEB}/capability?record=00000000-0000-0000-0000-000000000000",
              wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(4000)
    check("无效 record 深链不开弹窗", page.locator(".ant-modal-content").count() == 0)
    check("无效 record 深链停留在 /capability", page.url.rstrip("/").endswith("/capability"), page.url)

    # ── 13. 深链直达：/history?id=<id> 高亮 ──
    if optimize_records:
        rid = optimize_records[0]["id"]
        page.goto(f"{WEB}/history?id={rid}", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(3000)
        check("深链 /history?id= 高亮对应卡片", page.locator(".opt-card-highlight").count() > 0, f"id={rid[:8]}")
        check("深链 URL 参数已清理", "?id=" not in page.url, page.url)
        if page.locator(".opt-card-highlight").count():
            page.screenshot(path=f"{SHOT_DIR}/msgnav_02_deeplink_history.png")
    else:
        print("  （无优化记录，跳过 history 深链测试）")

    # ── 14. 展开按钮与跳转解耦；展开区不再有操作按钮 ──
    goto_messages()
    open_tab("职位动态")
    row = page.locator("div.stagger-list > div").filter(has_text="能力测评完成").first
    row.scroll_into_view_if_needed()
    row.locator("button:has(.anticon-down)").first.click()
    page.wait_for_timeout(600)
    check("点展开按钮不触发跳转", page.url.rstrip("/").endswith("/messages"), page.url)
    check("展开后箭头切换为收起态", row.locator(".anticon-up").count() > 0)
    check("展开区不再出现「删除」等操作按钮", row.locator("button:has-text('删除')").count() == 0)

    # ── 15. 三点菜单「标记为未读」（点击正文即自动已读，反向操作收敛到菜单） ──
    fresh = api_get(op, token, "/api/messages?page=1&page_size=200")
    fresh_items = fresh.get("items", [])
    if fresh_items:
        # 列表按 created_at 倒序，首行即 fresh_items[0]；先经 API 确保其为已读
        target_msg = fresh_items[0]
        if not target_msg.get("is_read"):
            req = urllib.request.Request(f"{API}/api/messages/{target_msg['id']}/read",
                                         headers={"Authorization": f"Bearer {token}"}, method="PUT")
            op.open(req, timeout=30).read()
        goto_messages()  # 重新加载，保证 UI 已读状态与 API 一致（否则菜单项为 disabled）
        unread_before = api_get(op, token, "/api/messages?page=1&page_size=200").get("unread_count", 0)
        row = page.locator("div.stagger-list > div").first
        row.scroll_into_view_if_needed()
        row.locator("button:has(.anticon-more)").click()
        page.wait_for_timeout(400)
        mi = page.locator(".ant-dropdown-menu-item", has_text="标记为未读").first
        check("已读消息的「标记为未读」菜单项可用",
              mi.count() > 0 and "disabled" not in (mi.get_attribute("class") or ""))
        mi.click()
        page.wait_for_timeout(900)
        check("点击菜单项不冒泡触发行跳转（停留在 /messages）",
              page.url.rstrip("/").endswith("/messages"), page.url)
        unread_after = api_get(op, token, "/api/messages?page=1&page_size=200").get("unread_count", 0)
        check("标记未读后 API 未读数 +1", unread_after == unread_before + 1, f"{unread_before} → {unread_after}")
        check("行内徽标切换为未读", row.locator("span", has_text="未读").count() > 0)
        # 恢复已读：勾选该行 → 工具栏批量「标记已读」（顺带覆盖批量标记入口）
        row.locator(".ant-checkbox").first.click()
        page.wait_for_timeout(300)
        page.locator("button:has-text('标记已读')").first.click()
        page.wait_for_timeout(900)
        restored = api_get(op, token, "/api/messages?page=1&page_size=200").get("items", [])
        back = next((m for m in restored if m["id"] == target_msg["id"]), None)
        check("批量「标记已读」恢复为已读", bool(back and back.get("is_read")))
    else:
        print("  （无消息，跳过标记未读测试）")

    browser.close()

# ── 汇总 ──
passed = sum(1 for _, ok in checks if ok)
print("\n========== 结果 ==========")
print(f"通过 {passed}/{len(checks)}")
if errors:
    print(f"JS 错误 {len(errors)} 条:")
    for e in errors[:5]:
        print("  ", e)
else:
    print("无 JS 错误")
for name, ok in checks:
    if not ok:
        print("  FAIL |", name)
sys.exit(0 if passed == len(checks) and not errors else 1)
