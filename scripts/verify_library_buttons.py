"""验证优化页两个卡片右上角的「从库选择」功能按钮替换效果。

覆盖点：
  1. 「上传简历文件」卡片右上角为「从简历库选择」功能按钮（原「查看全部」跳转已移除），
     点击直接弹出生仪库选择弹窗，可选中简历；
  2. 「目标职位」卡片右上角为「从岗位库选择」功能按钮（原「岗位库」跳转已移除），
     点击直接弹出岗位库选择弹窗，可选中岗位；
  3. 两卡片底部不再有重复的同名按钮（避免一卡两入口）。

用法（需前端 3000 + 后端 8000 + Redis 已启动）：
  backend/.venv/Scripts/python.exe scripts/verify_library_buttons.py
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"
SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "verify-library-buttons"
SHOT_DIR.mkdir(parents=True, exist_ok=True)


def rx(label: str) -> re.Pattern:
    """AntD 会在「恰好两个汉字」的按钮文案中间插入空格，按名字查找一律允许字间空白。"""
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
            # ── 登录 ──
            page.goto(f"{FRONT}/login", wait_until="load", timeout=90000)
            page.wait_for_timeout(3000)
            page.get_by_placeholder("邮箱地址").fill(EMAIL)
            page.get_by_placeholder("密码").fill(PASSWORD)
            page.get_by_role("button", name=rx("登录")).first.click()
            page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)

            # ── 进入优化页 ──
            page.goto(f"{FRONT}/", wait_until="domcontentloaded")
            page.get_by_role("heading", name="AI 简历优化").wait_for(timeout=30000)
            check("优化页渲染出主标题", True)

            # ── ① 上传简历文件卡片 ──
            resume_card = page.locator(".opt-bottom-card").filter(
                has=page.locator(".opt-card-title", has_text="上传简历文件")
            ).first
            resume_card.wait_for(timeout=15000)

            # 原「查看全部」跳转按钮已不在该卡片右上角
            view_all = resume_card.get_by_role("button", name="查看全部")
            check("简历卡片右上角「查看全部」已移除", view_all.count() == 0)

            # 右上角为「从简历库选择」功能按钮（全页仅此一个，底部重复入口已移除）
            resume_btn = page.get_by_role("button", name=rx("从简历库选择"))
            check("「从简历库选择」全页唯一（底部重复入口已移除）", resume_btn.count() == 1,
                  f"count={resume_btn.count()}")
            check("「从简历库选择」位于简历卡片右上角(extra)",
                  resume_card.locator(".ant-card-extra").get_by_role("button", name=rx("从简历库选择")).count() == 1)

            # 点击直接弹出选择弹窗（不跳转 /resumes）
            resume_btn.click()
            modal = page.locator(".ant-modal-wrap:visible").last
            modal.wait_for(timeout=15000)
            check("点击后直接弹出「从简历库选择」弹窗", True)
            check("弹窗标题为「从简历库选择」", "从简历库选择" in modal.locator(".ant-modal-title").inner_text())
            check("未跳转到 /resumes 页面", "/resumes" not in page.url, page.url)
            shot(page, "01-resume-modal")

            # 选中一份简历
            modal.get_by_role("button", name=rx("选择")).first.click()
            page.wait_for_timeout(2500)
            check("已从简历库选中简历", resume_card.get_by_text("已选择", exact=False).count() > 0)

            # ── ② 目标职位卡片 ──
            job_card = page.locator(".opt-bottom-card").filter(
                has=page.locator(".opt-card-title", has_text="目标职位")
            ).first
            job_card.wait_for(timeout=15000)

            # 原「岗位库」跳转按钮已不在该卡片右上角
            # 注意：exact=True 必须加——新按钮「从岗位库选择」含「岗位库」子串，默认子串匹配会误判
            job_link = job_card.get_by_role("button", name="岗位库", exact=True)
            check("职位卡片右上角「岗位库」跳转已移除", job_link.count() == 0)

            # 右上角为「从岗位库选择」功能按钮（全页唯一）
            job_btn = page.get_by_role("button", name=rx("从岗位库选择"))
            check("「从岗位库选择」全页唯一（底部重复入口已移除）", job_btn.count() == 1,
                  f"count={job_btn.count()}")
            check("「从岗位库选择」位于职位卡片右上角(extra)",
                  job_card.locator(".ant-card-extra").get_by_role("button", name=rx("从岗位库选择")).count() == 1)

            job_btn.click()
            modal = page.locator(".ant-modal-wrap:visible").last
            modal.wait_for(timeout=15000)
            check("点击后直接弹出「从岗位库选择」弹窗", True)
            check("弹窗标题为「从岗位库选择」", "从岗位库选择" in modal.locator(".ant-modal-title").inner_text())
            check("未跳转到 /jobs 页面", "/jobs" not in page.url, page.url)
            shot(page, "02-job-modal")

            # 选中一个岗位
            modal.get_by_role("button", name=rx("选择")).first.click()
            page.wait_for_timeout(2500)
            check("已从岗位库选中岗位", job_card.get_by_text("更换").count() > 0)
            shot(page, "03-both-selected")

            # ── 控制台错误 ──
            # antd 在 dev 模式下对 message 静态函数 / Spin tip 的两条 Warning 属既有噪声，
            # 与本次改动无关（改动前同样存在），单独归类不计入。
            antd_noise = ("Static function can not consume context", "tip` only work in nest")
            hydration = [t for t in console_errors if "hydrat" in t.lower() or "did not match" in t.lower()]
            others = [
                t for t in console_errors
                if t not in hydration and not any(n in t for n in antd_noise)
            ]
            check("无水合错误", len(hydration) == 0, f"{len(hydration)} 条")
            check("无控制台错误（既有 antd dev 警告已排除）", len(others) == 0,
                  "; ".join(t[:90] for t in others[:2]))

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
