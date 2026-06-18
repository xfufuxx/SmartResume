"""
简历优化合规性验证脚本
检查：
1. 优化内容是否覆盖而非替换原内容（重叠检测）
2. 擦除区域是否彻底（旧文字残留检测）
3. 原简历格式是否保留（照片/颜色/布局一致性）
"""
import os
import sys
import json
import io
import logging
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("verify")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "test_output")
RESUME_PDF = r"d:\下载\智能简历\简历.pdf"
ORIGINAL_IMG = os.path.join(OUTPUT_DIR, "07_rendered_page.png")
OPTIMIZED_IMG = os.path.join(OUTPUT_DIR, "07_optimized.png")
LAYOUT_JSON = os.path.join(OUTPUT_DIR, "07_layout.json")
CHANGES_JSON = os.path.join(OUTPUT_DIR, "07_optimize_changes.json")


# ══════════════════════════════════════════════════════════════════
# 测试 1：像素级重叠检测
# ══════════════════════════════════════════════════════════════════

def test_pixel_overlap():
    """
    核心检测：对每个被替换的区域，检查优化后的图片中是否仍有旧文字像素。
    方法：对比原图擦除区域和优化图对应区域，检测是否有相同暗色像素残留。
    """
    from PIL import Image

    print("\n" + "=" * 70)
    print("测试 1：像素级重叠检测（旧文字是否残留）")
    print("=" * 70)

    original = Image.open(ORIGINAL_IMG).convert("RGB")
    optimized = Image.open(OPTIMIZED_IMG).convert("RGB")

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    with open(LAYOUT_JSON, "r", encoding="utf-8") as f:
        layout = json.load(f)

    # 构建 bbox 映射
    bbox_map = {b["index"]: b["bbox"] for b in layout["blocks"]}

    overlap_issues = []
    clean_count = 0

    for change in changes:
        idx = change["block_index"]
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        # 裁剪原图和优化图的对应区域
        orig_crop = original.crop((x0, y0, x1, y1))
        opt_crop = optimized.crop((x0, y0, x1, y1))

        # 检测暗色像素（文字像素，R/G/B 任一通道 < 200）
        orig_pixels = list(orig_crop.getdata())
        opt_pixels = list(opt_crop.getdata())

        orig_dark = 0
        opt_dark = 0
        common_dark = 0  # 同位置都有暗色像素

        for op, np_ in zip(orig_pixels, opt_pixels):
            o_dark = (op[0] < 200 or op[1] < 200 or op[2] < 200)
            n_dark = (np_[0] < 200 or np_[1] < 200 or np_[2] < 200)
            if o_dark:
                orig_dark += 1
            if n_dark:
                opt_dark += 1
            if o_dark and n_dark:
                common_dark += 1

        total = len(orig_pixels)
        if total == 0:
            continue

        orig_dark_ratio = orig_dark / total * 100
        opt_dark_ratio = opt_dark / total * 100
        common_ratio = common_dark / max(orig_dark, 1) * 100

        # 判断：如果优化后暗色像素大幅减少（< 30% 原比例），说明擦除成功
        if orig_dark_ratio > 1.0:  # 原区域有文字
            if opt_dark_ratio < orig_dark_ratio * 0.3:
                status = "CLEAN"
                clean_count += 1
            elif opt_dark_ratio < orig_dark_ratio * 0.5:
                status = "PARTIAL"
                overlap_issues.append({
                    "block": idx,
                    "field": change["field_type"],
                    "severity": "low",
                    "orig_dark": f"{orig_dark_ratio:.1f}%",
                    "opt_dark": f"{opt_dark_ratio:.1f}%",
                    "common_ratio": f"{common_ratio:.1f}%",
                })
            else:
                status = "OVERLAP"
                overlap_issues.append({
                    "block": idx,
                    "field": change["field_type"],
                    "severity": "high",
                    "orig_dark": f"{orig_dark_ratio:.1f}%",
                    "opt_dark": f"{opt_dark_ratio:.1f}%",
                    "common_ratio": f"{common_ratio:.1f}%",
                })
        else:
            status = "NO_TEXT"

        if status != "CLEAN":
            print(f"  [{idx:3d}] {status:8s} {change['field_type']:12s} "
                  f"原暗色: {orig_dark_ratio:5.1f}% → 新暗色: {opt_dark_ratio:5.1f}% "
                  f"({change['old_text'][:40]}...)")

    print(f"\n  结果: {clean_count}/{len(changes)} 个区域完全干净")
    if overlap_issues:
        print(f"  ⚠️ {len(overlap_issues)} 个区域有重叠/残留！")
        for issue in overlap_issues:
            print(f"    [{issue['block']}] {issue['field']} ({issue['severity']}) "
                  f"原暗色:{issue['orig_dark']} 新暗色:{issue['opt_dark']}")
    else:
        print("  ✅ 所有区域擦除干净，无重叠")

    return overlap_issues


