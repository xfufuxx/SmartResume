"""
测试统一模板渲染流程：
PDF → 渲染图片 → 视觉模型提取内容 → LLM 优化 → 统一模板 → PDF + HTML
"""
import os
import sys
import json
import io
import asyncio
import logging
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("test_template")

RESUME_PDF = r"d:\下载\智能简历\简历.pdf"
JOB_IMAGE = r"d:\下载\智能简历\岗位.png"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "test_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


async def main():
    print("=" * 70)
    print("统一模板渲染测试")
    print(f"测试时间: {datetime.now().isoformat()}")
    print(f"简历文件: {RESUME_PDF}")
    print(f"输出目录: {OUTPUT_DIR}")
    print("=" * 70)

    import fitz
    from app.services.image_layout_editor import extract_image_layout
    from app.services.text_optimizer import optimize_image_blocks
    from app.services.resume_renderer import render_resume

    # ── Step 1: PDF 渲染为图片 ──
    print("\n[1/5] PDF → 图片渲染...")
    doc = fitz.open(RESUME_PDF)
    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    img_bytes = pix.tobytes("png")
    doc.close()
    print(f"  分辨率: {pix.width}x{pix.height}px, 大小: {len(img_bytes)} bytes")

    # 保存原始渲染图
    rendered_path = os.path.join(OUTPUT_DIR, "template_rendered.png")
    with open(rendered_path, "wb") as f:
        f.write(img_bytes)
    print(f"  渲染图已保存: {rendered_path}")

    # ── Step 2: 视觉模型提取内容 ──
    print("\n[2/5] 视觉模型提取内容...")
    layout = await extract_image_layout(img_bytes)
    block_types = {}
    for b in layout.blocks:
        block_types[b.block_type] = block_types.get(b.block_type, 0) + 1
    print(f"  提取完成: {len(layout.blocks)} 个块")
    print(f"  字段分布: {json.dumps(block_types, ensure_ascii=False)}")
    print(f"  照片: {'有' if layout.photo_bbox else '无'}")

    # 保存版式信息
    layout_info = {
        "total_blocks": len(layout.blocks),
        "field_distribution": block_types,
        "photo_bbox": list(layout.photo_bbox) if layout.photo_bbox else None,
        "blocks": [
            {
                "index": i,
                "type": b.block_type,
                "text": b.text[:100],
                "is_header": getattr(b, "is_header", False),
                "bbox": list(b.bbox),
            }
            for i, b in enumerate(layout.blocks)
        ]
    }
    layout_path = os.path.join(OUTPUT_DIR, "template_layout.json")
    with open(layout_path, "w", encoding="utf-8") as f:
        json.dump(layout_info, f, ensure_ascii=False, indent=2)
    print(f"  版式信息已保存: {layout_path}")

    # ── Step 3: LLM 文本优化 ──
    print("\n[3/5] LLM 文本优化...")
    job_json = {
        "title": "SDK开发工程师",
        "company": "示例科技公司",
        "requirements": [
            "熟练掌握 C++",
            "有 SDK 开发经验",
            "熟悉 Windows/Linux 平台",
            "有音视频开发经验",
            "熟悉网络编程",
        ],
        "description": "负责客户端 SDK 的设计与开发",
    }
    optimized_texts = await optimize_image_blocks(layout.blocks, job_json)
    changes = sum(1 for i, b in enumerate(layout.blocks)
                  if i in optimized_texts and optimized_texts[i] != b.text)
    print(f"  优化完成: {changes} 个块发生变化")

    # 打印变更细节
    for i, b in enumerate(layout.blocks):
        if i in optimized_texts:
            new_text = optimized_texts[i]
            if new_text != b.text and len(new_text) != len(b.text):
                print(f"  [{i:3d}] {b.block_type:12s} {len(b.text)} → {len(new_text)} "
                      f"({len(new_text)/max(len(b.text),1):.1f}x)")

    # ── Step 4: 统一模板渲染 ──
    print("\n[4/5] 统一模板渲染 PDF + HTML...")
    pdf_bytes, html = render_resume(
        blocks=layout.blocks,
        optimized_texts=optimized_texts,
        original_image_bytes=img_bytes,
        photo_bbox=layout.photo_bbox,
    )
    print(f"  PDF 大小: {len(pdf_bytes)} bytes ({len(pdf_bytes)/1024:.1f} KB)")
    print(f"  HTML 大小: {len(html)} 字符")

    # 保存 PDF
    pdf_path = os.path.join(OUTPUT_DIR, "template_output.pdf")
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"  PDF 已保存: {pdf_path}")

    # 保存 HTML
    html_path = os.path.join(OUTPUT_DIR, "template_output.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML 已保存: {html_path}")

    # ── Step 5: 验证 ──
    print("\n[5/5] 结果验证...")

    # 检查 PDF 有效性
    import fitz as fitz2
    try:
        check_doc = fitz2.open(stream=pdf_bytes, filetype="pdf")
        print(f"  PDF 页数: {len(check_doc)}, 格式: {'✅ 有效'}")
        page = check_doc[0]
        print(f"  PDF 页面: {page.rect.width:.0f}x{page.rect.height:.0f}px")
        check_doc.close()
    except Exception as e:
        print(f"  PDF: ❌ 无效 - {e}")

    # 检查 HTML 有效性
    print(f"  HTML: {'✅' if '<!DOCTYPE html>' in html else '❌'} 格式正确 ({len(html)} 字符)")

    print("\n" + "=" * 70)
    print("测试完成！输出文件：")
    print(f"  1. 渲染图: {rendered_path}")
    print(f"  2. 版式信息: {layout_path}")
    print(f"  3. HTML: {html_path}")
    print(f"  4. PDF: {pdf_path}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())