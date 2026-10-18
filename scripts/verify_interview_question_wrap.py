"""验证面试押题长题目完整显示（不再被 antd Card 标题单行省略截断）。

覆盖点：
  1. 题卡标题（.ant-card-head-title）计算样式 white-space 为 normal（覆盖 antd 默认 nowrap）；
  2. 每个题卡的标题元素无横向溢出（scrollWidth <= clientWidth，即文字完整换行未被裁切）；
  3. 题目全文与接口数据一致（以首题 70 字符长题断言结尾字符出现在可见文本中）；
  4. 分类/难度标签、收藏按钮仍正常渲染。

用法（需前端 3000 + 后端 8000 + Redis 已启动）：
  backend/.venv/Scripts/python.exe scripts/verify_interview_question_wrap.py
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"
SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "verify-interview-wrap"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

# 演示账号已知押题会话：java高级后端开发工程师（6 题，首题 70 字符长题）
SESSION_TITLE = "java高级后端开发工程师"
LONG_Q_TAIL = "缓存穿透或雪崩"  # 首题结尾，修复前被截断看不到


def rx(label: str) -> re.Pattern:
    return re.compile(r"\s*".join(re.escape(ch) for ch in label))


results: list[tuple[str, bool, str]] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    results.append((label, bool(cond), extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


def shot(page, name: str) -> None:
    try:
        page.screenshot(path=str(SHOT_DIR / f"{name}.png"), full_page=False)
    except Exception:
        pass


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})
        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        try:
            # ── 登录并进入面试押题页 ──
            page.goto(f"{FRONT}/login", wait_until="load", timeout=90000)
            page.wait_for_timeout(3000)
            page.get_by_placeholder("邮箱地址").fill(EMAIL)
            page.get_by_placeholder("密码").fill(PASSWORD)
            page.get_by_role("button", name=rx("登录")).first.click()
            page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)

            page.goto(f"{FRONT}/interview", wait_until="domcontentloaded")
            # dev 冷编译可能较慢（首编译实测可达 90s+），等待放宽到 120s；
            # 页面标题由 AppLayout 渲染为 <b>（非 heading 角色），按文本等待
            page.get_by_text("AI 面试押题", exact=True).wait_for(timeout=120000)
            check("面试押题页渲染", True)

            # ── 打开已知押题会话 ──
            hist_item = page.locator("div.app-card").filter(
                has=page.locator(".app-section-title", has_text="历史押题")
            ).locator(f"text={SESSION_TITLE}").first
            hist_item.wait_for(timeout=20000)
            hist_item.click()
            card = page.locator(".iq-question-card").first
            card.wait_for(timeout=30000)
            page.wait_for_timeout(800)
            check("押题会话题目已加载", True)

            # ── 断言 1：标题计算样式允许换行 ──
            title = card.locator(".ant-card-head-title").first
            ws = title.evaluate("el => getComputedStyle(el).whiteSpace")
            check("题卡标题 white-space 为 normal（覆盖 antd 默认 nowrap）", ws == "normal", ws)

            # ── 断言 2：所有题卡标题无横向溢出 ──
            overflow = page.evaluate("""() => {
                const out = [];
                document.querySelectorAll('.iq-question-card .ant-card-head-title').forEach((el, i) => {
                    out.push({ i, sw: el.scrollWidth, cw: el.clientWidth });
                });
                return out;
            }""")
            clipped = [o for o in overflow if o["sw"] > o["cw"] + 2]
            check(f"全部 {len(overflow)} 题标题均未被横向裁切", len(clipped) == 0,
                  "; ".join(f"#{o['i']} {o['sw']}>{o['cw']}" for o in clipped[:3]))

            # ── 断言 3：长题全文完整可见（结尾文字出现在可见文本里） ──
            first_text = card.locator(".ant-card-head-title").first.inner_text()
            check("70 字符长题结尾文字完整显示", LONG_Q_TAIL in first_text,
                  first_text.replace("\n", " ")[-40:])

            # ── 断言 4：标签/收藏/答题要点仍在 ──
            check("分类与难度标签仍渲染", card.locator(".ant-tag").count() >= 2)
            check("收藏按钮仍渲染", card.get_by_role("button").count() >= 1)
            check("答题要点仍渲染", card.get_by_text("答题要点").count() == 1)
            shot(page, "01-long-question-wrap")

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