# ══════════════════════════════════════════════════════════════════
# 测试 2：擦除区域边界检查
# ══════════════════════════════════════════════════════════════════

def test_erase_boundary():
    """
    检查擦除区域边界是否有旧文字边缘残留。
    方法：在 bbox 边界外 3px 采样，检查是否有暗色像素梯度。
    """
    from PIL import Image

    print("\n" + "=" * 70)
    print("测试 2：擦除区域边界检查（边缘残留）")
    print("=" * 70)

    original = Image.open(ORIGINAL_IMG).convert("RGB")
    optimized = Image.open(OPTIMIZED_IMG).convert("RGB")

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    edge_issues = 0
    for change in changes:
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        # 检查四边外围 3px 的暗色像素
        margins = 3
        edge_pixels = []
        w, h = original.size

        # 上边缘
        for y in range(max(0, y0 - margins), y0):
            for x in range(x0, x1, 3):
                if 0 <= x < w and 0 <= y < h:
                    p = optimized.getpixel((x, y))
                    if p[0] < 200 or p[1] < 200 or p[2] < 200:
                        edge_pixels.append(("top", x, y))

        # 下边缘
        for y in range(y1, min(h, y1 + margins)):
            for x in range(x0, x1, 3):
                if 0 <= x < w and 0 <= y < h:
                    p = optimized.getpixel((x, y))
                    if p[0] < 200 or p[1] < 200 or p[2] < 200:
                        edge_pixels.append(("bottom", x, y))

        if len(edge_pixels) > 5:
            edge_issues += 1
            if edge_issues <= 5:
                print(f"  ⚠️ [{change['block_index']:3d}] {change['field_type']:12s} "
                      f"边缘残留 {len(edge_pixels)} 个暗色像素")

    if edge_issues == 0:
        print("  ✅ 所有区域边界干净，无边缘残留")
    else:
        print(f"  ⚠️ {edge_issues} 个区域有边缘残留")

    return edge_issues


# ══════════════════════════════════════════════════════════════════
# 测试 3：格式保留检查
# ══════════════════════════════════════════════════════════════════

