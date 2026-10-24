"""职业照视觉抽查：代表性模板截图（屏幕态=预览态）。

覆盖三类摆放：
  corner  常规模板（jade-classic / professional / jade-medical）
  flow    全幅头部模板（jade-neon / jade-executive / academic / jade-magazine）
  sidebar 双栏侧栏（jade-twocol）
另加 circle 形状变体（jade-classic + jade-neon）。

输出：generated-images/avatar-check/<tid>[-circle].png
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

OUT = ROOT / "generated-images" / "avatar-check"
OUT.mkdir(parents=True, exist_ok=True)

from app.services.pdf_generator import render_template_html  # noqa: E402

RESUME = {
    "personal_info": {
        "name": "陈思远", "email": "chensiyuan@example.com",
        "phone": "138-0000-0000", "title": "高级产品设计师",
        "avatar": (
            "data:image/png;base64,"
            "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"
        ),
    },
    "summary": "5 年互联网产品设计经验，主导过日活百万级 C 端产品的完整设计周期。擅长用户研究、交互设计与设计系统建设。",
    "experience": [
        {"title": "高级产品设计师", "company": "某知名互联网公司", "start": "2022.03", "end": "至今",
         "points": ["主导核心购物流路的体验改版，转化率提升 23%", "从 0 到 1 搭建组件化设计系统，覆盖 12 条业务线"]},
    ],
    "education": [{"school": "示例大学", "degree": "本科", "major": "工业设计", "start": "2016", "end": "2020"}],
    "skills": ["Figma", "Sketch", "用户研究"],
}

CASES = [
    ("jade-classic", None),
    ("professional", None),
    ("jade-medical", None),
    ("jade-neon", None),
    ("jade-executive", None),
    ("academic", None),
    ("jade-magazine", None),
    ("jade-twocol", None),
    ("jade-classic", "circle"),
    ("jade-neon", "circle"),
    ("jade-twocol", "circle"),
]


async def main() -> int:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={"width": 860, "height": 1150})
        for tid, style in CASES:
            theme = {"avatarStyle": style} if style else None
            html = render_template_html(f"{tid}.html", RESUME, theme_config=theme)
            await page.set_content(html, wait_until="load")
            await page.wait_for_timeout(120)
            name = f"{tid}-{style}.png" if style else f"{tid}.png"
            await page.screenshot(path=str(OUT / name), full_page=True)
            print(f"[OK] {name}")
        await browser.close()
    print(f"\n输出目录：{OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
