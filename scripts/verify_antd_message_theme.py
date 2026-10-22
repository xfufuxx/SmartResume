"""antd 静态方法主题一致性回归（holderRender + 全局主题登记）。

背景：全站 300+ 处 `message.*` 走的是 antd 静态方法，而静态方法的 holder 渲染在
React 树之外——只把 theme 当 ConfigProvider prop 传，静态提示永远按 antd 默认浅色画
（暗色模式下是白底黑字气泡）。`app/layout.tsx` 里两件事缺一不可：

1. `ConfigProvider.config({ holderRender: node => <App>{node}</App> })`
   —— 让静态节点进入 <App> 上下文（同时消除「Static function can not consume
   context like dynamic theme」告警）；
2. `ConfigProvider.config({ theme })`（在 ThemedConfig 的 effect 里随主题登记）
   —— 让 holder 里的 ConfigProvider 拿到真正的主题算法与 token。

断言（任何一条挂掉都说明上述链路被破坏，且不会在别处报错）：
  A. 暗色模式下静态 message 背景为深色、文字为浅色；
  B. 浅色模式下背景为浅色、文字为深色；
  C. 两种主题下的背景色不同（确实跟随主题）；
  D. 触发过程中不出现 antd 静态方法告警。
"""
import asyncio
import json
import sys

from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
DEMO_EMAIL = "demo@smart-resume.com"
BAD_PASSWORD = "wrong-password-for-theme-probe"   # 故意失败，用来触发 message.error
THEME_KEY = "smart-resume-theme"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""))


def _luma(color: str) -> int:
    """从 'rgb(r, g, b)' / 'rgba(r, g, b, a)' 取亮度，用于判断深浅（不依赖具体色值）。"""
    body = color[color.find("(") + 1 : color.find(")")]
    nums = [int(float(x)) for x in body.split(",")[:3]]
    return round(0.299 * nums[0] + 0.587 * nums[1] + 0.114 * nums[2])


async def trigger_message(page) -> dict:
    """在登录页用错误口令触发一次静态 message.error，返回气泡的 computed 样式。"""
    await page.wait_for_selector(".ant-message-notice-content", timeout=20000)
    style = await page.eval_on_selector(
        ".ant-message-notice-content",
        "el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color }; }",
    )
    await page.screenshot(path=f"docs/verify-antd/msg-{await page.evaluate('document.documentElement.dataset.theme')}.png")
    return style


async def probe(browser, theme: str) -> tuple[dict, list[str]]:
    ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
    page = await ctx.new_page()
    console_errors: list[str] = []
    page.on(
        "console",
        lambda m: console_errors.append(m.text) if m.type == "error" else None,
    )
    await page.add_init_script(f"localStorage.setItem('{THEME_KEY}', '{theme}')")
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(2200)
    attr = await page.evaluate("document.documentElement.dataset.theme")
    check(f"{theme} 主题已生效（html[data-theme]）", attr == theme, f"data-theme={attr}")

    inputs = page.locator("input")
    await inputs.nth(0).fill(DEMO_EMAIL)
    await inputs.nth(1).fill(BAD_PASSWORD)
    await page.locator('button[type="submit"]').first.click()
    style = await trigger_message(page)
    await page.wait_for_timeout(200)
    await ctx.close()
    return style, console_errors


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        dark, dark_errs = await probe(browser, "dark")
        light, light_errs = await probe(browser, "light")
        await browser.close()

    print(f"  dark : {json.dumps(dark, ensure_ascii=False)}")
    print(f"  light: {json.dumps(light, ensure_ascii=False)}")

    dark_bg, dark_fg = _luma(dark["bg"]), _luma(dark["color"])
    light_bg, light_fg = _luma(light["bg"]), _luma(light["color"])

    check("暗色：气泡背景为深色", dark_bg < 80, f"luma={dark_bg}")
    check("暗色：气泡文字为浅色", dark_fg > 150, f"luma={dark_fg}")
    check("浅色：气泡背景为浅色", light_bg > 200, f"luma={light_bg}")
    check("浅色：气泡文字为深色", light_fg < 100, f"luma={light_fg}")
    check("两主题气泡背景不同（确实跟随主题）", dark["bg"] != light["bg"],
          f"dark={dark['bg']} light={light['bg']}")

    warns = [t for t in dark_errs + light_errs if "Static function can not consume context" in t]
    check("无 antd 静态方法主题告警", not warns, f"{len(warns)} 条")

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n结论：{passed}/{len(results)} 项通过")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
