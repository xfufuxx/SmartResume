"""匹配罗盘「未解析岗位 → 去处理」深链直达具体岗位 E2E（需 :8000 + :3000 在线）。

背景：罗盘提示条只写了岗位名，点击只跳 /jobs 岗位库，用户仍要自己翻找。
修复 = 深链 /jobs?focus=<job_id>：岗位库按 id 定位 → 打开该岗位预览弹窗
+ 翻到所在分页 + 高亮该行（呼吸动画）。

覆盖：
1. API 层：/api/matching/rank 的 skipped_items 携带 job_id/title/company 明细
2. UI 层：/match 提示条出现未解析岗位 Tag（含「去处理」）
3. 点击 Tag → URL 变为 /jobs?focus=<job_id>（不再是只有搜索词的旧深链）
4. 岗位库自动打开该岗位的预览弹窗，标题即目标岗位
5. 表格行 tr[data-row-key] 带高亮类 job-row-highlight
6. 清理：删除 E2E 造的岗位（软删进回收站，不污染演示数据）

运行：.venv/Scripts/python.exe scripts/verify_match_focus_deeplink.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000"
BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

passed, failed = 0, 0


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


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with _opener().open(req, timeout=30) as r:
        text = r.read().decode()
    return json.loads(text) if text else {}


def login() -> tuple[str, str, dict]:
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with _opener().open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"], body["refresh_token"], body.get("user", {})


def inject_auth(page, token: str, refresh: str, user: dict) -> None:
    """与 verify_auth_gate.py 同款：localStorage init script + cookie 预置。"""
    kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user) if user else None}
    page.add_init_script(
        "(() => { const kv = %s; localStorage.clear();"
        " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
        % json.dumps(kv)
    )
    page.context.add_cookies([
        {"name": "sr-token", "value": token, "url": BASE},
        {"name": "sr-refresh", "value": refresh, "url": BASE},
    ])


def main() -> int:
    token, refresh, user = login()
    stamp = time.strftime("%H%M%S")
    title = f"深链定位验证岗-E2E-{stamp}"

    # 造一个未解析岗位（不带 parsed_job_json）
    job = api("POST", "/api/jobs/create", token, {"title": title, "company": "E2E测试公司"})
    job_id = job["id"]
    print(f"准备：未解析岗位 {title} id={job_id}")

    try:
        # ── 1. API 层：rank 返回 skipped_items 明细 ──
        raw = api("GET", "/api/resumes/", token)
        resumes = raw.get("data") if isinstance(raw, dict) else raw
        if isinstance(resumes, dict):
            resumes = resumes.get("items") or []
        parsed = [r for r in resumes if r.get("parsed_json")]
        check("存在已解析简历可排名", bool(parsed), f"resumes={len(resumes)}")
        if parsed:
            rank = api("POST", "/api/match/rank", token, {"resume_id": parsed[0]["id"]})
            skipped = rank.get("skipped_items") or []
            hit = [s for s in skipped if s.get("job_id") == job_id]
            check("rank.skipped_jobs>0 且包含新造岗位", rank.get("skipped_jobs", 0) > 0 and bool(hit),
                  f"skipped_jobs={rank.get('skipped_jobs')} hit={bool(hit)}")
            if hit:
                check("skipped_items 明细含 title/company",
                      hit[0].get("title") == title and hit[0].get("company") == "E2E测试公司",
                      json.dumps(hit[0], ensure_ascii=False))

        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            inject_auth(page, token, refresh, user)

            # ── 2/3. /match 提示条出现 Tag 并点击 → 落到 /jobs?focus=<id> ──
            page.goto(f"{BASE}/match", wait_until="domcontentloaded")
            page.wait_for_timeout(3500)  # 等自动排名完成
            tag = page.locator(".ant-alert .ant-tag", has_text="去处理").first
            tag_visible = tag.is_visible()
            check("罗盘提示条出现「去处理」Tag", tag_visible)
            if tag_visible:
                check("Tag 文案含岗位名", title in (tag.text_content() or ""),
                      tag.text_content() or "")
                tag.click()
                page.wait_for_url("**/jobs?focus=*", timeout=8000)
                check("点击后 URL 为 /jobs?focus=<job_id>",
                      f"/jobs?focus={job_id}" in page.url, page.url)

            # ── 4. 岗位库自动打开预览弹窗 ──
            if not tag_visible:
                # 兜底：直接访问深链（不影响断言有效性，Modal 行为同链路）
                page.goto(f"{BASE}/jobs?focus={job_id}", wait_until="domcontentloaded")
            page.wait_for_selector(".ant-modal:visible", timeout=8000)
            modal_text = page.locator(".ant-modal:visible").first.text_content() or ""
            check("预览弹窗自动打开且为目标岗位", title in modal_text, modal_text[:120])

            # ── 5. 高亮行 ──
            row = page.locator(f'tr[data-row-key="{job_id}"]')
            row_ok = row.count() > 0 and "job-row-highlight" in (row.first.get_attribute("class") or "")
            check("表格目标行带 job-row-highlight 高亮类", row_ok)

            browser.close()
    finally:
        # 清理：软删进回收站
        try:
            api("POST", f"/api/jobs/{job_id}/trash", token)
            print("清理：岗位已移入回收站")
        except Exception as e:  # noqa: BLE001
            print(f"清理失败（可手动删除）: {e}")

    print(f"\n结果：{passed} PASS / {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
