"""
简历优化功能调试测试脚本
测试管道：PDF 解析 → LLM 优化 → PDF 重写
输出：中间数据 + 调试 PDF（红框标注 bbox）+ 优化后 PDF
"""
import os
import sys
import json
import asyncio
import logging
from datetime import datetime

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("test_optimize")

RESUME_PDF = r"d:\下载\智能简历\简历.pdf"
JOB_IMAGE = r"d:\下载\智能简历\岗位.png"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "test_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════
# 阶段 1: PDF 版式解析
# ══════════════════════════════════════════════════════════════════

def test_parse_pdf_layout():
    """测试 PDF 版式解析，输出每个文本块的详细信息"""
    from app.services.pdf_layout_editor import parse_pdf_layout, group_blocks_by_field

    with open(RESUME_PDF, "rb") as f:
        pdf_bytes = f.read()

    pages = parse_pdf_layout(pdf_bytes)
    logger.info(f"解析完成: {len(pages)} 页, {sum(len(p.text_blocks) for p in pages)} 个文本块")

    all_blocks = []
    for page in pages:
        all_blocks.extend(page.text_blocks)

    groups = group_blocks_by_field(pages)

    # 输出详细的块信息
    report = {
        "total_pages": len(pages),
        "total_blocks": len(all_blocks),
        "field_distribution": {k: len(v) for k, v in groups.items()},
        "blocks": [],
    }

    for block in all_blocks:
        info = {
            "block_index": block.block_index,
            "page": block.page_num,
            "text": block.text[:60] + ("..." if len(block.text) > 60 else ""),
            "text_length": len(block.text),
            "bbox": list(block.bbox),
            "font_size": block.font_size,
            "font_name": block.font_name,
            "color": block.color,
            "is_bold": block.is_bold,
            "field_type": block.field_type,
        }
        report["blocks"].append(info)

    report_path = os.path.join(OUTPUT_DIR, "01_parse_result.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info(f"解析结果已保存: {report_path}")

    # 输出摘要
    print("\n" + "=" * 70)
    print("阶段 1: PDF 版式解析")
    print("=" * 70)
    print(f"总页数: {len(pages)}")
    print(f"总文本块: {len(all_blocks)}")
    print(f"字段分布: {json.dumps({k: len(v) for k, v in groups.items()}, ensure_ascii=False)}")
    print()

    # 打印前 20 个块的详细信息
    for block in all_blocks[:20]:
        bbox = block.bbox
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        print(f"  [{block.block_index:3d}] {block.field_type:12s} "
              f"font={block.font_size:4.1f} bbox=({bbox[0]:6.1f},{bbox[1]:6.1f},{bbox[2]:6.1f},{bbox[3]:6.1f}) "
              f"size={w:5.0f}x{h:4.0f} text='{block.text[:50]}'")

    return pages, all_blocks


# ══════════════════════════════════════════════════════════════════
# 阶段 2: 生成调试 PDF（红框标注 bbox）
# ══════════════════════════════════════════════════════════════════

def generate_debug_pdf(pages, all_blocks):
    """在原 PDF 上绘制红色 bbox 框，生成调试版本"""
    import fitz

    with open(RESUME_PDF, "rb") as f:
        pdf_bytes = f.read()

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_layout in pages:
        if page_layout.page_num >= len(doc):
            continue
        page = doc[page_layout.page_num]

        for block in page_layout.text_blocks:
            rect = fitz.Rect(*block.bbox)
            # 红色边框
            page.draw_rect(rect, color=(1, 0, 0), width=0.5, overlay=True)

            # 绿色边框 = 优化字段，蓝色边框 = 保护字段
            if block.field_type in ("summary", "experience", "skills", "projects"):
                color = (0, 0.8, 0)  # 绿色
            elif block.field_type in ("name", "contact", "education"):
                color = (0, 0.4, 1)  # 蓝色
            else:
                color = (0.5, 0.5, 0.5)  # 灰色

            page.draw_rect(rect, color=color, width=0.3, overlay=True)

            # 标注 block_index
            label = f"{block.block_index}"
            label_rect = fitz.Rect(rect.x0, rect.y0 - 8, rect.x0 + 20, rect.y0)
            page.insert_textbox(label_rect, label, fontname="china-ss", fontsize=6,
                                color=(1, 0, 0), overlay=True)

    debug_path = os.path.join(OUTPUT_DIR, "02_debug_bbox.pdf")
    doc.save(debug_path)
    doc.close()
    logger.info(f"调试 PDF 已保存: {debug_path}")
    print(f"\n阶段 2: 调试 PDF（红框标注 bbox）已生成: {debug_path}")
    print("  图例: 红色边框 = bbox 范围, 绿色边框 = 优化字段, 蓝色边框 = 保护字段")
    return debug_path


# ══════════════════════════════════════════════════════════════════
# 阶段 3: LLM 文本优化
# ══════════════════════════════════════════════════════════════════

async def test_llm_optimize(all_blocks):
    """测试 LLM 文本优化，比较优化前后文本"""
    from app.services.text_optimizer import optimize_text_blocks

    # 模拟一个岗位 JSON（因为没有运行完整的岗位解析）
    job_json = {
        "title": "测试工程师",
        "company": "示例公司",
        "requirements": [
            "熟练掌握 Python",
            "有自动化测试经验",
            "熟悉 CI/CD 流程",
            "有性能测试经验",
            "熟悉接口测试",
        ],
        "description": "负责产品质量保障，编写自动化测试用例，优化测试流程",
    }

    print("\n" + "=" * 70)
    print("阶段 3: LLM 文本优化")
    print("=" * 70)

    optimized_texts = await optimize_text_blocks(all_blocks, job_json)

    # 比较优化前后
    changes = []
    for block in all_blocks:
        if block.block_index in optimized_texts:
            new_text = optimized_texts[block.block_index]
            if new_text != block.text:
                old_len = len(block.text)
                new_len = len(new_text)
                ratio = new_len / max(old_len, 1)
                changes.append({
                    "block_index": block.block_index,
                    "field_type": block.field_type,
                    "old_text": block.text[:100],
                    "new_text": new_text[:200],
                    "old_length": old_len,
                    "new_length": new_len,
                    "expansion_ratio": round(ratio, 2),
                })

    changes_path = os.path.join(OUTPUT_DIR, "03_optimize_changes.json")
    with open(changes_path, "w", encoding="utf-8") as f:
        json.dump(changes, f, ensure_ascii=False, indent=2)
    logger.info(f"优化变更已保存: {changes_path}")

    # 输出摘要
    total_blocks = len(all_blocks)
    changed_blocks = len(changes)
    print(f"总文本块: {total_blocks}, 已优化: {changed_blocks}")

    for c in changes:
        print(f"\n  [{c['block_index']:3d}] {c['field_type']:12s} "
              f"长度: {c['old_length']} → {c['new_length']} ({c['expansion_ratio']}x)")
        print(f"    原文: {c['old_text'][:80]}")
        print(f"    优化: {c['new_text'][:80]}")

    # 扩张率统计
    if changes:
        ratios = [c["expansion_ratio"] for c in changes]
        avg_ratio = sum(ratios) / len(ratios)
        max_ratio = max(ratios)
        high_risk = [c for c in changes if c["expansion_ratio"] > 2.0]
        print(f"\n  平均扩张率: {avg_ratio:.2f}x")
        print(f"  最大扩张率: {max_ratio:.2f}x")
        if high_risk:
            print(f"  ⚠️ 高风险溢出块 ({len(high_risk)} 个, 扩张率 > 2x):")
            for c in high_risk:
                print(f"    [{c['block_index']}] {c['field_type']} {c['expansion_ratio']}x")

    return optimized_texts, changes


# ══════════════════════════════════════════════════════════════════
# 阶段 4: PDF 重写
# ══════════════════════════════════════════════════════════════════

def test_rewrite_pdf(pages, optimized_texts, changes):
    """测试 PDF 重写，生成优化后的 PDF"""
    from app.services.pdf_layout_editor import rewrite_pdf

    with open(RESUME_PDF, "rb") as f:
        pdf_bytes = f.read()

    output_path = os.path.join(OUTPUT_DIR, "04_optimized.pdf")
    rewrite_pdf(pdf_bytes, pages, optimized_texts, output_path)
    logger.info(f"优化 PDF 已保存: {output_path}")

    # 验证输出
    output_size = os.path.getsize(output_path)
    print(f"\n阶段 4: PDF 重写完成")
    print(f"  输出文件: {output_path}")
    print(f"  文件大小: {output_size} bytes ({output_size / 1024:.1f} KB)")

    return output_path


# ══════════════════════════════════════════════════════════════════
# 阶段 5: 验证输出 PDF 是否有重叠
# ══════════════════════════════════════════════════════════════════

def verify_output_pdf(output_path, pages, optimized_texts, changes):
    """验证输出 PDF 中是否存在重叠问题"""
    import fitz

    doc = fitz.open(output_path)

    print(f"\n" + "=" * 70)
    print("阶段 5: 验证输出 PDF")
    print("=" * 70)

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        # 获取所有文本块
        blocks = page.get_text("dict")["blocks"]
        text_blocks = [b for b in blocks if b["type"] == 0]

        # 检查是否有重叠的文本块
        overlaps = 0
        for i, b1 in enumerate(text_blocks):
            for j, b2 in enumerate(text_blocks):
                if i >= j:
                    continue
                r1 = b1["bbox"]
                r2 = b2["bbox"]
                if _rects_overlap(r1, r2):
                    # 检查是否是真的重叠（不是上下相邻）
                    overlap_y = min(r1[3], r2[3]) - max(r1[1], r2[1])
                    if overlap_y > 3:  # 重叠超过 3px
                        overlaps += 1
                        text1 = "".join(s["text"] for l in b1.get("lines", []) for s in l.get("spans", []))
                        text2 = "".join(s["text"] for l in b2.get("lines", []) for s in l.get("spans", []))
                        print(f"  ⚠️ 重叠检测: '{text1[:30]}' ↔ '{text2[:30]}'")
                        print(f"     bbox1={r1}, bbox2={r2}")

        if overlaps == 0:
            print(f"  第 {page_idx + 1} 页: 无文本重叠 ✅")
        else:
            print(f"  第 {page_idx + 1} 页: 检测到 {overlaps} 处文本重叠 ⚠️")

    doc.close()


def _rects_overlap(r1, r2):
    return not (r1[2] <= r2[0] or r2[2] <= r1[0] or r1[3] <= r2[1] or r2[3] <= r1[1])


# ══════════════════════════════════════════════════════════════════
# 阶段 6: bbox 覆盖率分析
# ══════════════════════════════════════════════════════════════════

def analyze_bbox_coverage(pages, all_blocks):
    """分析 bbox 与实际文字尺寸的覆盖率"""
    import fitz

    with open(RESUME_PDF, "rb") as f:
        pdf_bytes = f.read()

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    print(f"\n" + "=" * 70)
    print("阶段 6: bbox 覆盖率分析")
    print("=" * 70)

    low_coverage = 0
    for block in all_blocks:
        page = doc[block.page_num]
        bbox = block.bbox
        bbox_w = bbox[2] - bbox[0]
        bbox_h = bbox[3] - bbox[1]

        # 用 PyMuPDF 测量文字实际宽度
        text_width = fitz.get_text_length(block.text, fontname="china-ss", fontsize=block.font_size)
        text_height = block.font_size * 1.2

        width_cov = (text_width / bbox_w * 100) if bbox_w > 0 else 0
        height_cov = (text_height / bbox_h * 100) if bbox_h > 0 else 0

        if width_cov < 50 or width_cov > 150 or height_cov < 20 or height_cov > 200:
            low_coverage += 1
            if low_coverage <= 10:  # 只打印前 10 个
                print(f"  [{block.block_index:3d}] {block.field_type:12s} "
                      f"文字: {len(block.text)}字 "
                      f"bbox: {bbox_w:.0f}x{bbox_h:.0f} "
                      f"文字需要: {text_width:.0f}x{text_height:.0f} "
                      f"覆盖率: w={width_cov:.0f}% h={height_cov:.0f}%")

    if low_coverage == 0:
        print("  所有 bbox 覆盖率正常 ✅")
    else:
        print(f"  ⚠️ {low_coverage} 个 bbox 覆盖率异常")

    doc.close()


# ══════════════════════════════════════════════════════════════════
# 阶段 7: 视觉模型路径（扫描件 PDF）
# ══════════════════════════════════════════════════════════════════

async def test_visual_model_path():
    """测试视觉模型路径：PDF 渲染为图片 → 视觉模型提取版式 → 优化 → 合成"""
    import io
    import fitz
    from app.services.image_layout_editor import extract_image_layout, composite_image
    from app.services.text_optimizer import optimize_image_blocks

    print("\n" + "=" * 70)
    print("阶段 7: 视觉模型路径（扫描件 PDF）")
    print("=" * 70)

    # 渲染 PDF 为图片
    doc = fitz.open(RESUME_PDF)
    total_pages = len(doc)
    print(f"PDF 页数: {total_pages}")

    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    img_bytes = pix.tobytes("png")
    print(f"渲染分辨率: {pix.width}x{pix.height}px, 大小: {len(img_bytes)} bytes")

    # 保存渲染图片
    img_path = os.path.join(OUTPUT_DIR, "07_rendered_page.png")
    with open(img_path, "wb") as f:
        f.write(img_bytes)
    print(f"渲染图片已保存: {img_path}")

    # 视觉模型提取版式
    print("\n调用视觉模型提取版式...")
    layout = await extract_image_layout(img_bytes)

    block_types = {}
    for b in layout.blocks:
        block_types[b.block_type] = block_types.get(b.block_type, 0) + 1
    print(f"版式提取完成: {len(layout.blocks)} 个块")
    print(f"字段分布: {json.dumps(block_types, ensure_ascii=False)}")
    print(f"照片: {'有' if layout.photo_bbox else '无'}")

    # 保存版式信息
    layout_info = {
        "width": layout.width,
        "height": layout.height,
        "photo_bbox": list(layout.photo_bbox) if layout.photo_bbox else None,
        "blocks": [],
    }
    for i, block in enumerate(layout.blocks):
        bx, by, bx1, by1 = block.bbox
        bw = bx1 - bx
        bh = by1 - by
        layout_info["blocks"].append({
            "index": i,
            "type": block.block_type,
            "text": block.text[:80],
            "text_length": len(block.text),
            "bbox": list(block.bbox),
            "bbox_size": f"{bw}x{bh}",
            "font_size": block.font_size,
            "color": block.color,
            "is_bold": block.is_bold,
            "is_header": block.is_header,
        })

    layout_path = os.path.join(OUTPUT_DIR, "07_layout.json")
    with open(layout_path, "w", encoding="utf-8") as f:
        json.dump(layout_info, f, ensure_ascii=False, indent=2)
    print(f"版式信息已保存: {layout_path}")

    # 打印前 20 个块
    print("\n文本块详情 (前 20 个):")
    for i, block in enumerate(layout.blocks[:20]):
        bbox = block.bbox
        bw = bbox[2] - bbox[0]
        bh = bbox[3] - bbox[1]
        print(f"  [{i:3d}] {block.block_type:12s} hdr={block.is_header} "
              f"font={block.font_size:3d} bbox=({bbox[0]:5d},{bbox[1]:5d},{bbox[2]:5d},{bbox[3]:5d}) "
              f"size={bw:4d}x{bh:4d} text='{block.text[:50]}'")

    doc.close()

    # 模拟岗位 JSON
    job_json = {
        "title": "SDK开发工程师",
        "company": "示例公司",
        "requirements": [
            "熟练掌握 C++",
            "有 SDK 开发经验",
            "熟悉 Windows/Linux 平台",
            "有音视频开发经验",
            "熟悉网络编程",
        ],
        "description": "负责客户端 SDK 的设计与开发",
    }

    # 优化文本
    print("\n调用 LLM 优化文本...")
    optimized_texts = await optimize_image_blocks(layout.blocks, job_json)

    # 比较优化前后
    changes = []
    for i, block in enumerate(layout.blocks):
        if i in optimized_texts:
            new_text = optimized_texts[i]
            if new_text != block.text:
                old_len = len(block.text)
                new_len = len(new_text)
                ratio = new_len / max(old_len, 1)
                changes.append({
                    "block_index": i,
                    "field_type": block.block_type,
                    "old_text": block.text[:100],
                    "new_text": new_text[:200],
                    "old_length": old_len,
                    "new_length": new_len,
                    "expansion_ratio": round(ratio, 2),
                    "is_header": block.is_header,
                    "bbox": list(block.bbox),
                })

    print(f"优化完成: {len(changes)} 个块发生变化")
    for c in changes[:10]:
        print(f"  [{c['block_index']:3d}] {c['field_type']:12s} "
              f"长度: {c['old_length']} → {c['new_length']} ({c['expansion_ratio']}x)")
        print(f"    原文: {c['old_text'][:80]}")
        print(f"    优化: {c['new_text'][:80]}")

    # 扩张率统计
    if changes:
        ratios = [c["expansion_ratio"] for c in changes]
        avg_ratio = sum(ratios) / len(ratios)
        max_ratio = max(ratios)
        high_risk = [c for c in changes if c["expansion_ratio"] > 2.0]
        print(f"\n  平均扩张率: {avg_ratio:.2f}x")
        print(f"  最大扩张率: {max_ratio:.2f}x")
        if high_risk:
            print(f"  ⚠️ 高风险溢出块 ({len(high_risk)} 个, 扩张率 > 2x):")
            for c in high_risk:
                print(f"    [{c['block_index']}] {c['field_type']} {c['expansion_ratio']}x")

    changes_path = os.path.join(OUTPUT_DIR, "07_optimize_changes.json")
    with open(changes_path, "w", encoding="utf-8") as f:
        json.dump(changes, f, ensure_ascii=False, indent=2)
    print(f"优化变更已保存: {changes_path}")

    # 合成图片
    print("\n合成优化后的图片...")
    result_bytes = composite_image(img_bytes, layout, optimized_texts)

    # 保存优化后的图片
    result_img_path = os.path.join(OUTPUT_DIR, "07_optimized.png")
    with open(result_img_path, "wb") as f:
        f.write(result_bytes)
    print(f"优化图片已保存: {result_img_path} ({len(result_bytes)} bytes)")

    # 保存为 PDF
    from PIL import Image
    result_pdf_path = os.path.join(OUTPUT_DIR, "07_optimized.pdf")
    img = Image.open(io.BytesIO(result_bytes))
    img.convert("RGB").save(result_pdf_path, format="PDF")
    print(f"优化 PDF 已保存: {result_pdf_path}")

    return layout, optimized_texts, changes


# ══════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════

async def main():
    print("=" * 70)
    print("智能简历优化功能 — 调试测试")
    print(f"测试时间: {datetime.now().isoformat()}")
    print(f"简历文件: {RESUME_PDF}")
    print(f"岗位文件: {JOB_IMAGE}")
    print(f"输出目录: {OUTPUT_DIR}")
    print("=" * 70)

    # ── 阶段 1: PDF 解析 ──
    pages, all_blocks = test_parse_pdf_layout()

    if not all_blocks:
        print("\n⚠️ PDF 无文本层（扫描件），切换到视觉模型路径...")
        layout, optimized_texts, changes = await test_visual_model_path()
        print("\n" + "=" * 70)
        print("测试完成！输出文件：")
        print(f"  1. 解析结果: {os.path.join(OUTPUT_DIR, '01_parse_result.json')}")
        print(f"  2. 渲染图片: {os.path.join(OUTPUT_DIR, '07_rendered_page.png')}")
        print(f"  3. 版式信息: {os.path.join(OUTPUT_DIR, '07_layout.json')}")
        print(f"  4. 优化变更: {os.path.join(OUTPUT_DIR, '07_optimize_changes.json')}")
        print(f"  5. 优化图片: {os.path.join(OUTPUT_DIR, '07_optimized.png')}")
        print(f"  6. 优化 PDF: {os.path.join(OUTPUT_DIR, '07_optimized.pdf')}")
        print("=" * 70)
        return

    # ── 阶段 2: 生成调试 PDF ──
    debug_path = generate_debug_pdf(pages, all_blocks)

    # ── 阶段 3: LLM 优化 ──
    optimized_texts, changes = await test_llm_optimize(all_blocks)

    if not changes:
        print("\n⚠️ 没有文本块被优化，跳过 PDF 重写")
        return

    # ── 阶段 6: bbox 覆盖率 ──
    analyze_bbox_coverage(pages, all_blocks)

    # ── 阶段 4: PDF 重写 ──
    output_path = test_rewrite_pdf(pages, optimized_texts, changes)

    # ── 阶段 5: 验证输出 ──
    verify_output_pdf(output_path, pages, optimized_texts, changes)

    # ── 最终总结 ──
    print("\n" + "=" * 70)
    print("测试完成！输出文件：")
    print(f"  1. 解析结果: {os.path.join(OUTPUT_DIR, '01_parse_result.json')}")
    print(f"  2. 调试 PDF: {debug_path}")
    print(f"  3. 优化变更: {os.path.join(OUTPUT_DIR, '03_optimize_changes.json')}")
    print(f"  4. 优化 PDF: {output_path}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())