"""AI 润色悬浮窗（PolishDock）E2E（需 :8000 + :3000 在线，Playwright）。

背景：AI 对话润色从独立 /polish 页改造为编辑器内悬浮窗；每次对话携带
编辑器当前草稿（context）刷新后端快照；简历导入 /import 模块整体移除。

覆盖：
1. /polish 与 /import 页面已下线（404）
2. HTTP：chat 请求携带 context（编辑器草稿）不再 422，SSE 正常出帧
3. UI：/history/{id} 编辑器页 FAB 可见 → 点击弹出对话面板 + 快捷问题
4. UI：会话自动定位（HTTP 层验证 list sessions 含 target_id 过滤依据）
5. 清理：删除 E2E 创建的会话

运行：.venv/Scripts/python.exe scripts/verify_polish_dock.py
"""
from __future__ import annotations

import json
import sys
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


def api(method: str, path: str, token: str, body: dict | None = None):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with _opener().open(req, timeout=60) as r:
            text = r.read().decode()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        return {"_status": e.code, "_body": e.read().decode()[:200]}


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


def read_sse_frames(token: str, body: dict) -> list[dict]:
    """读 SSE 流全部 data 帧（流结束后返回）"""
    req = urllib.request.Request(
        f"{API}/api/polish/chat",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    frames = []
    try:
        with _opener().open(req, timeout=120) as r:
            buf = ""
            while True:
                chunk = r.read(512)
                if not chunk:
                    break
                buf += chunk.decode("utf-8", errors="replace")
                while "\n\n" in buf:
                    frame, buf = buf.split("\n\n", 1)
                    line = next((l for l in frame.split("\n") if l.startswith("data:")), None)
                    if line:
                        try:
                            frames.append(json.loads(line[5:].strip()))
                        except json.JSONDecodeError:
                            pass
    except urllib.error.HTTPError as e:
        frames.append({"type": "_http_error", "code": e.code})
    return frames


def main() -> int:
    token, refresh, user = login()

    # ── 2. 准备：取一条优化记录 + 建会话 ──
    records = api("GET", "/api/optimize/", token)
    if isinstance(records, dict):
        records = records.get("data") or []
    if not isinstance(records, list) or not records:
        print("SKIP：演示账号无优化记录，UI 部分跳过")
        print(f"结果：{passed} PASS / {failed} FAIL")
        return 1 if failed else 0
    rec = records[0]
    rec_id, rec_title = rec["id"], (rec.get("job_title") or "简历记录")
    print(f"准备：优化记录 {rec_title} id={rec_id}")

    sess = api("POST", "/api/polish/sessions", token,
               {"target_type": "optimized", "target_id": rec_id})
    sid = sess.get("id")
    check("创建会话成功", bool(sid), json.dumps(sess, ensure_ascii=False)[:120])

    # ── 3. chat 携带 context（编辑器草稿）→ 不 422、出 SSE 帧 ──
    draft_context = {
        "summary": "6 年 Java 后端，主导过日均千万请求的订单系统重构",
        "experience": [{"title": "后端工程师", "points": ["负责订单服务稳定性建设"]}],
    }
    frames = read_sse_frames(token, {"session_id": sid, "message": "测试：请忽略本条消息", "context": draft_context})
    has_http_err = any(f.get("type") == "_http_error" for f in frames)
    check("chat 携带 context 不被 422 拒绝", not has_http_err, str(frames[:2]))
    known = [f for f in frames if f.get("type") in ("delta", "suggestions", "done", "error")]
    check("SSE 正常出帧（delta/done/error 任一）", bool(known), str([f.get('type') for f in frames[:4]]))

    # ── 4. list sessions 含 target_id（悬浮窗按记录过滤的依据） ──
    sessions = api("GET", "/api/polish/sessions", token)
    mine = [s for s in (sessions if isinstance(sessions, list) else [])
            if s.get("target_type") == "optimized" and s.get("target_id") == rec_id]
    check("会话列表含 target_id 可按记录过滤", bool(mine), f"mine={len(mine)}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        inject_auth(page, token, refresh, user)

        # ── 5. 编辑器页 FAB + 面板 ──
        page.goto(f"{BASE}/history/{rec_id}", wait_until="domcontentloaded")
        fab = page.locator('[data-testid="polish-dock-fab"]')
        fab.wait_for(state="visible", timeout=15000)
        check("编辑器页 FAB 可见", fab.is_visible())
        fab.click()
        panel = page.locator('[data-testid="polish-dock-panel"]')
        panel.wait_for(state="visible", timeout=8000)
        check("点击 FAB 弹出对话面板", panel.is_visible())
        # 会话自动续接：此前 HTTP 层已在同记录会话里发过测试消息 → 应自动加载出历史气泡
        page.wait_for_selector(".polish-dock-msg", timeout=10000)
        check("自动续接记录的历史会话并加载消息", page.locator(".polish-dock-msg").count() >= 1)
        # 开新对话 → 空会话渲染快捷问题引导
        page.locator('[data-testid="polish-dock-new"]').click()
        page.wait_for_selector(".polish-dock-quick-btn", timeout=8000)
        quick = page.locator(".polish-dock-quick-btn")
        check("新对话空态显示快捷问题引导", quick.count() >= 3, f"count={quick.count()}")
        # 输入框与发送按钮就位
        check("输入框与发送按钮就位",
              page.locator('[data-testid="polish-dock-input"]').is_visible()
              and page.locator('[data-testid="polish-dock-send"]').is_visible())
        # 再次点击 FAB 收起
        fab.click()
        page.wait_for_timeout(400)
        check("再次点击 FAB 收起面板", not panel.is_visible())

        # ── 6. 旧页面下线（带凭证访问，排除 middleware 307 干扰） ──
        for dead in ("/polish", "/import"):
            page.goto(f"{BASE}{dead}", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            content = page.content()
            check(f"{dead} 页面已下线（404 页）", "404" in content, content[:80].replace("\n", " "))

        browser.close()

    # ── 清理：删除本记录的全部测试会话（含 UI 中「开新对话」创建的） ──
    sessions = api("GET", "/api/polish/sessions", token)
    cleaned = 0
    for s in (sessions if isinstance(sessions, list) else []):
        if s.get("target_type") == "optimized" and s.get("target_id") == rec_id:
            api("DELETE", f"/api/polish/sessions/{s['id']}", token)
            cleaned += 1
    print(f"清理：已删除 {cleaned} 个测试会话")

    print(f"\n结果：{passed} PASS / {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
