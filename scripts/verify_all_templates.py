"""全模板渲染冒烟：56 套模板逐一生成 PDF + 文档属性断言（不走 HTTP，免限流）。

用法（backend/.venv）：
    .venv/Scripts/python.exe ../scripts/verify_all_templates.py

与 verify_security.py 的分工：本脚本测「渲染层」——每套模板都能出 PDF、
页数合理、正文非空、PDF 文档属性带正确的 template-id / 标题。

职业照（2026-10-25 起）：RESUME fixture 带 personal_info.avatar（演示剪影
dataURL），除 PDF 断言外增加 HTML 层断言——头像宏渲染、一寸照/圆形形状、
槽位定位基座规则齐全，保证 56 套模板接入宏后无 Jinja 错误、无渲染缺失。
"""
import asyncio
import os
import sys

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)

#: 演示职业照（200×280 剪影 PNG dataURL，与 _DEMO_RESUME / 前端 template-demo-data 同源）。
#: 由 generated-images/_gen_demo_avatar.py 生成，勿手改；同步改三处时用同脚本重出。
DEMO_AVATAR = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAMgAAAEYCAIAAACWcy5SAAAEy0lEQVR42u3d2U4TURzA4WPTtwBBE0Xig"
    "tuFLAWXG8HlaV0QTYwxIAgxGre4QFzAW1+hXlTKEtRSZuqcc74vXBqFmV/P+TOdjofef/8ZoGj1ZrPp"
    "KFC4mkOAsBAW2c9YDgJWLGJZsUKwZGHFIpoZyzGglK1QWdgKERZmLHC5AcM7ZiwwY2HFQlhQ6PBuM8S"
    "KheEdKxYIC1feMWOBN6ExY2HGAjMWtkKEBcLCg9ewYoGwEBbCAk/0w5vQ2ApBWHgTGrfNgK0QYZHJjG"
    "UvxIqF4R0rFriOhRULMxa4uwEzFmYsEBaGd6xY4E1orFhkeB2LvY2e7Ovkjy29/+FYGd7/WtKpvoP3t"
    "/ROZy6QhhBCGOuqp3/WuZh3YXU9lf3351lYXVK9+edyyyuvN6HHTvX/35oX3214KEhSxk/3V6fsZ28"
    "3bIWSKutbSjuvmqp8b8JK7cwl3Faa17Em4jlhrbYWktsWE7zyPnGmP8ZXwsKbDZcbqlzV4XhfDwtv1s"
    "1YqvL95xFWGmclmbYSuUDaGDmc0itk/vW6FUtVfqIUw0qvqjR+Lp+ErrKIT02tGUK8X42RgYSzaowMx"
    "HtqavFmNZl0VS2TIwORnp1YZ6zJs+lXFfVP6uNfmLE2v/JZrtqLVoQzFpRzd0Nkv9NOnRvM8DxNnR14"
    "+uqbGQszVlQ7d57LVXupNmPhaTPxuJzxchXdEfBQkOD9Q8M7nuhXtCvnjzhbIYTL5wefvPxqxcLwDkW"
    "GFcNVEfvg7qmg8qfME/38amgrxD3vZL5mWbHI9QOr1y4edZ52uXrh6OMXX6xYuI4FwsKMRdG/FjZdbi"
    "C/Kw62QoSFpyaT+aV3tyYry1aIN6HxWyFk+UnoRytrztMuj1bWKn7WDO+2QVshLpDiAil2wlJWrAg+/"
    "/VweVVMbQ+XV6t/ygzv1iszFq5jFf4199xuGEIIc89XPdEPlxsgt9tmro8ec562jsal30djbmnVg9f2"
    "bXr0uIY6f709WPpcwdtm9BS99nGrTmF1PSkstRlrekxP5Re2+DmjFUtSPT7Uvc+rp29Cz+jpf28Os70"
    "qrEf3vM+MDTm7VdB6bc8ufop+K5RUJfMaKjuvsob3mXE9xZFXCGH22acIZqwbkoqusPGhEML9QvOqS4"
    "rtp6+ovOqSooy86pKijLxqzQNQVfJ5dd1GlyvWzYkTjnsOWif63sLH0rdCScmr4LAkJa/O8+r0wxSqo"
    "p1XMQ8FudWQFDuTmDgRQrg7/7H7D1Ooiu7a+OPdDbcaw44dnbR1d/5DpzOWqthPXsN7zVg73ZYU+9fK"
    "5s62pWvHfzauKg6a12ZLW8P77UlVceC2NiuqS4oy2jrU9P/KETwUBGEhLBAWwkJYICyEhbBAWAgLYYG"
    "wEBbCAmEhLIQFwkJYCAuEhbAQFggLYSEsEBbCQlggLISFsEBYCAthgbAQFsICYSEshAXCQlgIC4SFsB"
    "AWCAthISwQFsJCWCAshIWwQFgIC2GBsBAWwgJhISyEBcJCWAgLhIWwEBYIC2EhLBAWwkJYICyEhbBAW"
    "AgLYSEsEBbCQlggLISFsEBYCAthgbAQFsICYSEshAXCQlgIC4SFsBAWCAthISwQFsJCWCAshIWwQFgI"
    "C2GBsBAWwgJhISyEBcJCWKTpF38MOUCOzvxvAAAAAElFTkSuQmCC"
)

RESUME = {
    "personal_info": {
        "name": "全模板验证", "email": "all@demo.com", "phone": "13800138000",
        "avatar": DEMO_AVATAR,
    },
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

    from app.services.pdf_generator import generate_pdf, render_template_html
    from app.services.template_meta import TEMPLATE_META

    for tid, meta in TEMPLATE_META.items():
        try:
            # HTML 层：职业照宏渲染 + 一寸照形状 + 槽位定位基座规则（默认 oneInch）
            html = render_template_html(f"{tid}.html", RESUME)
            has_slot = "tpl-avatar-slot" in html
            has_img = f'src="{DEMO_AVATAR}"' in html
            one_inch = "aspect-ratio:5 / 7" in html and "border-radius:4px" in html
            # 槽位偏移由基座按媒体状态注入：屏幕态避开模拟页边距、打印态贴内容区
            has_base = (
                ".tpl-avatar-slot" in html
                and "@media screen" in html
                and "@media print" in html
            )
            check(f"{tid} 职业照宏渲染（oneInch 形状）",
                  has_slot and has_img and one_inch and has_base,
                  f"slot={has_slot} img={has_img} ratio={one_inch} base={has_base}")

            # circle 形状走主题参数：预览与导出同链，只验渲染不等同于漏传
            html_circle = render_template_html(
                f"{tid}.html", RESUME, theme_config={"avatarStyle": "circle"}
            )
            circle_ok = "aspect-ratio:1 / 1" in html_circle and "border-radius:9999px" in html_circle
            check(f"{tid} 职业照 circle 形状", circle_ok,
                  f"circle_ratio={'aspect-ratio:1 / 1' in html_circle} radius={'border-radius:9999px' in html_circle}")

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
