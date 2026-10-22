#!/usr/bin/env python
"""
打印基座回归：逐模板对比「注入前 vs 注入后」的 PDF。

为什么要这个脚本
----------------
打印基座（``app/services/print_css.py``）是在模板私有样式**之后**追加一段 CSS，
其中包含 ``@page`` 边距、``break-inside``、``orphans/widows`` 等分页规则。这类改动
最容易出两类事故：
  1. ``@page`` 边距写错 → 整份版式位移/多出空白页；
  2. ``break-inside: avoid`` 加得太宽 → 内容被整块推到下一页，凭空多出几页。

所以每次改 ``print_css.py`` 或 ``layout_features``，都应跑一遍本脚本：
    - 页数必须与注入前**一致**（±0）；
    - 每页像素差异必须很小（同页数下，允许条目分页点微调）；
    - 渲染产物必须含基座标记。

用法
----
    backend/.venv/Scripts/python.exe scripts/verify_print_base.py            # 全 14 套
    backend/.venv/Scripts/python.exe scripts/verify_print_base.py -t professional -t dark
    backend/.venv/Scripts/python.exe scripts/verify_print_base.py --csv      # 输出每页差异明细
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

#: 每页允许的像素差异比例。两类变化的量级：
#:   - 条目分页点微调（break-inside 把整条挪到下页，页数不变）：实测最大 ~19%（violet）
#:   - 事故类（深色底被基座抹掉等整页级破坏）：~59%（dark，2026-10-22 实测并已修复）
#: 取 25%：放过正常重排，拦住整页级事故。
PIXEL_TOLERANCE = 0.25

_results: list[tuple[bool, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    _results.append((bool(ok), name, detail))
    return bool(ok)


def long_resume() -> dict:
    """构造一份必然跨 2 页的简历（让分页规则真正被触发）。"""
    return {
        "personal_info": {
            "name": "陈思远",
            "email": "chensiyuan@example.com",
            "phone": "138-0000-0000",
            "address": "上海市浦东新区",
            "github": "github.com/chensiyuan",
        },
        "summary": (
            "6 年 B 端与 C 端产品设计经验，主导过日活百万级产品的完整设计周期。"
            "擅长用户研究、交互设计与设计系统建设，具备跨职能协作与团队带教经验。"
        ),
        "experience": [
            {
                "company": f"示例科技（第 {i} 段）",
                "title": "高级产品设计师" if i % 2 else "产品设计负责人",
                "start": f"20{18 + i}.03",
                "end": f"20{19 + i}.06",
                "points": [
                    "主导核心链路改版，转化率提升 18%，覆盖百万级日活用户。",
                    "搭建设计系统组件库，收敛 60+ 组件，交付效率提升 30%。",
                    "牵头跨部门协作，推动设计与研发的联合验收机制落地。",
                ],
            }
            for i in range(6)
        ],
        "education": [
            {"school": "示例大学", "degree": "硕士", "major": "工业设计", "start": "2014", "end": "2016"},
            {"school": "示例大学", "degree": "本科", "major": "视觉传达", "start": "2010", "end": "2014"},
        ],
        "skills": ["用户研究", "交互设计", "设计系统", "Figma", "数据分析", "团队管理"],
        "projects": [
            {
                "name": f"设计系统平台（{i}）",
                "role": "负责人",
                "start": "2022",
                "end": "2023",
                "points": ["统一 12 条业务线的视觉与交互规范。", "建立组件评审与版本发布流程。"],
            }
            for i in range(3)
        ],
    }


async def render(html: str) -> bytes:
    from app.services.resume_renderer import html_to_pdf_async
    return await html_to_pdf_async(html, base_url=str(BACKEND / "app" / "templates"))


def page_images(pdf: bytes):
    import fitz
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        return len(doc), [
            (page.get_pixmap(dpi=72).samples, page.rect.width, page.rect.height)
            for page in doc
        ]
    finally:
        doc.close()


def pixel_diff(a: bytes, b: bytes) -> float:
    """两页位图的差异比例（按字节计，同尺寸才可比）。"""
    if len(a) != len(b):
        return 1.0
    if not a:
        return 0.0
    diff = sum(1 for x, y in zip(a, b) if x != y)
    return diff / len(a)


async def main() -> int:
    ap = argparse.ArgumentParser(description="打印基座前后对比")
    ap.add_argument("-t", "--template", action="append", help="只测指定模板（可重复）")
    ap.add_argument("--csv", action="store_true", help="输出每页差异明细")
    args = ap.parse_args()

    from app.services.pdf_generator import env, render_template_html
    from app.services.template_meta import TEMPLATE_META
    from app.services.browser_pool import shutdown_browser

    targets = args.template or list(TEMPLATE_META)
    data = long_resume()

    print(f"对比模板 {len(targets)} 套（像素容差 {PIXEL_TOLERANCE:.0%}）\n")
    for tid in targets:
        if tid not in TEMPLATE_META:
            check(f"{tid} 已注册", False, "未在 TEMPLATE_META 中")
            continue

        raw_html = env.get_template(f"{tid}.html").render(resume=data)
        base_html = render_template_html(f"{tid}.html", data)
        check(f"{tid} 渲染产物含打印基座", "print_css.build_print_css" in base_html)

        try:
            before_pdf = await render(raw_html)
            after_pdf = await render(base_html)
        except Exception as exc:  # noqa: BLE001
            check(f"{tid} 渲染成功", False, f"{type(exc).__name__}: {exc}")
            continue

        n_before, imgs_before = page_images(before_pdf)
        n_after, imgs_after = page_images(after_pdf)
        check(f"{tid} 页数不变（{n_before} 页）", n_before == n_after, f"{n_before} → {n_after}")

        worst = 0.0
        for i in range(min(n_before, n_after)):
            ratio = pixel_diff(imgs_before[i][0], imgs_after[i][0])
            worst = max(worst, ratio)
            if args.csv:
                print(f"    {tid} p{i + 1}: diff={ratio:.4f}")
        check(f"{tid} 像素差异 ≤ {PIXEL_TOLERANCE:.0%}", worst <= PIXEL_TOLERANCE, f"最差 {worst:.2%}")
        print(f"  {tid:14s} 页数 {n_before}→{n_after}  最大像素差 {worst:.2%}  "
              f"体积 {len(before_pdf)}→{len(after_pdf)}")

    await shutdown_browser()

    failed = [r for r in _results if not r[0]]
    for _, name, detail in failed:
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))
    print(f"\n{'✅' if not failed else '❌'} {len(_results) - len(failed)}/{len(_results)} 通过")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
