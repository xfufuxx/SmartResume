"""全模板渲染冒烟：27 套模板逐一生成 PDF + 文档属性断言（不走 HTTP，免限流）。

用法（backend/.venv）：
    .venv/Scripts/python.exe ../scripts/verify_all_templates.py

与 verify_security.py 的分工：本脚本测「渲染层」——每套模板都能出 PDF、
页数合理、正文非空、PDF 文档属性带正确的 template-id / 标题。
"""
import asyncio
import os
import sys

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)

RESUME = {
    "personal_info": {"name": "全模板验证", "email": "all@demo.com", "phone": "13800138000"},
    "summary": "冒烟测试用摘要文本，用于占位与分页验证。",
    "experience": [
        {"title": "工程师", "company": "示例公司", "start": "2020", "end": "2022",
         "points": ["要点一：负责核心模块开发与维护", "要点二：参与架构评审与性能优化"]},
    ],
    "education": [{"school": "示例大学", "degree": "本科", "major": "计算机科学与技术",
                   "start": "2016", "end": "2020"}],
    "skills": ["Python", "Go"],
}

#: 单页简历 PDF 体积上限（字节）。正常模板 25–55KB；渐变被栅格化时会飙到 800KB+。
MAX_PDF_BYTES = 200 * 1024

passed = failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"[PASS] {name}" + (f" — {detail}" if detail else ""))
    else:
        failed += 1
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))


async def main() -> int:
    import fitz

    from app.services.pdf_generator import generate_pdf
    from app.services.template_meta import TEMPLATE_META

    for tid, meta in TEMPLATE_META.items():
        try:
            pdf = await generate_pdf(RESUME, f"{tid}.html")
            doc = fitz.open(stream=pdf, filetype="pdf")
            text = "".join(p.get_text() for p in doc)
            md = doc.metadata
            pages = doc.page_count
            doc.close()
            good = (
                pdf[:4] == b"%PDF"
                and pages >= 1
                and len(text.strip()) > 50
                and meta.id in (md.get("keywords") or "")
                and (md.get("title") or "").startswith(meta.name)
            )
            check(f"{tid} 渲染 + 文档属性", good,
                  f"pages={pages} size={len(pdf)} title={md.get('title')!r}")
            # 体积守护：多层半透明渐变叠加会让 Chromium 把整块区域栅格化成位图，
            # 单页 PDF 可从 ~30KB 膨胀到 ~800KB（用户无法上传招聘系统）。
            check(f"{tid} PDF 体积 ≤ {MAX_PDF_BYTES // 1024}KB（无渐变栅格化膨胀）",
                  len(pdf) <= MAX_PDF_BYTES, f"got {len(pdf) / 1024:.1f}KB")
        except Exception as e:  # noqa: BLE001
            check(f"{tid} 渲染 + 文档属性", False, f"{type(e).__name__}: {e}")

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