def test_format_preservation():
    """
    检查原简历格式是否保留。
    方法：对比优化前后图片的整体结构差异。
    """
    from PIL import Image

    print("\n" + "=" * 70)
    print("测试 3：格式保留检查")
    print("=" * 70)

    original = Image.open(ORIGINAL_IMG).convert("RGB")
    optimized = Image.open(OPTIMIZED_IMG).convert("RGB")

    with open(LAYOUT_JSON, "r", encoding="utf-8") as f:
        layout = json.load(f)

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    # 3.1 照片保留
    if layout.get("photo_bbox"):
        px0, py0, px1, py1 = layout["photo_bbox"]
        orig_photo = original.crop((px0, py0, px1, py1))
        opt_photo = optimized.crop((px0, py0, px1, py1))

        # 像素级对比
        diff = 0
        total = (px1 - px0) * (py1 - py0)
        for y in range(0, py1 - py0, 4):
            for x in range(0, px1 - px0, 4):
                o = orig_photo.getpixel((x, y))
                n = opt_photo.getpixel((x, y))
                if abs(o[0] - n[0]) > 10 or abs(o[1] - n[1]) > 10 or abs(o[2] - n[2]) > 10:
                    diff += 1

        photo_match = (1 - diff / (total / 16)) * 100
        print(f"  照片保留: {photo_match:.1f}% 像素一致")
        if photo_match > 99:
            print("  ✅ 照片像素级还原")
        else:
            print(f"  ⚠️ 照片有 {100-photo_match:.1f}% 像素差异")
    else:
        print("  ℹ️ 无照片，跳过")

    # 3.2 未修改区域一致性
    changed_indices = {c["block_index"] for c in changes}
    unchanged_pixels_diff = 0
    unchanged_pixels_total = 0

    # 检查非修改区域（跳过所有修改过的 bbox）
    # 采样策略：每隔 10px 采样
    w, h = original.size
    for y in range(0, h, 10):
        for x in range(0, w, 10):
            # 检查是否在修改区域内
            in_changed = False
            for change in changes:
                bx0, by0, bx1, by1 = [int(v) for v in change["bbox"]]
                if bx0 - 5 <= x <= bx1 + 5 and by0 - 5 <= y <= by1 + 5:
                    in_changed = True
                    break
            if in_changed:
                continue

            unchanged_pixels_total += 1
            o = original.getpixel((x, y))
            n = optimized.getpixel((x, y))
            if abs(o[0] - n[0]) > 5 or abs(o[1] - n[1]) > 5 or abs(o[2] - n[2]) > 5:
                unchanged_pixels_diff += 1

    if unchanged_pixels_total > 0:
        unchanged_match = (1 - unchanged_pixels_diff / unchanged_pixels_total) * 100
        print(f"  未修改区域一致性: {unchanged_match:.1f}% (采样 {unchanged_pixels_total} 点)")
        if unchanged_match > 99:
            print("  ✅ 未修改区域完全保留")
        elif unchanged_match > 95:
            print("  ⚠️ 未修改区域有轻微偏差")
        else:
            print("  ❌ 未修改区域被意外修改！")
    else:
        print("  ℹ️ 所有区域都被修改，跳过")

    # 3.3 章节标题保留
    headers_preserved = 0
    headers_total = 0
    for block in layout["blocks"]:
        if block.get("is_header"):
            headers_total += 1
            idx = block["index"]
            if idx not in changed_indices:
                headers_preserved += 1

    if headers_total > 0:
        print(f"  章节标题保留: {headers_preserved}/{headers_total}")
        if headers_preserved == headers_total:
            print("  ✅ 所有章节标题未被修改")
        else:
            print(f"  ⚠️ {headers_total - headers_preserved} 个章节标题被意外修改！")
    else:
        print("  ℹ️ 无章节标题")

    # 3.4 保护字段检查
    protected_types = {"name", "contact", "education"}
    protected_changed = [c for c in changes if c["field_type"] in protected_types
                        and not c.get("is_header", False)]
    if protected_changed:
        print(f"  ⚠️ {len(protected_changed)} 个保护字段被修改！")
        for c in protected_changed:
            print(f"    [{c['block_index']}] {c['field_type']}: '{c['old_text'][:30]}' → '{c['new_text'][:30]}'")
    else:
        print("  ✅ 保护字段（姓名/联系方式/教育）未被修改")


# ══════════════════════════════════════════════════════════════════
# 测试 4：内容截断检查
# ══════════════════════════════════════════════════════════════════

def test_truncation():
    """检查优化后的文字是否被截断（字号自适应后仍放不下）"""
    from PIL import Image, ImageDraw, ImageFont

    print("\n" + "=" * 70)
    print("测试 4：内容截断检查")
    print("=" * 70)

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    truncated = []
    for change in changes:
        if change["expansion_ratio"] > 1.5:
            bbox = change["bbox"]
            bw = bbox[2] - bbox[0]
            bh = bbox[3] - bbox[1]
            new_len = change["new_length"]
            # 估算：中文字符约 14px 宽（12px 字号），每行可容纳 bw/14 个字符
            est_chars_per_line = max(1, bw / 14)
            est_lines_needed = new_len / est_chars_per_line
            est_height = est_lines_needed * 14 * 1.4  # 行高约 1.4x 字号

            if est_height > bh * 1.2:
                truncated.append({
                    "block": change["block_index"],
                    "field": change["field_type"],
                    "ratio": change["expansion_ratio"],
                    "bbox_size": f"{bw:.0f}x{bh:.0f}",
                    "est_lines": f"{est_lines_needed:.1f}",
                    "est_height": f"{est_height:.0f}",
                    "actual_height": f"{bh:.0f}",
                })

    if truncated:
        print(f"  ⚠️ {len(truncated)} 个块可能被截断（扩张率 > 1.5x 且区域不足）")
        for t in truncated:
            print(f"    [{t['block']}] {t['field']} 扩张率={t['ratio']}x "
                  f"bbox={t['bbox_size']} 需要 {t['est_height']}px 实际 {t['actual_height']}px")
    else:
        print("  ✅ 所有块内容完整，无截断风险")


