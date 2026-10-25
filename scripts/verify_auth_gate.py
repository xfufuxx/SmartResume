"""全局鉴权门 E2E（需 :8000 + :3000 在线，Playwright）。

背景：重启服务/离开一段时间后打开前端，「先显示优化主界面几秒再跳走」+
「access 一过期就被迫完整重登」。修复 = AuthGatekeeper 全局门（A）+ 静默刷新（B）。

覆盖：
1. 无凭证访问 / → 直达 /login，且业务页骨架（「立即优化」）从未出现（治闪屏）
2. 有效 token → 优化页正常渲染并稳定停留
3. access 过期 + refresh 有效 → 静默刷新自动恢复，不清场、不跳转，
   且双 token 已轮换写回（核心：B 让「记住我 7 天」生效）
4. access 过期 + refresh 无效 → 清场跳 /login，localStorage 被清空
5. 完全无凭证（连 refresh 也没有）→ 跳 /login

运行：.venv/Scripts/python.exe scripts/verify_auth_gate.py
"""
from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000"
BASE = "http://127.0.0.1:3000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
HOME_MARKER = "text=AI 简历优化"      # 优化页 h1（业务页骨架的标志）
PAGE_MARKER = "text=立即优化"          # 业务页内容标志（用于闪现检测）
GATE_LOADING = '[data-testid="auth-gate-loading"]'

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


def login() -> tuple[str, str, dict]:
    """真实登录拿 access + refresh token"""
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with _opener().open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"], body["refresh_token"], body.get("user", {})


def fake_expired_access(user_id: str) -> str:
    """手搓一个已过期的 access token（前端只 atob 解 exp，不验签）"""
    def b64(o) -> str:
        return base64.b64encode(json.dumps(o).encode()).decode().rstrip("=")
    header = b64({"alg": "HS256", "typ": "JWT"})
    payload = b64({"sub": user_id, "exp": int(time.time()) - 3600, "type": "access"})
    return f"{header}.{payload}.fake-signature"


def jwt_exp(token: str) -> int | None:
    try:
        pad = token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
        return json.loads(base64.b64decode(pad)).get("exp")
    except Exception:
        return None


def set_storage(page, token: str | None, refresh: str | None, user: dict | None) -> None:
    """add_init_script 在每次导航时注入 localStorage（模拟重启后的本地状态）。
    注：当前 playwright 版本的 add_init_script 只接受单个 script 参数，
    arg 需编码进脚本文本（json.dumps 保证字符串转义安全）。"""
    kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user) if user else None}
    page.add_init_script(
        "(() => { const kv = %s; localStorage.clear();"
        " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
        % json.dumps(kv)
    )


def watch_flash(page, timeout: float = 15.0) -> tuple[bool, str]:
    """
    跳转闪烁检测：从导航提交起持续轮询，若业务页标志（「立即优化」）先于
    /login 跳转出现，说明鉴权门没兜住（旧版故障现象）。
    返回 (是否闪过业务页, 最终 URL)。
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        url = page.url
        if "/login" in url:
            return False, url
        try:
            if page.locator(PAGE_MARKER).count() > 0:
                return True, url
        except Exception:
            pass
        time.sleep(0.05)
    return False, page.url


def wait_home(page, timeout: float = 25.0) -> bool:
    """等待优化页渲染出来（门放行 + hydration 完成）"""
    try:
        page.wait_for_selector(HOME_MARKER, timeout=timeout * 1000)
        return True
    except Exception:
        return False


def main() -> int:
    access, refresh, user = login()
    user_id = user.get("id") or ""
    print(f"[setup] 登录成功 user_id={user_id[:8]}… access TTL {jwt_exp(access) - int(time.time())}s")

    # 预热前端路由（dev server 冷编译可超 90s，先触发编译再进浏览器）
    try:
        _opener().open(f"{BASE}/", timeout=90).read()
    except Exception as e:
        print(f"[warn] 预热 / 失败: {e}")

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── 场景 1：无凭证 → 直达 /login，业务页骨架不闪现 ──
        page = browser.new_page()
        page.goto(f"{BASE}/", wait_until="commit")
        flashed, final_url = watch_flash(page)
        check("S1 无凭证访问 / → 跳 /login", "/login" in final_url, f"最终 URL={final_url}")
        check("S1 业务页骨架从未闪现（治闪屏）", not flashed, f"闪现值={flashed} URL={final_url}")
        page.close()

        # ── 场景 2：有效 token → 优化页稳定渲染 ──
        page = browser.new_page()
        set_storage(page, access, refresh, user)
        page.goto(f"{BASE}/")
        ok = wait_home(page)
        check("S2 有效 token → 优化页渲染", ok, f"URL={page.url}")
        time.sleep(2)
        check("S2 停留稳定不跳走", "/login" not in page.url, f"URL={page.url}")
        check("S2 鉴权门 loading 已消失", page.locator(GATE_LOADING).count() == 0)
        page.close()

        # ── 场景 3（核心）：access 过期 + refresh 有效 → 静默刷新自动恢复 ──
        expired = fake_expired_access(user_id)
        page = browser.new_page()
        set_storage(page, expired, refresh, user)
        page.goto(f"{BASE}/", wait_until="commit")
        ok = wait_home(page, timeout=30)
        check("S3 access 过期+refresh 有效 → 自动恢复优化页", ok,
              f"URL={page.url}（若为 /login 说明静默刷新失败）")
        check("S3 未被踢去 /login", "/login" not in page.url, f"URL={page.url}")
        new_token = page.evaluate("localStorage.getItem('token')")
        check("S3 token 已轮换（不再是过期假 token）", new_token and new_token != expired,
              f"new={'yes' if new_token else 'no'}")
        check("S3 新 token 未过期", bool(new_token) and (jwt_exp(new_token) or 0) > int(time.time()),
              f"exp={jwt_exp(new_token)}")
        new_refresh = page.evaluate("localStorage.getItem('refreshToken')")
        check("S3 refresh token 已轮换", new_refresh and new_refresh != refresh)
        page.close()

        # ── 场景 4：access 过期 + refresh 无效 → 清场跳 /login ──
        page = browser.new_page()
        set_storage(page, expired, "invalid-refresh-token", user)
        page.goto(f"{BASE}/", wait_until="commit")
        try:
            page.wait_for_url("**/login**", timeout=20000)
            landed = True
        except Exception:
            landed = False
        check("S4 refresh 无效 → 跳 /login", landed, f"URL={page.url}")
        left = page.evaluate(
            "() => ({t: localStorage.getItem('token'), r: localStorage.getItem('refreshToken')})")
        check("S4 登录态已清空", not left["t"] and not left["r"], f"left={left}")
        page.close()

        # ── 场景 5：完全无凭证 ──
        page = browser.new_page()
        page.goto(f"{BASE}/", wait_until="commit")
        flashed, final_url = watch_flash(page)
        check("S5 空 localStorage → 跳 /login", "/login" in final_url, f"URL={final_url}")
        check("S5 业务页骨架从未闪现", not flashed, f"URL={final_url}")
        page.close()

        browser.close()

    print(f"\n{'=' * 48}")
    print(f"结果: {passed} passed / {failed} failed")
    if failed == 0:
        print("ALL PASSED")
        return 0
    print("ALL FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
