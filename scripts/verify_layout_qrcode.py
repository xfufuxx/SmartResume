"""排版模式二维码 E2E（需 :8000 + :3000 + Redis 在线，Playwright）。

背景：模板导出走 qr_footer.py 注入（文档流页脚），排版模式是**绝对定位画布**，
二维码必须作为独立块才能所见即所得——否则「详情页显示已添加二维码、排版画布
和排版 PDF 里却没有」。本脚本端到端守住两条路径：

A. 简历已有二维码（模板路径加过）→ 打开排版自动带出二维码块（无需重新插入）
B. 简历没有二维码 → 工具栏插入 → 画布出现块 → 导出 PDF → PyMuPDF 断言
   PDF 含二维码图片与标签文字 → 且二维码同步回 optimized_json.qr_code
   （模板导出与排版同源，不出现「一边有一边没有」）

运行：.venv/Scripts/python.exe scripts/verify_layout_qrcode.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from urllib.request import ProxyHandler

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000"
BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
QR_URL = "https://smart-resume.example.com/me"
QR_LABEL = "排版二维码"

passed = failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}" + (f" | {detail}" if detail else ""))
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def opener():
    return urllib.request.build_opener(ProxyHandler({}))


def api(path: str, token: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"{API}{path}", data=data, method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with opener().open(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def login() -> tuple[str, str, dict]:
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST", headers={"Content-Type": "application/json"},
    )
    with opener().open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"], body["refresh_token"], body.get("user", {})


def set_storage(page, token: str, refresh: str, user: dict) -> None:
    kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user)}
    page.add_init_script(
        "(() => { const kv = %s; localStorage.clear();"
        " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
        % json.dumps(kv)
    )
    page.context.add_cookies([
        {"name": "sr-token", "value": token, "url": BASE},
        {"name": "sr-refresh", "value": refresh, "url": BASE},
    ])


def enter_editor(page, opt_id: str) -> bool:
    """打开历史详情 → 进入可视化排版编辑器"""
    page.goto(f"{BASE}/history/{opt_id}", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    entry = page.get_by_role("button", name="可视化排版").first
    if entry.count() == 0:
        entry = page.get_by_text("可视化排版").first
    entry.click()
    try:
        page.wait_for_selector(".le-layout", timeout=30000)
    except Exception:  # noqa: BLE001
        return False
    page.wait_for_timeout(1200)
    return page.locator(".le-toolbar").count() > 0


def insert_qr(page) -> None:
    """工具栏 → 二维码弹窗 → 输入链接/标签 → 插入"""
    page.get_by_role("button", name="二维码").first.click()
    page.wait_for_selector(".ant-modal-content", timeout=15000)
    modal = page.locator(".ant-modal-content")
    # 卡片里「标签」框在前、「链接地址」框在后——按 placeholder 定位，别按序号
    modal.locator("input[placeholder*='链接']").first.fill(QR_URL)
    page.wait_for_timeout(1200)  # 防抖 400ms + canvas 栅格化
    label_input = modal.locator("input[placeholder*='岗位名称'], input[placeholder*='GitHub']").first
    if label_input.count() > 0:
        label_input.fill(QR_LABEL)
    btn = modal.get_by_role("button", name="插入到画布").first
    if btn.count() == 0:
        btn = modal.get_by_role("button", name="添加到简历底部").first
    btn.click()
    page.wait_for_timeout(1500)


def export_pdf(page, opt_id: str, token: str, before_url: str) -> tuple[bool, str, str]:
    """点导出 → 处理校验弹窗 → 等 pdf_url 变化。返回 (是否换了新的 PDF, 新 url, 提示文案)

    判定用后端记录的 pdf_url 是否换新，而不是读 message：
    页面上可能残留上一步（插入二维码）的成功提示，读 notice 会误判。
    """
    page.get_by_role("button", name="导出 PDF").first.click()
    page.wait_for_timeout(1500)
    # 导出前校验弹窗：ValidationDialog 是 antd Modal（.ant-modal-footer），
    # 模板切换等场景是 Modal.confirm（.ant-modal-confirm-btns）——两种都兜。
    for sel in (".ant-modal-footer button.ant-btn-primary", ".ant-modal-confirm-btns button.ant-btn-primary"):
        btn = page.locator(sel).first
        if btn.count() > 0:
            print("   [info] 命中导出校验弹窗，确认继续")
            btn.click()
            break
    deadline = time.time() + 180
    while time.time() < deadline:
        cur = api(f"/api/optimize/{opt_id}", token).get("pdf_url") or ""
        if cur and cur != before_url:
            return True, cur, "pdf_url 已更新"
        time.sleep(4)
    try:
        notice = page.locator(".ant-message-notice").first.inner_text().replace("\n", " ")
    except Exception:  # noqa: BLE001
        notice = "无提示"
    return False, "", notice[:100]


def main() -> int:
    token, refresh, user = login()

    records = api("/api/optimize/", token)
    items = records if isinstance(records, list) else (records.get("items") or [])
    with_qr = next((r for r in items if (r.get("optimized_json") or {}).get("qr_code")), None)
    without_qr = next((r for r in items if not (r.get("optimized_json") or {}).get("qr_code")), None)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        set_storage(page, token, refresh, user)

        # ── A. 已有二维码 → 打开排版自动带出 ──
        if with_qr:
            opt_id = with_qr["id"]
            check("A 进入排版编辑器", enter_editor(page, opt_id), f"opt={opt_id[:8]}")
            locate = page.get_by_role("button", name="定位二维码").first
            check("A 工具栏按钮变为「定位二维码」（画布已有，防重复插入）", locate.count() == 1)
            if locate.count() > 0:
                locate.click()
                page.wait_for_timeout(900)
            blocks = page.locator(".lk-blk.lk-qrcode")
            check("A 定位后画布可见二维码块（自动带出）", blocks.count() == 1, f"count={blocks.count()}")
            src = ""
            if blocks.count() > 0:
                src = blocks.locator("img.lk-qrcode-img").first.get_attribute("src") or ""
            check("A 二维码块有图片 data URL", src.startswith("data:image/"), src[:32])
            if blocks.count() > 0:
                blocks.first.click()
            page.wait_for_timeout(600)
            check("A 属性面板有「更换二维码」", page.get_by_role("button", name="更换二维码").count() > 0)
            check(
                "A 二维码块无行内编辑（图片结构不可编辑）",
                page.get_by_role("button", name="编辑内容（双击区块）").count() == 0,
            )
        else:
            check("A 存在已带二维码的记录", False, "演示数据里没有 qr_code 记录")

        # ── B. 无二维码 → 插入 → 导出 ──
        if without_qr:
            opt_id = without_qr["id"]
            check("B 进入排版编辑器", enter_editor(page, opt_id), f"opt={opt_id[:8]}")
            check(
                "B 工具栏插入入口可用",
                not page.get_by_role("button", name="二维码").first.is_disabled(),
            )
            insert_qr(page)
            blocks = page.locator(".lk-blk.lk-qrcode")
            check("B 插入后画布出现二维码块", blocks.count() == 1, f"count={blocks.count()}")
            src = ""
            if blocks.count() > 0:
                src = blocks.locator("img.lk-qrcode-img").first.get_attribute("src") or ""
            check("B 二维码块渲染图片", src.startswith("data:image/"), src[:32])

            before = (api(f"/api/optimize/{opt_id}", token).get("pdf_url") or "")
            ok_export, new_url, notice = export_pdf(page, opt_id, token, before)
            check("B 导出排版 PDF 成功（pdf_url 换新）", ok_export, notice[:80])
        else:
            check("B 存在无二维码的记录", False, "演示数据全带 qr_code")

        browser.close()

    # ── PDF 断言 + 同步闭环 ──
    if without_qr:
        import fitz

        saved = api(f"/api/optimize/{without_qr['id']}", token)
        pdf_url = (api(f"/api/optimize/{without_qr['id']}", token).get("pdf_url") or "")
        check("B 导出后记录有 pdf_url", bool(pdf_url), pdf_url[:60])
        if pdf_url:
            raw = opener().open(pdf_url, timeout=120).read()
            doc = fitz.open(stream=raw, filetype="pdf")
            imgs = [img for pg in doc for img in pg.get_images(full=True)]
            text = "".join(pg.get_text() for pg in doc)
            pages = doc.page_count
            doc.close()
            check("B 排版 PDF 含二维码图片", len(imgs) > 0, f"images={len(imgs)} pages={pages}")
            check("B 排版 PDF 含二维码标签文字", QR_LABEL in text)

            # 1:1 位置：PDF 里图片的左上角应与画布块的 mm 坐标一致（mm → pt）
            layout = saved.get("layout_json") or {}
            blk = next((b for b in (layout.get("blocks") or []) if b.get("type") == "qrcode"), None)
            if blk:
                rect = blk.get("rect") or {}
                doc = fitz.open(stream=raw, filetype="pdf")
                pg = doc[min(blk.get("page") or 0, doc.page_count - 1)]
                rects = [pg.get_image_rects(i[0]) for i in pg.get_images(full=True)]
                flat = [r for rs in rects for r in rs]
                doc.close()
                if flat:
                    dx = abs(flat[0].x0 - rect.get("x", 0) * 72 / 25.4)
                    dy = abs(flat[0].y0 - rect.get("y", 0) * 72 / 25.4)
                    check(
                        "B 二维码位置与画布一致（1:1，误差 < 2mm）",
                        dx < 5.7 and dy < 5.7,
                        f"dx={dx:.1f}pt dy={dy:.1f}pt block=({rect.get('x')},{rect.get('y')})mm",
                    )
                else:
                    check("B 二维码位置与画布一致（1:1，误差 < 2mm）", False, "页面无图片 bbox")
            else:
                check("B 布局存档含二维码块", False, "layout_json 无 qrcode 块")

        qr = (saved.get("optimized_json") or {}).get("qr_code") or {}
        check("B 二维码同步回 optimized_json.qr_code", bool(qr.get("image")), f"label={qr.get('label')!r}")

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