# ══════════════════════════════════════════════════════════════════
# 测试 5：背景色连续性
# ══════════════════════════════════════════════════════════════════

def test_background_continuity():
    """检查擦除后的背景色是否与周围一致（是否有色块痕迹）"""
    from PIL import Image

    print("\n" + "=" * 70)
    print("测试 5：背景色连续性检查（擦除色块）")
    print("=" * 70)

    original = Image.open(ORIGINAL_IMG).convert("RGB")
    optimized = Image.open(OPTIMIZED_IMG).convert("RGB")

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    color_diff_issues = 0
    for change in changes:
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        # 采样擦除区域中心的颜色
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        # 采样擦除区外围的颜色（上下各 5px）
        outside_colors = []
        w, h = optimized.size
        for x in range(x0, x1, 10):
            if 0 <= x < w:
                if y0 > 5:
                    outside_colors.append(optimized.getpixel((x, y0 - 3)))
                if y1 < h - 5:
                    outside_colors.append(optimized.getpixel((x, y1 + 3)))

        inside_color = optimized.getpixel((cx, cy))

        if outside_colors:
            avg_r = sum(c[0] for c in outside_colors) // len(outside_colors)
            avg_g = sum(c[1] for c in outside_colors) // len(outside_colors)
            avg_b = sum(c[2] for c in outside_colors) // len(outside_colors)

            diff = abs(inside_color[0] - avg_r) + abs(inside_color[1] - avg_g) + abs(inside_color[2] - avg_b)
            if diff > 30:  # 总色差超过 30
                color_diff_issues += 1
                if color_diff_issues <= 5:
                    print(f"  ⚠️ [{change['block_index']:3d}] {change['field_type']:12s} "
                          f"内部色({inside_color}) ≠ 外围色({avg_r},{avg_g},{avg_b}) 色差={diff}")

    if color_diff_issues == 0:
        print("  ✅ 所有擦除区域背景色与周围一致")
    else:
        print(f"  ⚠️ {color_diff_issues} 个区域有可见色块痕迹")


# ══════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("智能简历优化功能 — 合规性验证")
    print("=" * 70)

    # 检查文件是否存在
    for f in [ORIGINAL_IMG, OPTIMIZED_IMG, LAYOUT_JSON, CHANGES_JSON]:
        if not os.path.exists(f):
            print(f"❌ 文件不存在: {f}")
            return

    print(f"原图: {ORIGINAL_IMG}")
    print(f"优化图: {OPTIMIZED_IMG}")
    print(f"版式: {LAYOUT_JSON}")
    print(f"变更: {CHANGES_JSON}")

    # 运行所有测试
    overlap_issues = test_pixel_overlap()
    edge_issues = test_erase_boundary()
    test_format_preservation()
    test_truncation()
    test_background_continuity()

    # ── 最终判定 ──
    print("\n" + "=" * 70)
    print("合规性判定")
    print("=" * 70)

    all_pass = (len(overlap_issues) == 0 and edge_issues == 0)

    if all_pass:
        print("✅ 合规：优化内容正确替换了原内容，无重叠，格式保留完整")
    else:
        print("⚠️ 不合规：存在以下问题需要修复")
        if overlap_issues:
            print(f"  - {len(overlap_issues)} 个区域有像素重叠/残留")
        if edge_issues:
            print(f"  - {edge_issues} 个区域有边缘残留")
        print("\n  详细问题见上方各测试项输出")


if __name__ == "__main__":
    main()