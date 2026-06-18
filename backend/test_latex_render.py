"""
测试 LaTeX 渲染流程：
PDF → 图片 → 视觉模型 → LLM 优化 → LaTeX 模板 → .tex 输出
"""
import os
import sys
import json
import asyncio
import logging
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("test_latex")

RESUME_PDF = r"d:\下载\智能简历\简历.pdf"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "test_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


async def main():
    print("=" * 70)
    print("LaTeX 渲染测试")
    print("=" * 70)

    import fitz
    from app.services.image_layout_editor import extract_image_layout
    from app.services.text_optimizer import optimize_image_blocks
    from app.services.resume_renderer import render_resume_latex, _find_latex_compiler

    # ── Step 1: PDF → 图片 ──
    print("\n[1/4] PDF → 图片渲染...")
    doc = fitz.open(RESUME_PDF)
    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    img_bytes = pix.tobytes("png")
    doc.close()
    print(f"  分辨率: {pix.width}x{pix.height}px")

    # ── Step 2: 视觉模型提取内容 ──
    print("\n[2/4] 视觉模型提取内容...")
    layout = await extract_image_layout(img_bytes)
    print(f"  提取完成: {len(layout.blocks)} 个块, 照片: {'有' if layout.photo_bbox else '无'}")

    # ── Step 3: LLM 优化 ──
    print("\n[3/4] LLM 文本优化...")
    job_json = {
        "title": "SDK开发工程师",
        "requirements": ["C++", "SDK", "Windows/Linux", "音视频", "网络编程"],
    }
    optimized_texts = await optimize_image_blocks(layout.blocks, job_json)
    changes = sum(1 for i, b in enumerate(layout.blocks)
                  if i in optimized_texts and optimized_texts[i] != b.text)
    print(f"  优化完成: {changes} 个块变化")

    # ── Step 4: LaTeX 渲染 ──
    print("\n[4/4] LaTeX 渲染...")
    compiler = _find_latex_compiler()
    print(f"  LaTeX 编译器: {'✅ ' + compiler if compiler else '❌ 未安装 (将仅输出 .tex)'}")

    pdf_bytes, tex = render_resume_latex(
        blocks=layout.blocks,
        optimized_texts=optimized_texts,
        original_image_bytes=img_bytes,
        photo_bbox=layout.photo_bbox,
    )

    print(f"  LaTeX 源码: {len(tex)} 字符")
    print(f"  PDF 编译: {'✅ ' + str(len(pdf_bytes)) + ' bytes' if pdf_bytes else '⏭ 跳过 (无编译器)'}")

    # 保存 .tex
    tex_path = os.path.join(OUTPUT_DIR, "resume.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex)
    print(f"  .tex 已保存: {tex_path}")

    # 保存 PDF（如果有）
    if pdf_bytes:
        pdf_path = os.path.join(OUTPUT_DIR, "resume_latex.pdf")
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"  PDF 已保存: {pdf_path}")

    # ── 验证 ──
    print("\n" + "=" * 70)
    print("验证结果")

    # 检查 .tex 语法
    tex_ok = "\\documentclass" in tex and "\\end{document}" in tex
    print(f"  .tex 结构: {'✅ 完整' if tex_ok else '❌ 不完整'}")
    print(f"  .tex 包含 ctexart: {'✅' if 'ctexart' in tex else '❌'}")
    print(f"  .tex 包含 tikz: {'✅' if 'tikz' in tex else '❌'}")
    print(f"  .tex 包含中文: {'✅' if any(ord(c) > 127 for c in tex) else '❌'}")

    if pdf_bytes:
        check_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        print(f"  PDF 页数: {len(check_doc)}, 页面: {check_doc[0].rect.width:.0f}x{check_doc[0].rect.height:.0f}px")
        check_doc.close()
    else:
        print(f"  提示: 安装 TeX Live / MiKTeX 后可自动编译 PDF")
        print(f"  手动编译: xelatex {tex_path}")

    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())