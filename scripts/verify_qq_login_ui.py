"""QQ 登录前端 E2E 验证（Playwright，真实浏览器）。

覆盖：
  1. 登录页 QQ 按钮位于第一位（DOM 顺序上先于邮箱表单，且在卡片可视区顶部）；
  2. QQ 按钮为品牌蓝样式、含 QQ 图标与「使用 QQ 一键登录」文案；
  3. 未配置 Key 时点击 QQ 登录 → 弹出友好错误提示（后端 503），不白屏不跳走；
  4. 邮箱登录表单仍完整可用（回归）；
  5. 回调页错误路径：/login/qq-callback#error=... 展示原因 + 返回登录按钮；
  6. 回调页 hash 中的令牌/错误被即时清除（地址栏不留残影）。

用法（需前端 3000 + 后端 8000 + Redis 已启动）：
  backend/.venv/Scripts/python.exe scripts/verify_qq_login_ui.py
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "verify-qq-login"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

results: list[tuple[str, bool, str]] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    results.append((label, bool(cond), extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


def rx(label: str) -> re.Pattern:
    return re.compile(r"\s*".join(re.escape(ch) for ch in label))


def shot(page, name: str) -> None:
    try:
        page.screenshot(path=str(SHOT_DIR / f"{name}.png"), full_page=False)
    except Exception:
        pass


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        try:
            # ── 打开登录页 ──
            page.goto(f"{FRONT}/login", wait_until="load", timeout=90000)
            page.get_by_placeholder("邮箱地址").wait_for(timeout=60000)
            check("登录页渲染", True)

            qq_btn = page.get_by_role("button", name=rx("使用 QQ 一键登录"))
            qq_btn.wait_for(timeout=15000)
            check("QQ 登录按钮存在", True)

            # ── 位置：QQ 按钮必须位于第一位（先于邮箱输入框） ──
            order = page.evaluate("""() => {
                const btn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.includes('QQ 一键登录'));
                const emailInput = document.querySelector('input#email, input[placeholder="邮箱地址"]');
                if (!btn || !emailInput) return null;
                return btn.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING ? 'qq-first' : 'email-first';
            }""")
            check("QQ 按钮位于邮箱表单之前（第一位）", order == "qq-first", str(order))

            # 视觉：按钮在视口内、有 QQ 品牌蓝背景
            box = qq_btn.bounding_box()
            check("QQ 按钮在可视区内", bool(box and box["y"] < 700 and box["height"] > 30),
                  f"y={box['y']:.0f}, h={box['height']:.0f}" if box else "no box")
            bg = qq_btn.evaluate("el => getComputedStyle(el).backgroundColor")
            check("QQ 按钮为品牌蓝 #12B7F5", bg == "rgb(18, 183, 245)", bg)
            icon = qq_btn.locator("svg").count()
            check("QQ 按钮含图标", icon >= 1, f"{icon} 个 svg")

            # 分隔线文案
            check("邮箱登录分隔提示存在", page.get_by_text("或使用邮箱登录").count() == 1)
            shot(page, "01-login-qq-first")

            # ── 未配置 Key：点击 → 友好错误（503 → message.error） ──
            qq_btn.click()
            toast = page.locator(".ant-message-error, .ant-message-notice-error").last
            toast.wait_for(timeout=15000)
            check("点击 QQ 登录弹出错误提示（未配置时友好降级）", True,
                  toast.inner_text().replace("\n", " ")[:60])
            check("未跳转到 QQ 域名（未配置不跳转）", "graph.qq.com" not in page.url, page.url)
            shot(page, "02-qq-not-configured")

            # ── 回归：邮箱登录表单完整 ──
            check("邮箱输入框仍在", page.get_by_placeholder("邮箱地址").count() == 1)
            check("密码输入框仍在", page.get_by_placeholder("密码").count() == 1)
            check("登录提交按钮仍在", page.get_by_role("button", name=rx("登录")).count() >= 1)
            check("注册/忘记密码链接仍在",
                  page.get_by_role("link", name="立即注册").count() == 1
                  and page.get_by_role("link", name="忘记密码？").count() == 1)

            # ── 回调页：错误路径 ──
            page.goto(f"{FRONT}/login/qq-callback#error=%E4%BD%A0%E5%B7%B2%E5%8F%96%E6%B6%88%20QQ%20%E6%8E%88%E6%9D%83", wait_until="load", timeout=60000)
            page.get_by_text("登录未完成").wait_for(timeout=30000)
            check("回调页展示错误标题", True)
            check("回调页展示中文错误原因", "你已取消 QQ 授权" in page.locator(".ant-card").last.inner_text())
            check("回调页有返回登录按钮", page.get_by_role("button", name="返回登录页").count() == 1)
            # hash 被即时清除
            check("回调页地址栏 hash 已清除", "#" not in page.url, page.url)
            shot(page, "03-callback-error")

            # 返回登录按钮可用
            page.get_by_role("button", name="返回登录页").click()
            page.get_by_placeholder("邮箱地址").wait_for(timeout=30000)
            check("点击返回登录回到登录页", True)

            # ── 控制台 ──
            hydration = [t for t in console_errors if "hydrat" in t.lower() or "did not match" in t.lower()]
            check("无水合错误", len(hydration) == 0, f"{len(hydration)} 条")

        except Exception as e:
            check("流程未中断", False, f"{type(e).__name__}: {str(e)[:200]}")
            try:
                shot(page, "99-failure")
            except Exception:
                pass
        finally:
            browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n结论：{passed}/{len(results)} 项通过")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
