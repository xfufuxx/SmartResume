"""真实浏览器端到端验证「停止优化」与「前后对比弹窗」。

覆盖用户提出的三点要求：
  1. 优化进行中提供「停止优化」入口，点击后立即中断并回到可操作状态；
  2. 不再在「立即优化」下方显示实时进度（改为「在做什么 + 已用时」）；
  3. 仅在优化彻底完成后弹出前后差异对比，突出主要变化。

用法（需前端 3000 + 后端 8000 + Redis 已启动）：
  backend/.venv/Scripts/python.exe scripts/verify_optimize_ui.py
"""
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"
SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "verify-optimize"
SHOT_DIR.mkdir(parents=True, exist_ok=True)


def rx(label: str) -> re.Pattern:
    """AntD 会在「恰好两个汉字」的按钮文案中间插入空格（登录 → 登 录），
    所以按名字查找一律走「字符间允许空白」的正则，避免假失败。"""
    return re.compile(r"\s*".join(re.escape(ch) for ch in label))

results: list[tuple[str, bool, str]] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    results.append((label, bool(cond), extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


def shot(page, name: str) -> None:
    try:
        page.screenshot(path=str(SHOT_DIR / f"{name}.png"), full_page=False)
        print(f"    截图：{SHOT_DIR / (name + '.png')}")
    except Exception as e:  # 截图失败不应中断验证
        print(f"    截图失败({name}): {e}")


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})
        console_errors: list[tuple[str, str]] = []
        phase = {"name": "启动"}
        page.on(
            "console",
            lambda m: console_errors.append((phase["name"], m.text)) if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: console_errors.append((phase["name"], f"pageerror: {e}")))

        def step(name: str) -> None:
            phase["name"] = name
            print(f"  ── 阶段：{name}")

        try:
            # ── 登录 ──
            step("登录")
            page.goto(f"{FRONT}/login", wait_until="domcontentloaded")
            page.get_by_placeholder("邮箱地址").fill(EMAIL)
            page.get_by_placeholder("密码").fill(PASSWORD)
            page.get_by_role("button", name=rx("登录")).first.click()
            page.wait_for_url("**/dashboard", timeout=30000)
            check("登录成功并跳转 /dashboard", True, page.url)

            # ── 进入优化页 ──
            step("进入优化页(硬导航)")
            page.goto(f"{FRONT}/", wait_until="domcontentloaded")
            page.get_by_role("heading", name="AI 简历优化").wait_for(timeout=30000)
            check("优化页渲染出主标题", True)

            # ── 选简历 ──
            step("选择简历")
            page.get_by_role("button", name=rx("从简历库选择")).first.click()
            modal = page.locator(".ant-modal-wrap:visible").last
            modal.wait_for(timeout=15000)
            # 作用域限定在弹窗内：页面上的「从简历库选择」也含「选择」子串
            modal.get_by_role("button", name=rx("选择")).first.click()
            page.wait_for_timeout(2500)
            check("已从简历库选中简历", page.get_by_text("已选择", exact=False).count() > 0)

            # ── 选岗位 ──
            step("选择岗位")
            job_btn = page.get_by_role("button", name=rx("从岗位库选择"))
            if job_btn.count() > 0:
                job_btn.first.click()
            else:
                page.get_by_role("button", name=rx("更换")).first.click()
            modal = page.locator(".ant-modal-wrap:visible").last
            modal.wait_for(timeout=15000)
            modal.get_by_role("button", name=rx("选择")).first.click()
            page.wait_for_timeout(2500)
            check("已从岗位库选中岗位", page.get_by_text("更换").count() > 0)

            # ── 第 1 次运行：验证「停止优化」 ──
            step("第1次运行-停止")
            run_btn = page.get_by_role("button", name=rx("立即优化"))
            check("立即优化按钮已可用", run_btn.is_enabled())
            run_btn.click()

            running = page.locator(".opt-running")
            running.wait_for(timeout=30000)
            bar_text = running.inner_text()
            check("运行条出现（不再有圆形进度条）", True, bar_text.replace("\n", " | ")[:80])
            check("运行条含「已用时」", "已用时" in bar_text)
            check("运行条不含百分比伪进度", "%" not in bar_text)
            check("运行条含「停止优化」按钮", page.get_by_role("button", name=rx("停止优化")).is_visible())
            check("旧的伪进度卡已移除", page.locator(".opt-progress-card").count() == 0)
            page.wait_for_timeout(4500)
            bar_text2 = page.locator(".opt-running").inner_text()
            m = re.search(r"已用时\s*(\d+)\s*(?:秒|分)", bar_text2)
            secs = int(m.group(1)) if m else -1
            check("已用时在走动（秒表未被轮询清掉）", secs >= 3, f"实测 {secs} 秒，整条={bar_text2.replace(chr(10), ' | ')[:70]}")
            shot(page, "01-running")

            # 点停止
            page.get_by_role("button", name=rx("停止优化")).click()
            page.locator(".opt-running").wait_for(state="detached", timeout=15000)
            check("点击停止后运行条立即消失", True)
            page.wait_for_timeout(800)
            check("立即优化按钮恢复可用（回到可操作状态）", page.get_by_role("button", name=rx("立即优化")).is_enabled())
            check("未弹出对比弹窗（中断不算完成）", page.get_by_text("优化完成 · 前后对比").count() == 0)
            shot(page, "02-stopped")

            # ── 第 2 次运行：等待完整完成后验证对比弹窗 ──
            step("第2次运行-等对比弹窗")
            page.get_by_role("button", name=rx("立即优化")).click()
            page.locator(".opt-running").wait_for(timeout=30000)
            # 等对比弹窗真正挂载（比按文案等更稳）
            page.locator(".opt-diff-body").wait_for(timeout=300000)
            check("优化彻底完成后弹出对比弹窗", True)
            page.wait_for_timeout(1200)

            modal = page.locator(".ant-modal-wrap:visible").last
            body = modal.inner_text()
            check("弹窗含「主要变化」区块", "主要变化" in body)
            check("弹窗含「修改前」对照", "修改前" in body)
            check("弹窗含「修改后」对照", "修改后" in body)
            check("弹窗含变化计数标签", "新增" in body or "改写" in body)
            check("运行条已随完成消失", page.locator(".opt-running").count() == 0)
            check("弹窗含高亮标记(<mark>)", page.locator(".opt-diff-mark").count() > 0,
                  f"{page.locator('.opt-diff-mark').count()} 处高亮")
            shot(page, "03-diff-modal")

            # 向下滚动展示逐项对照
            page.locator(".opt-diff-body").first.evaluate("el => el.scrollTop = el.scrollHeight * 0.5")
            page.wait_for_timeout(600)
            shot(page, "04-diff-detail")

            # 关闭后应回到可操作状态
            page.locator(".ant-modal-wrap:visible").last.get_by_role("button", name=rx("关闭")).first.click()
            page.wait_for_timeout(800)
            check("关闭弹窗后页面可继续操作", page.get_by_role("button", name=rx("立即优化")).is_enabled())

            # ── 控制台错误（带阶段定位，避免凭猜测归因）──
            print("  ── 控制台错误明细 ──")
            if not console_errors:
                print("    （无）")
            for ph, txt in console_errors:
                print(f"    [{ph}] {txt[:150]}")

            hydration = [(p_, t) for p_, t in console_errors if "hydrat" in t.lower() or "did not match" in t.lower()]
            check("无水合错误", len(hydration) == 0, f"{len(hydration)} 条")

            # Next.js 在客户端导航时主动取消在途 RSC 预取，会打印
            # 「Failed to fetch RSC payload ... Falling back to browser navigation」并自动回退整页跳转，
            # 属框架既定行为（非本功能缺陷）。单独归类，不计入「其他错误」，但明细照实打印。
            rsc_prefetch = [(p_, t) for p_, t in console_errors if "Failed to fetch RSC payload" in t]
            others = [(p_, t) for p_, t in console_errors if (p_, t) not in hydration and (p_, t) not in rsc_prefetch]
            check("无本功能相关控制台错误", len(others) == 0,
                  "; ".join(f"[{p_}]{t[:90]}" for p_, t in others[:2]))
            print(f"    （RSC 预取回退噪声 {len(rsc_prefetch)} 条，发生阶段："
                  f"{', '.join(sorted({p_ for p_, _ in rsc_prefetch})) or '无'}）")

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
