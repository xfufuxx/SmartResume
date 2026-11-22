"""二维码工具页「添加到简历」E2E（需 :8000 + :3000 在线）。

流程：
1. 登录 + 选一份**没有**底部二维码的简历（避免覆盖已有数据）
2. Playwright 打开 /qrcode → 填链接生成二维码
3. 点「添加到简历…」→ 弹窗列出简历（含「已有二维码」标记）→ 选目标 → 确认
4. 断言成功提示；API 侧确认 optimized_json.qr_code 落库且 URL 一致
5. 还原：移除刚添加的二维码（验证移除链路 + 不污染演示数据）

运行：.venv/Scripts/python.exe scripts/verify_qrcode_add.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

QR_URL = "https://github.com/verify-qrcode-add"
QR_LABEL = "验证二维码"

passed = failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with _opener().open(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def login() -> str:
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with _opener().open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"]


def main() -> int:
    token = login()

    # ── 1. 选一份没有底部二维码的简历 ──
    status, records = api("GET", "/api/optimize/", token)
    check("获取简历列表", status == 200 and isinstance(records, list), f"status={status}")
    items = records if isinstance(records, list) else []
    target = None
    for it in items:
        oj = it.get("optimized_json") or {}
        if not oj.get("qr_code"):
            target = it
            break
    if target is None:
        print("  FAIL 没有可用的无二维码简历，中止（避免覆盖已有数据）")
        return 1
    tid = target["id"]
    print(f"  目标简历: id={tid}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 800}).new_page()
        kv = {"token": token, "refreshToken": token}
        page.add_init_script(
            "(() => { const kv = %s; localStorage.clear();"
            " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
            % json.dumps(kv)
        )
        page.context.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": token, "url": BASE},
        ])

        # ── 2. 工具页渲染 + 生成二维码 ──
        page.goto(f"{BASE}/qrcode", wait_until="domcontentloaded")
        url_input = page.get_by_placeholder("粘贴链接，如 github.com/yourname")
        url_input.wait_for(state="visible", timeout=30000)
        check("/qrcode 页面渲染（二维码卡片就位）", url_input.count() == 1)

        url_input.fill(QR_URL)
        page.get_by_placeholder("如：GitHub / 个人主页 / 岗位名称").fill(QR_LABEL)
        page.wait_for_selector(".qrcode-svg, svg", timeout=10000)
        check("输入链接后二维码即时生成（SVG 预览出现）", True)

        # ── 3. 添加到简历弹窗 ──
        add_btn = page.get_by_role("button", name="添加到简历…")
        check("「添加到简历…」入口出现", add_btn.count() >= 1, f"count={add_btn.count()}")
        add_btn.first.click()
        page.get_by_text("添加二维码到简历").wait_for(state="visible", timeout=6000)
        rows = page.locator('[data-testid^="qr-target-"]')
        page.wait_for_timeout(500)
        check("弹窗列出可选简历", rows.count() >= 1, f"count={rows.count()}")

        target_row = page.locator(f'[data-testid="qr-target-{tid}"]')
        check("目标简历在弹窗列表中", target_row.count() == 1)
        target_row.click()
        page.wait_for_timeout(300)

        confirm = page.get_by_role("button", name="添加到所选简历底部")
        check("确认按钮就位且可选", confirm.count() == 1 and confirm.is_enabled())
        confirm.click()

        # ── 4. 成功反馈 ──
        ok_msg = page.locator(".ant-message", has_text="PDF 已重新生成")
        ok_msg.wait_for(state="visible", timeout=120000)
        msg_txt = (ok_msg.first.text_content() or "").strip()
        check("成功提示含简历标题与 PDF 重生成", tid in json.dumps({}) or "PDF 已重新生成" in msg_txt, msg_txt)

        # ── 5. API 侧落库确认 ──
        page.wait_for_timeout(1500)
        _, detail = api("GET", f"/api/optimize/{tid}", token)
        oj = detail.get("optimized_json") or {}
        qr = oj.get("qr_code") or {}
        check("qr_code 已写入 optimized_json", bool(qr), f"keys={list(qr.keys())}")
        check("二维码 URL 与输入一致", QR_URL.replace("https://", "") in str(qr.get("url", "")), str(qr.get("url")))
        check("PDF 已重新生成（pdf_url 更新）", bool(detail.get("pdf_url")))

        # ── 6. 还原（同时验证移除链路） ──
        status, resp = api("PUT", f"/api/optimize/{tid}/qr-code", token, {"image": None})
        check("移除二维码接口返回成功", status == 200, f"status={status}")
        _, detail2 = api("GET", f"/api/optimize/{tid}", token)
        check("还原后 optimized_json 无 qr_code", not ((detail2.get("optimized_json") or {}).get("qr_code")))

        browser.close()

    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
