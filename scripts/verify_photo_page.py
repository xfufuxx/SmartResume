"""AI 职业照功能 E2E 回归（需 :3000/:8000 在线）。

覆盖：
1. /photo 页结构（Key 区 / 上传区 / 选项区 / 结果区）
2. API Key 保存 → localStorage 持久化 + 状态标签
3. 自拍上传 → 客户端压缩预览 + 尺寸文案
4. 生成按钮的禁用/启用条件（无图/无 Key 禁用）
5. 后端错误映射：无效 Key → invalid_key（直打 API，不消耗正常额度外的路径）
6. ThemeDrawer 职业照区：上传头像 → PUT /content + 重导出 → 详情接口可见 avatar
7. 清理：移除头像还原记录

注意：完整生成链路需要真实 Gemini Key 与上游网络，E2E 不覆盖（单测
test_ai_photo.py 已用 mock 覆盖 generate_professional_photo 全部分支）。
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
RECORD_ID = "9d65fbd1-d1be-4cbc-a64d-8b53001183f1"

#: 一张真实小 PNG（200×280 演示剪影，与后端 _DEMO_RESUME 同源），用作上传 fixture
AVATAR_PNG = Path(__file__).resolve().parent.parent / "generated-images" / "app-icon" / "demo-avatar.png"

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


def login(pw):
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(f"{BASE}/login", wait_until="load", timeout=90_000)
    page.wait_for_timeout(2_000)
    page.fill('input[placeholder="邮箱地址"]', EMAIL)
    page.fill('input[placeholder="密码"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60_000)
    # 从 localStorage 取 token 供 API 直调
    token = page.evaluate("() => localStorage.getItem('token')")
    return browser, page, token


def main() -> int:
    if not AVATAR_PNG.exists():
        print(f"[FATAL] 缺少上传 fixture：{AVATAR_PNG}")
        return 1

    with sync_playwright() as pw:
        browser, page, token = login(pw)

        # ── 1. /photo 页结构 ──
        page.goto(f"{BASE}/photo", wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_selector("text=Gemini API Key（自带）", timeout=60_000)
        check("photo 页渲染：Key 区", page.locator("text=Gemini API Key（自带）").count() > 0)
        check("photo 页渲染：上传区", page.locator("text=1. 上传自拍").count() > 0)
        check("photo 页渲染：选项区", page.locator("text=2. 生成选项").count() > 0)
        check("photo 页渲染：结果区", page.locator("text=3. 生成结果").count() > 0)
        check("photo 页渲染：无 Key 时显示未配置", page.locator('[data-testid="api-key-missing"]').count() > 0)

        # ── 2. API Key 保存 ──
        # 注意：不能用 text=保存 —— antd 会给两个汉字的按钮文本插空格（"保 存"），
        # 且提示文案"Key 仅保存在…"含"保存"子串会抢先匹配，点到文案上什么都不会发生。
        page.fill('input[placeholder="粘贴你的 Gemini API Key（AIza...）"]', "AIzaTestKeyForE2E")
        page.click('[data-testid="save-api-key"]')
        page.wait_for_timeout(800)
        stored = page.evaluate("() => localStorage.getItem('gemini_api_key')")
        check("Key 保存到 localStorage", stored == "AIzaTestKeyForE2E", f"got {stored!r}")
        check("Key 保存后显示已配置", page.locator('[data-testid="api-key-configured"]').count() > 0)

        # ── 3. 自拍上传 ──
        page.set_input_files("#photo-source-input", str(AVATAR_PNG))
        page.wait_for_timeout(1_500)
        check("上传后显示压缩预览", page.locator("text=已压缩").count() > 0)
        check("上传后显示换一张", page.locator("text=换一张").count() > 0)

        # ── 4. 生成按钮启用条件 ──
        gen_btn = page.locator("button", has_text="生成职业照").first
        check("有图有 Key → 生成按钮可用", gen_btn.is_enabled())

        # ── 5. 后端错误映射（无效 Key，直打 API） ──
        # 沙箱无外网时上游不可达（ProxyError→generate_failed），此时只验证
        # 「200 + 已知 error 字段 + 不静默崩溃」，invalid_key 精确映射留到
        # 有外网的环境/单测（test_ai_photo.py 已 mock 覆盖全部分支）。
        tiny_png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
            "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        st, body = api("POST", "/api/ai-photo/generate", {
            "image": tiny_png,
            "prompt": "test",
            "aspectRatio": "1:1",
            "apiKey": "AIzaInvalidKeyForErrorMappingTest",
        }, token=token)
        data = json.loads(body) if st == 200 else {}
        known_errors = {"invalid_key", "safety_filtered", "generate_failed", "quota_exceeded"}
        if data.get("error") == "invalid_key":
            check("无效 Key → error=invalid_key（200+error 字段）", True)
            # 额度退还：invalid_key 不计入当日次数（连打两次都应 invalid_key 而非 quota_exceeded）
            st2, body2 = api("POST", "/api/ai-photo/generate", {
                "image": tiny_png, "prompt": "test", "apiKey": "AIzaInvalidKeyForErrorMappingTest",
            }, token=token)
            data2 = json.loads(body2) if st2 == 200 else {}
            check("失败不占额度（第二次仍 invalid_key）",
                  data2.get("error") == "invalid_key", f"got {data2.get('error')}")
        else:
            check("上游不可达（沙箱无外网）→ 200 + 已知 error 字段（invalid_key 映射见单测）",
                  st == 200 and data.get("error") in known_errors,
                  f"st={st} body={body[:120]}")

        # ── 6. ThemeDrawer 职业照区 ──
        page.goto(f"{BASE}/history/{RECORD_ID}", wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_selector("text=简历内容对比", timeout=60_000)
        page.wait_for_timeout(1_200)
        page.locator("button", has_text="主题定制").first.click()
        page.wait_for_selector("text=职业照", timeout=30_000)
        check("抽屉：职业照区块渲染", page.locator("text=职业照").count() > 0)
        check("抽屉：上传照片按钮", page.locator("button", has_text="上传照片").count() > 0)
        check("抽屉：一寸照/圆形切换", page.locator("text=一寸照").count() > 0)

        # 记录原始 avatar（清理用）
        st, body = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
        original = (json.loads(body) if st == 200 else {}).get("optimized_json", {}).get("personal_info", {}).get("avatar")

        # 上传头像（隐藏 input 在抽屉内）
        avatar_input = page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').first
        avatar_input.set_input_files(str(AVATAR_PNG))
        page.wait_for_timeout(4_000)
        st, body = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
        after = (json.loads(body) if st == 200 else {}).get("optimized_json", {}).get("personal_info", {}).get("avatar")
        check("上传头像 → 落库 personal_info.avatar", bool(after) and after != original, f"after={str(after)[:40]}")
        check("上传后显示移除按钮", page.locator("button", has_text="移除").count() > 0)

        # 预览 iframe 里应出现头像图片（演示数据本身带头像，这里验证形状切换参数进 URL）
        frame = page.frame_locator('iframe[title="主题实时预览"]')
        try:
            frame.locator("img.tpl-avatar").first.wait_for(state="attached", timeout=15_000)
            check("预览 iframe 渲染职业照", True)
        except Exception:
            check("预览 iframe 渲染职业照", False, "img.tpl-avatar 未出现")

        # 切换圆形 → 预览 URL 带 avatar_style=circle
        page.locator("text=圆形").first.click()
        page.wait_for_timeout(1_500)
        src = page.locator('iframe[title="主题实时预览"]').first.get_attribute("src") or ""
        check("圆形切换 → 预览 URL 带 avatar_style=circle", "avatar_style=circle" in src, src[:120])

        # ── 7. 清理：移除头像还原 ──
        page.locator("button", has_text="移除").first.click()
        page.wait_for_timeout(4_000)
        st, body = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
        cleaned = (json.loads(body) if st == 200 else {}).get("optimized_json", {}).get("personal_info", {}).get("avatar")
        check("移除头像 → 还原", not cleaned, f"cleaned={str(cleaned)[:40]}")

        # 清掉 E2E 写入的 Key
        page.evaluate("() => localStorage.removeItem('gemini_api_key')")
        browser.close()

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
