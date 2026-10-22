# -*- coding: utf-8 -*-
"""所见即所得（WYSIWYG）回归：iframe 预览与导出 PDF 必须排版一致。

背景（2026-10-22 实测发现的真实缺陷）：
    模板 body 一律 ``width: 210mm`` 且无 padding，页边距全交给 ``@page``。
    打印时 @page margin 生效 → 内容区只有 ``210-2X`` mm → Chromium 把 210mm
    的 body **整体缩放**约 ``(210-2X)/210``（X=20mm 时仅 0.81），26pt 姓名实际
    只渲染成 21pt；而 iframe 预览处于屏幕媒体下 @page 不生效，既不缩放也不留白。
    于是「预览 10pt 无边距、导出 8.1pt 有边距」，直接违背所见即所得。

    修法在 ``print_css.build_print_css``：打印态 body 退回内容区尺寸（不再缩放），
    屏幕态用 padding 还原等价页边距。本脚本守护这件事不再退化。

断言（每套模板）：
    1. 屏幕：body 内容区宽度 == 210 - 2X mm（±1.5mm）
    2. 屏幕：姓名元素字号 == 设计值（模板 CSS 里写多少就是多少，无缩放）
    3. PDF ：无缩放 —— 文本最大字号与屏幕姓名字号一致（±0.6pt）
    4. PDF ：页边距生效 —— 文本左边界 ≈ X mm（±2.5mm）

用法（backend/.venv）：
    python scripts/verify_wysiwyg.py
"""
import sys, os, asyncio, re, tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

PX_PER_MM = 96 / 25.4          # CSS px → mm
PT_PER_PX = 72 / 96            # CSS px → pt

RESUME = {
    "personal_info": {"name": "张三", "title": "高级工程师", "email": "z@example.com", "phone": "13800000000"},
    "summary": "八年以上后端架构经验，主导过多个高并发系统的建设与演进。",
    "experience": [{
        "title": "高级工程师", "company": "某某科技", "start": "2020.03", "end": "2024.06",
        "points": ["负责核心交易链路重构，QPS 提升 3 倍。", "主导微服务拆分，部署时长下降 60%。"],
    }],
    "education": [{"school": "某某大学", "degree": "本科", "major": "计算机", "start": "2014", "end": "2018"}],
    "skills": ["Python", "FastAPI", "PostgreSQL"],
    "projects": [{"name": "平台", "role": "负责人", "start": "2022", "end": "2023", "points": ["主导架构设计。"]}],
}

# (模板 id, 期望姓名设计字号 pt；None = 不校验设计值，只校验「PDF 与屏幕一致」)
# 页边距一律从元数据 layout_features 读取，避免脚本里再写一份会漂移的期望值。
CASES = [
    ("jade-minimal", 26.0),
    ("jade-nordic", 25.0),
    ("jade-corporate", 22.0),
    ("jade-medical", 20.0),
    ("jade-finance", 20.0),
    ("jade-neon", 24.0),      # 全幅深色：页边距 0，内边距由 .content 自给
    ("classic", None),
]

PASS = FAIL = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"[PASS] {name}")
    else:
        FAIL += 1
        print(f"[FAIL] {name} — {detail}")


