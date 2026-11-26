"""模拟押题（对话式）端到端验收。

覆盖：
  1. 页面骨架：标题/配置面板/空态引导/历史列表
  2. 旧版「快速押题」会话：只读回放、题目卡完整换行、押题清单抽屉
  3. 新会话全链路：开场 → 出题 → 作答 → 点评 → 结束复盘（真实 LLM，可用 --no-live 跳过）
  4. 刷新恢复：消息流水从后端重放
  5. 删除会话 + 控制台无报错/水合错误

用法（需 Redis + 后端 8000 + 前端 3000 已启动）：
  backend/.venv/Scripts/python.exe scripts/verify_mock_interview.py
  backend/.venv/Scripts/python.exe scripts/verify_mock_interview.py --no-live
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"
SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "verify-mock-interview"
SHOT_DIR.mkdir(parents=True, exist_ok=True)
LIVE = "--no-live" not in sys.argv

results: list[tuple[str, bool, str]] = []


def rx(label: str) -> re.Pattern:
    return re.compile(r"\s*".join(re.escape(ch) for ch in label))


def check(label: str, cond: bool, extra: str = "") -> None:
    results.append((label, bool(cond), extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


def shot(page, name: str) -> None:
    try:
        page.screenshot(path=str(SHOT_DIR / f"{name}.png"), full_page=False)
    except Exception:
        pass


def wait_question(page, timeout: int = 180_000) -> bool:
    try:
        page.locator('[data-testid="mock-question-card"]').first.wait_for(timeout=timeout)
        return True
    except Exception:
        return False


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})
        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        created_title = ""
        created_id = ""
        try:
            # ── 登录 ──
            page.goto(f"{FRONT}/login", wait_until="load", timeout=120_000)
            page.get_by_placeholder("邮箱地址").fill(EMAIL)
            page.get_by_placeholder("密码").fill(PASSWORD)
            page.locator('button[type="submit"]').first.click()
            page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=90_000)

            # ── 1. 页面骨架 ──
            page.goto(f"{FRONT}/interview", wait_until="domcontentloaded")
            page.get_by_text("模拟押题", exact=True).first.wait_for(timeout=180_000)
            page.locator('[data-testid="mock-start"]').wait_for(timeout=60_000)
            check("模拟押题页渲染（标题 + 配置面板）", True)
            check("空态引导可见", page.get_by_text("模拟一场，比背十道题有用").count() == 1)
            check("历史模拟列表可见", page.get_by_text("历史模拟", exact=True).count() >= 1)
            shot(page, "01-empty-state")

            # ── 2. 旧版快速押题：只读回放 ──
            items = page.locator('[data-testid="mock-session-item"]')
            items.first.wait_for(timeout=30_000)
            total = items.count()
            check("历史记录已加载", total >= 1, f"{total} 条")
            items.first.click()
            page.locator('[data-testid="mock-chat"]').wait_for(timeout=60_000)
            page.wait_for_timeout(600)

            quick_item = page.locator('[data-testid="mock-session-item"]').filter(has_text="快速").first
            if quick_item.count():
                quick_item.click()
                page.wait_for_timeout(800)
                body = page.locator('[data-testid="mock-chat"]')
                check("旧版会话标注只读", body.get_by_text("快速押题 · 只读").count() >= 1)
                check("旧版会话无输入框（只读）", page.locator('[data-testid="mock-input"]').count() == 0)
                check("旧版会话题目卡已回放", wait_question(page, 20_000))
                page.wait_for_timeout(400)
                overflow = page.evaluate("""() => {
                    const out = [];
                    document.querySelectorAll('[data-testid="mock-question-text"]').forEach((el, i) => {
                        out.push({ i, sw: el.scrollWidth, cw: el.clientWidth });
                    });
                    return out;
                }""")
                clipped = [o for o in overflow if o["sw"] > o["cw"] + 2]
                check(f"{len(overflow)} 道题均未被横向裁切", len(clipped) == 0,
                      "; ".join(f"#{o['i']} {o['sw']}>{o['cw']}" for o in clipped[:3]))
                shot(page, "02-legacy-readonly")

                # 押题清单抽屉
                page.locator('[data-testid="mock-open-drawer"]').click()
                drawer = page.locator('[data-testid="mock-drawer"]')
                drawer.wait_for(timeout=15_000)
                check("押题清单抽屉打开", drawer.is_visible())
                check("抽屉内题目条目渲染", page.locator('[data-testid="mock-drawer-item"]').count() >= 1)
                shot(page, "03-drawer")
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)

            # ── 3. 新会话全链路 ──
            page.locator('[data-testid="mock-reset"]').click()
            page.wait_for_timeout(400)
            page.locator('[data-testid="mock-start"]').click()

            if LIVE:
                # 开场流式：等对话卡出现（创建会话是异步的，不能点完立即断言）
                try:
                    page.locator('[data-testid="mock-chat"]').wait_for(timeout=30_000)
                    entered = True
                except Exception:
                    entered = False
                check("新会话进入对话态", entered)
                got_q = wait_question(page, 180_000)
                check("开场后拿到第 1 题", got_q,
                      page.locator('[data-testid="mock-error"]').inner_text()[:120]
                      if page.locator('[data-testid="mock-error"]').count() else "")
                if got_q:
                    first_q = page.locator('[data-testid="mock-question-text"]').first.inner_text()
                    check("题目文本非空", len(first_q.strip()) >= 8, f"{len(first_q)} 字")
                    check("题目卡带分类/难度标签",
                          page.locator('[data-testid="mock-question-card"]').first.locator(".ant-tag").count() >= 1)
                    shot(page, "04-first-question")

                    # 作答
                    page.locator('[data-testid="mock-input"]').fill("我先用压测定位瓶颈，把通知改成异步，接口响应从 800ms 降到 300ms。")
                    page.locator('[data-testid="mock-send"]').click()
                    page.locator('[data-testid="mock-feedback"]').first.wait_for(timeout=180_000)
                    check("作答后出现点评卡", True)
                    check("点评给出 1-5 分", page.locator('[data-testid="mock-feedback"] .ant-tag').count() >= 1)
                    q_count = page.locator('[data-testid="mock-question-card"]').count()
                    check("点评后有下一题或追问", q_count >= 2, f"{q_count} 张题卡")
                    shot(page, "05-feedback")

                    # 结束并复盘
                    page.locator('[data-testid="mock-finish"]').click()
                    try:
                        page.locator('[data-testid="mock-report"]').first.wait_for(timeout=180_000)
                        check("结束模拟后生成复盘", True)
                    except Exception:
                        err = page.locator('[data-testid="mock-error"]')
                        check("结束模拟后生成复盘", False,
                              err.inner_text()[:120] if err.count() else "未出现复盘卡")
                    check("复盘后输入区收起", page.locator('[data-testid="mock-input"]').count() == 0)
                    shot(page, "06-report")

                    # 记住会话 ID 用于刷新与删除（标题可能重复，ID 唯一）
                    created_id = page.locator(".mock-side-item.active").first.get_attribute("data-session-id") or ""
                    created_title = page.locator(".mock-current-title").first.inner_text().strip()

                    # ── 4. 刷新恢复 ──
                    page.reload(wait_until="domcontentloaded")
                    page.get_by_text("模拟押题", exact=True).first.wait_for(timeout=120_000)
                    saved = page.locator(f'[data-session-id="{created_id}"]')
                    saved.wait_for(timeout=30_000)
                    saved.click()
                    page.locator('[data-testid="mock-chat"]').wait_for(timeout=60_000)
                    page.wait_for_timeout(800)
                    restored = page.locator('[data-testid="mock-question-card"]').count()
                    check("刷新后消息从后端恢复", restored >= 2, f"{restored} 张题卡")
                    check("刷新后仍能看到复盘", page.locator('[data-testid="mock-report"]').count() >= 1)
                    shot(page, "07-reload-restored")

                    # ── 5. 删除会话 ──
                    target = page.locator(f'[data-session-id="{created_id}"]')
                    target.hover()
                    target.get_by_role("button", name="删除").click()
                    page.get_by_role("button", name=rx("确定")).first.click()
                    page.wait_for_timeout(1200)
                    left = page.locator(f'[data-session-id="{created_id}"]').count()
                    check("删除后会话从列表消失", left == 0, f"剩余 {left} 条")
            else:
                check("跳过真实 LLM 链路（--no-live）", True)

            # ── 控制台 ──
            hydration = [t for t in console_errors if "hydrat" in t.lower() or "did not match" in t.lower()]
            check("无水合错误", len(hydration) == 0, f"{len(hydration)} 条")
            real_errors = [
                t for t in console_errors
                if "favicon" not in t.lower() and "ResizeObserver" not in t
            ]
            check("无其它控制台错误", len(real_errors) == 0, " | ".join(real_errors[:2])[:160])

        except Exception as e:
            check("流程未中断", False, f"{type(e).__name__}: {str(e)[:240]}")
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
