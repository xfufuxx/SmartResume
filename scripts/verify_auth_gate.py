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
6. C 方案：localStorage 有票但无 cookie 镜像 → middleware 前置拦截到
   /login?next=/（业务 HTML 不出厂）
7. C 方案 next 闭环：深链 /profile 被拦 → 登录后落回 /profile，
   cookie 票写入，刷新不再被拦

运行：.venv/Scripts/python.exe scripts/verify_auth_gate.py
"""
from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse

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


def set_storage(page, token: str | None, refresh: str | None, user: dict | None,
                cookie: bool = True) -> None:
    """注入登录态（模拟重启后的本地状态）。
    - localStorage 走 add_init_script（客户端脚本，导航后、hydration 前写入）；
    - cookie 走 context.add_cookies **请求前预置**——middleware 是服务端，
      首趟请求就必须看到票，init script 写的 cookie 对当次请求无效（后置执行）。
    注：playwright 的 add_init_script 只接受单个 script 参数，数据需
    json.dumps 编码进脚本文本。"""
    kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user) if user else None}
    page.add_init_script(
        "(() => { const kv = %s; localStorage.clear();"
        " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
        % json.dumps(kv)
    )
    if cookie:
        cookies = []
        if token:
            cookies.append({"name": "sr-token", "value": token, "url": BASE})
        if refresh:
            cookies.append({"name": "sr-refresh", "value": refresh, "url": BASE})
        if cookies:
            page.context.add_cookies(cookies)


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
        # 注：storage 清空由 auth.test.ts 单测覆盖（init script 会在每次导航时
        # 重写 localStorage，E2E 层无法观测清除动作），此处只验证跳转结果。
        page = browser.new_page()
        set_storage(page, expired, "invalid-refresh-token", user)
        page.goto(f"{BASE}/", wait_until="commit")
        try:
            page.wait_for_url("**/login**", timeout=20000)
            landed = True
        except Exception:
            landed = False
        check("S4 refresh 无效 → 跳 /login", landed, f"URL={page.url}")
        page.close()

        # ── 场景 5：完全无凭证 ──
        page = browser.new_page()
        page.goto(f"{BASE}/", wait_until="commit")
        flashed, final_url = watch_flash(page)
        check("S5 空 localStorage → 跳 /login", "/login" in final_url, f"URL={final_url}")
        check("S5 业务页骨架从未闪现", not flashed, f"URL={final_url}")
        page.close()

        # ── 场景 6（C 方案）：localStorage 有票但 cookie 未镜像 ──
        # middleware 只认 cookie：应被前置拦截到 /login?next=/profile（业务 HTML
        # 不出厂）。随后 login 页会 syncAuthCookie 补票并自动弹回 /profile
        # （存量用户兜底，设计行为）。访问带路径的深链以验证 next 参数。
        page = browser.new_page()
        set_storage(page, access, refresh, user, cookie=False)
        page.goto(f"{BASE}/profile", wait_until="commit")
        first_login_url = None
        deadline = time.time() + 15
        while time.time() < deadline:
            u = page.url
            if "/login" in u:
                first_login_url = u
                break
            time.sleep(0.05)
        check("S6 无 cookie → middleware 前置拦截到 /login", first_login_url is not None,
              f"URL={page.url}")
        # next 参数在 URL 中会被编码（next=%2Fprofile），用 parse_qs 解析
        next_val = ""
        if first_login_url:
            parsed = urlparse(first_login_url)
            next_val = parse_qs(parsed.query).get("next", [""])[0]
        check("S6 拦截带 next 深链参数", next_val == "/profile",
              f"首次登录 URL={first_login_url} next={next_val!r}")
        page.close()

        # ── 场景 7（C 方案 next 闭环）：深链被拦 → 登录后落回原页面 ──
        page = browser.new_page()
        page.goto(f"{BASE}/profile", wait_until="commit")
        try:
            page.wait_for_url("**/login**", timeout=20000)
            landed_login = True
        except Exception:
            landed_login = False
        check("S7 深链 /profile 被拦到 /login", landed_login, f"URL={page.url}")
        page.fill('input[placeholder="邮箱地址"]', EMAIL)
        page.fill('input[placeholder="密码"]', PASSWORD)
        page.click('button[type="submit"]')
        try:
            page.wait_for_url("**/profile**", timeout=30000)
            back = True
        except Exception:
            back = False
        check("S7 登录后落回 /profile（next 闭环）", back, f"URL={page.url}")
        cookie_has_ticket = page.evaluate("document.cookie.includes('sr-token=')")
        check("S7 登录后 cookie 票已写入", cookie_has_ticket)
        page.reload()
        page.wait_for_timeout(3000)
        check("S7 刷新后仍在 /profile（cookie 生效不被再拦）", "/profile" in page.url,
              f"URL={page.url}")
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