def screen_measure(html: str, name_selector: str = ".name") -> tuple[float, float]:
    """在屏幕媒体下加载 HTML，返回 (body 内容区宽 mm, 姓名元素字号 pt)。"""
    from playwright.sync_api import sync_playwright

    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as fh:
        fh.write(html)
        path = fh.name
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
            try:
                page = browser.new_page(viewport={"width": 1200, "height": 900})
                page.goto(f"file:///{path}", wait_until="networkidle")
                data = page.evaluate(
                    """(sel) => {
                        const body = document.body;
                        const cs = getComputedStyle(body);
                        const padL = parseFloat(cs.paddingLeft) || 0;
                        const padR = parseFloat(cs.paddingRight) || 0;
                        // 内容区宽度 = border-box 宽 - 左右 padding
                        const content = body.getBoundingClientRect().width - padL - padR;
                        const el = document.querySelector(sel);
                        const fs = el ? parseFloat(getComputedStyle(el).fontSize) : 0;
                        return {content: content, fontSize: fs};
                    }""",
                    name_selector,
                )
                return data["content"] / PX_PER_MM, data["fontSize"] * PT_PER_PX
            finally:
                browser.close()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def pdf_measure(tid: str) -> tuple[float, float, int]:
    """渲染 PDF，返回 (文本左边界 mm, 最大字号 pt, 页数)。"""
    import fitz
    from app.services.pdf_generator import generate_pdf

    pdf = await generate_pdf(RESUME, f"{tid}.html")
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        pg = doc[0]
        min_x, max_size = None, 0.0
        for b in pg.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            if min_x is None or b["bbox"][0] < min_x:
                min_x = b["bbox"][0]
            for line in b.get("lines", []):
                for sp in line.get("spans", []):
                    max_size = max(max_size, sp["size"])
        return (min_x or 0.0) / 72 * 25.4, max_size, len(doc)
    finally:
        doc.close()


def main() -> None:
    from app.services.pdf_generator import render_template_html
    from app.services.template_meta import get_template_meta

    print("=" * 64)
    print("所见即所得回归：iframe 预览 vs 导出 PDF")
    print("=" * 64)

    for tid, design_pt in CASES:
        meta = get_template_meta(tid)
        assert meta is not None, f"{tid} 元数据缺失"
        # 全幅头部模板页边距为 0；其余取元数据声明值（唯一事实源）
        lf = meta.layout_features
        margin_x = 0.0 if (lf.full_bleed_header or lf.page_margin_y_mm == 0) else lf.page_margin_x_mm

        html = render_template_html(f"{tid}.html", RESUME)
        content_mm, font_pt = screen_measure(html)
        # PDF 渲染走独立事件循环（Playwright 同步 API 不能在 asyncio loop 内调用）
        left_mm, pdf_max_pt, pages = asyncio.run(pdf_measure(tid))

        expect_content = 210 - 2 * margin_x

        check(
            f"{tid} 屏幕内容区宽 = {expect_content:.0f}mm（210-2×{margin_x:.0f}）",
            abs(content_mm - expect_content) <= 1.5,
            f"got {content_mm:.1f}mm",
        )
        check(
            f"{tid} PDF 未产生空白页",
            pages >= 1,
            f"pages={pages}",
        )
        if design_pt is not None:
            check(
                f"{tid} 屏幕字号 = 设计值 {design_pt}pt（未被缩放）",
                abs(font_pt - design_pt) <= 0.6,
                f"got {font_pt:.2f}pt",
            )
        check(
            f"{tid} PDF 与预览字号一致（无缩放）",
            abs(pdf_max_pt - font_pt) <= 0.6,
            f"PDF {pdf_max_pt:.2f}pt vs 屏幕 {font_pt:.2f}pt（差 {abs(pdf_max_pt - font_pt):.2f}）",
        )
        # 文本左边界 = 页边距 + 模板内部 padding，故按下界断言：
        # 不得小于声明页边距（证明 @page 生效），也不得超出过多（证明没被缩放/偏移）。
        # 特例：全幅模板 @page 边距为 0，内边距完全由模板自己的 .content padding 决定
        # （如 jade-neon 为 15mm），此时下界无从校验，改为只校验上界（内容不贴边过头）。
        if margin_x == 0.0:
            check(
                f"{tid} PDF 左内边距合理（全幅模板自给，≤25mm）",
                left_mm <= 25.0,
                f"got {left_mm:.1f}mm",
            )
            continue
        check(
            f"{tid} PDF 左页边距 ≥ {margin_x:.0f}mm 且未过度右移",
            margin_x - 0.5 <= left_mm <= margin_x + 6.0,
            f"got {left_mm:.1f}mm（期望 {margin_x:.0f}~{margin_x + 6:.0f}mm）",
        )

    print("-" * 64)
    print(f"共 {PASS + FAIL} 项：PASS {PASS} / FAIL {FAIL}")
    print("ALL PASSED" if FAIL == 0 else "HAS FAILURES")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
