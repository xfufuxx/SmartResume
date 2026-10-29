"""全模板二维码位置守护：qr-footer 必须紧跟主内容列，不得独占新页。

背景（2026-10-29）：qr_footer 曾把 footer 注入 </body> 之前——所有模板的
最外层容器（.page/.wrap）都带 min-height: 297mm，footer 永远落在容器之后，
PDF 里表现为「二维码独占一页」。修复为注入主内容列末尾后，本脚本双重守护：

    HTML 层：56 套模板逐一断言 footer 在最外层容器闭合之前（不回归旧行为）、
             且不在任何侧栏节点内部；
    PDF 层： 用 PyMuPDF 找到「扫码查看」所在页，断言同页上方 150pt 内有
             其他正文内容（不是孤零零一页只有二维码）。

用法（backend/.venv）：
    .venv/Scripts/python.exe ../scripts/verify_qr_position.py
"""
import asyncio
import os
import re
import sys

SCRIPTS = os.path.abspath(os.path.dirname(__file__))
BACKEND = os.path.abspath(os.path.join(SCRIPTS, "..", "backend"))
sys.path.insert(0, SCRIPTS)
sys.path.insert(0, BACKEND)

from verify_all_templates import DEMO_AVATAR, RESUME  # noqa: E402

from app.services.qr_footer import _build_tree, _is_chrome  # noqa: E402
from app.services.pdf_generator import generate_pdf, render_template_html  # noqa: E402
from app.services.template_meta import TEMPLATE_META  # noqa: E402

#: 演示二维码数据（复用头像剪影 dataURL 作占位图，形状校验在 sanitize 层）
RESUME_QR = {
    **RESUME,
    "qr_code": {
        "image": DEMO_AVATAR,
        "label": "Java 高级后端",
        "url": "https://demo.example.com/me",
    },
}

#: PDF 层：footer 顶边与同页最后一段正文底边的最大间距（pt）。
#: footer margin-top 6mm ≈ 17pt；超过 150pt 说明 footer 被推离内容（= 独占新页）。
MAX_GAP_PT = 150

passed = failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"[PASS] {name}" + (f" — {detail}" if detail else ""))
    else:
        failed += 1
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))


def _sidebar_closes(html: str) -> list[tuple[int, int]]:
    """收集所有侧栏类节点的 (open_end, close_start)。"""
    m = re.search(r"<body[^>]*>", html, re.I)
    end = html.lower().rfind("</body>")
    if not m or end == -1:
        return []
    roots = _build_tree(html, m.end(), end)
    result: list[tuple[int, int]] = []

    def collect(nodes: list) -> None:
        for n in nodes:
            if n.close_start is not None and _is_chrome(n):
                result.append((n.open_end, n.close_start))
            collect(n.children)

    collect(roots)
    return result


def _outermost_close(html: str) -> int | None:
    """最外层容器（min-height: 297mm 的 .page/.wrap）的闭合位置。

    排除 qr-footer 自身：旧行为下 footer 是顶层节点，会把 max close 抬到
    footer 之后，导致断言永远通过（守护失效）。
    """
    m = re.search(r"<body[^>]*>", html, re.I)
    end = html.lower().rfind("</body>")
    if not m or end == -1:
        return None
    roots = _build_tree(html, m.end(), end)
    closes = [
        r.close_start for r in roots
        if r.close_start is not None and "qr-footer" not in r.attrs
    ]
    return max(closes) if closes else None


async def main() -> int:
    for tid in TEMPLATE_META:
        name = f"{tid}"
        try:
            html = render_template_html(f"{tid}.html", RESUME_QR)
            i_footer = html.index('class="qr-footer"')

            # 1) footer 必须在最外层容器闭合之前（旧行为 = 容器之后 = 独占新页）
            outer = _outermost_close(html)
            check(f"{name} footer 在外层容器内", outer is not None and i_footer < outer,
                  f"footer@{i_footer} outer_close@{outer}")

            # 2) footer 不在任何侧栏节点内部
            bad_side = [
                (o, c) for o, c in _sidebar_closes(html) if o < i_footer < c
            ]
            check(f"{name} footer 不在侧栏内", not bad_side,
                  f"sidebar_ranges={bad_side[:2]}" if bad_side else "")

            # 3) PDF 层：扫码查看 与正文同页且紧跟其后
            pdf = await generate_pdf(RESUME_QR, f"{tid}.html")
            import fitz

            doc = fitz.open(stream=pdf, filetype="pdf")
            page = rect = None
            for p in doc:
                hits = p.search_for("扫码查看")
                if hits:
                    page, rect = p, hits[0]
                    break
            if page is None:
                check(f"{name} PDF 含二维码页脚", False, "未找到「扫码查看」")
                continue
            blocks = [
                b for b in page.get_text("blocks")
                if b[4].strip() and "扫码查看" not in b[4]
                and b[3] <= rect.y0 + 2  # 正文块在 footer 之上
            ]
            gap = min((rect.y0 - b[3] for b in blocks), default=10**6)
            check(f"{name} PDF 二维码紧跟正文（间距 ≤ {MAX_GAP_PT}pt）",
                  gap <= MAX_GAP_PT, f"gap={gap:.0f}pt page={page.number + 1}")
            doc.close()
        except Exception as e:  # noqa: BLE001
            check(name, False, f"{type(e).__name__}: {e}")

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
