"""模拟押题（对话式）端到端验收。

覆盖：
  1. 页面骨架：标题/配置面板/空态引导/历史列表
  2. 旧版「快速押题」会话：只读回放、题目卡完整换行、押题题单抽屉
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
            page.get_by_text("模拟面试", exact=True).first.wait_for(timeout=180_000)
            page.locator('[data-testid="mock-start"]').wait_for(timeout=60_000)
            check("模拟面试页渲染（标题 + 配置面板）", True)
            check("空态引导可见", page.get_by_text("模拟一场，比背十道题有用").count() == 1)
            check("历史模拟列表可见", page.get_by_text("历史模拟", exact=True).count() >= 1)
            check("保留一次性快速押题入口", page.locator('[data-testid="mock-quick"]').count() == 1)
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

                # 题目抽屉（旧版快速押题 → 押题题单）
                page.locator('[data-testid="mock-open-drawer"]').click()
                drawer = page.locator('[data-testid="mock-drawer"]')
                drawer.wait_for(timeout=15_000)
                check("押题题单抽屉打开", drawer.is_visible())
                legacy_title = drawer.locator(".ant-drawer-title").inner_text().strip()
                check("旧版标题为「押题题单」", legacy_title.startswith("押题题单"), legacy_title)
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
                rail = page.locator('[data-testid="mock-stage-rail"]')
                check("对话态展示面试环节进度条", rail.count() == 1)
                stages = page.locator('[data-testid^="mock-stage-"][role="listitem"]')
                stage_n = stages.count()
                # 环节数随目标题数档位变化（默认 8 题启用 6 个：不含薪资），不能硬断言 7
                check("环节进度覆盖核心面试流程", stage_n >= 6, f"{stage_n} 个")
                rail_text = rail.inner_text()
                missing = [s for s in ("自我介绍", "简历深挖", "专业能力", "行为面试", "求职动机", "反问环节")
                           if s not in rail_text]
                check("六类必考环节均出现在流程中", not missing, "缺：" + "、".join(missing) if missing else "")
                check("反问环节排在流程最后",
                      stages.last.get_attribute("data-testid") == "mock-stage-reverse")
                active = page.locator('.mock-rail-item[data-state="active"]')
                check("同一时刻只有一个进行中环节", active.count() == 1,
                      active.first.get_attribute("data-testid") if active.count() else "无")
                check("开场从自我介绍环节起", active.count() == 1 and
                      active.first.get_attribute("data-testid") == "mock-stage-opening")
                head = page.locator('[data-testid="mock-stage-headline"]')
                check("标题栏显示本环节考察目标",
                      head.count() == 1 and len(head.inner_text().strip()) >= 4,
                      head.inner_text().strip()[:40] if head.count() else "")
                got_q = wait_question(page, 180_000)
                check("开场后拿到第 1 题", got_q,
                      page.locator('[data-testid="mock-error"]').inner_text()[:120]
                      if page.locator('[data-testid="mock-error"]').count() else "")
                if got_q:
                    first_q = page.locator('[data-testid="mock-question-text"]').first.inner_text()
                    check("题目文本非空", len(first_q.strip()) >= 8, f"{len(first_q)} 字")
                    check("题目卡带分类/难度标签",
                          page.locator('[data-testid="mock-question-card"]').first.locator(".ant-tag").count() >= 1)
                    bubbles = page.locator('[data-testid="mock-msg-assistant"] .mock-bubble')
                    dup = [i for i in range(bubbles.count())
                           if first_q.strip() in bubbles.nth(i).inner_text()]
                    check("正文不与题卡重复题干", len(dup) == 0, f"{len(dup)} 条重复")
                    shot(page, "04-first-question")

                    # 措辞校验：对话式用到的是「本场题目」，不是押题清单
                    open_drawer = page.locator('[data-testid="mock-open-drawer"]')
                    check("对话内题目入口叫「本场题目」",
                          open_drawer.inner_text().strip() == "本场题目",
                          open_drawer.inner_text().strip())
                    open_drawer.click()
                    dlg = page.locator('[data-testid="mock-drawer"]')
                    dlg.wait_for(timeout=15_000)
                    dlg_title = dlg.locator(".ant-drawer-title").inner_text().strip()
                    check("抽屉标题为「本场题目」", dlg_title.startswith("本场题目"), dlg_title)
                    check("界面不再出现「押题清单」", page.get_by_text("押题清单").count() == 0)
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(400)

                    # 作答
                    page.locator('[data-testid="mock-input"]').fill("我先用压测定位瓶颈，把通知改成异步，接口响应从 800ms 降到 300ms。")
                    page.locator('[data-testid="mock-send"]').click()
                    try:
                        page.locator('[data-testid="mock-feedback"]').first.wait_for(timeout=180_000)
                        check("作答后出现点评卡", True)
                    except Exception:
                        err = page.locator('[data-testid="mock-error"]')
                        check("作答后出现点评卡", False,
                              err.inner_text()[:120] if err.count() else "未出现点评卡")
                    check("点评给出 1-5 分", page.locator('[data-testid="mock-feedback"] .ant-tag').count() >= 1)
                    # 点评与下一题在同一轮返回；等这张题卡真正落库渲染，别在流式途中抢跑
                    try:
                        page.wait_for_function(
                            "() => document.querySelectorAll('[data-testid=\"mock-question-card\"]').length >= 2",
                            timeout=180_000,
                        )
                    except Exception:
                        pass
                    page.wait_for_function(
                        "() => { const b = document.querySelector('[data-testid=\"mock-finish\"]');"
                        " return b && !b.disabled; }",
                        timeout=60_000,
                    )
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
                    done_states = page.locator('.mock-rail-item[data-state="done"]').count()
                    skipped_states = page.locator('.mock-rail-item[data-state="skipped"]').count()
                    # 只问 2 题就结束，后面的环节没走到，不能全部打勾（复盘也写着 0/2）
                    check("复盘后未走到的环节标为未进行",
                          skipped_states >= 1 and done_states < stage_n,
                          f"完成 {done_states} / 未进行 {skipped_states} / 共 {stage_n}")
                    check("未进行环节显示「未进行」而非 0/0",
                          page.locator('.mock-rail-item[data-state="skipped"] .mock-rail-count').first.inner_text() == "未进行")
                    shot(page, "06-report")

                    # 复盘完成后左侧历史记录状态必须同步为「已结束」（回归：列表停留在「进行中」）
                    page.wait_for_timeout(1200)  # 等 finishedTick 触发的列表刷新完成
                    side_tag = page.locator(".mock-side-item.active .ant-tag").first
                    check("左侧历史记录状态同步为已结束", side_tag.inner_text().strip() == "已结束",
                          side_tag.inner_text().strip())

                    # 记住会话 ID 用于刷新与删除（标题可能重复，ID 唯一）
                    created_id = page.locator(".mock-side-item.active").first.get_attribute("data-session-id") or ""
                    created_title = page.locator(".mock-current-title").first.inner_text().strip()

                    # ── 4. 刷新恢复 ──
                    page.reload(wait_until="domcontentloaded")
                    page.get_by_text("模拟面试", exact=True).first.wait_for(timeout=120_000)
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

            # ── 6. 历史记录批量管理（不依赖 LLM，两种模式都覆盖） ──
            n_items = page.locator('[data-testid="mock-session-item"]').count()
            check("历史列表有条目可供批量操作", n_items >= 1, f"{n_items} 条")
            if n_items >= 1:
                page.locator('[data-testid="mock-batch-toggle"]').click()
                page.locator('[data-testid="mock-batch-bar"]').wait_for(timeout=10_000)
                check("进入批量管理模式（条目出现复选框）",
                      page.locator('.mock-side-item.selectable').count() == n_items,
                      f"{page.locator('.mock-side-item.selectable').count()}/{n_items}")
                page.locator('[data-testid="mock-batch-all"]').click()
                page.wait_for_timeout(300)
                check("全选后所有条目选中", page.locator('.mock-side-item.checked').count() == n_items)
                page.locator('[data-testid="mock-batch-all"]').click()
                page.wait_for_timeout(300)
                check("取消全选后清空选择", page.locator('.mock-side-item.checked').count() == 0)
                to_delete = min(2, n_items)
                for i in range(to_delete):
                    page.locator('[data-testid="mock-session-item"]').nth(i).click()
                page.wait_for_timeout(200)
                check("工具栏显示已选数量",
                      page.locator('.mock-side-toolbar-count').inner_text().strip() == f"已选 {to_delete} 条",
                      page.locator('.mock-side-toolbar-count').inner_text().strip())
                # 在点确认前采集选中 ID：删除成功会退出批量模式，checked 类随消失
                checked_ids = page.evaluate(
                    "() => Array.from(document.querySelectorAll('.mock-side-item.checked'))"
                    ".map(e => e.getAttribute('data-session-id'))"
                )
                page.locator('[data-testid="mock-batch-delete"]').click()
                page.locator('.ant-popover button.ant-btn-dangerous').click()
                # 不比对列表总数：此时可能有新会话正落进列表（如开场进行中），
                # 总数竞态不稳定；按「选中的 ID 删除后从列表消失」判定（确定性）。
                page.wait_for_timeout(2000)
                remaining = sum(page.locator(f'[data-session-id="{cid}"]').count() for cid in checked_ids)
                check("批量删除的条目从列表消失", len(checked_ids) == to_delete and remaining == 0,
                      f"选中 {len(checked_ids)} 条，残留 {remaining}")
                check("删除成功后自动退出批量模式",
                      page.locator('[data-testid="mock-batch-bar"]').count() == 0
                      and page.locator('[data-testid="mock-batch-toggle"]').count() == 1)

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
