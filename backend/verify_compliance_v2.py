"""
简历优化合规性验证 v2 — 精确版
修正检测逻辑，区分"旧文字残留"与"新文字正常显示"
"""
import os
import sys
import json
import logging

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("verify_v2")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "test_output")
ORIGINAL_IMG = os.path.join(OUTPUT_DIR, "07_rendered_page.png")
OPTIMIZED_IMG = os.path.join(OUTPUT_DIR, "07_optimized.png")
CHANGES_JSON = os.path.join(OUTPUT_DIR, "07_optimize_changes.json")
LAYOUT_JSON = os.path.join(OUTPUT_DIR, "07_layout.json")


def test_v2():
    """
    精确检测：
    1. 旧文字像素残留：同位置原图暗色 → 优化图暗色且颜色相近
    2. 背景色覆盖：填充色是否与周围一致
    3. 边缘溢出：新文字是否超出 bbox
    """
    from PIL import Image
    import numpy as np

    print("=" * 70)
    print("合规性验证 v2 — 精确检测")
    print("=" * 70)

    original = np.array(Image.open(ORIGINAL_IMG).convert("RGB"))
    optimized = np.array(Image.open(OPTIMIZED_IMG).convert("RGB"))

    with open(CHANGES_JSON, "r", encoding="utf-8") as f:
        changes = json.load(f)

    with open(LAYOUT_JSON, "r", encoding="utf-8") as f:
        layout = json.load(f)

    # ─── 检测 1：旧文字像素残留 ───
    print("\n" + "-" * 60)
    print("检测 1：旧文字像素残留（同位置暗色→暗色且颜色相近）")
    print("-" * 60)

    residue_issues = 0
    for change in changes:
        idx = change["block_index"]
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        crop_o = original[y0:y1, x0:x1]
        crop_n = optimized[y0:y1, x0:x1]

        if crop_o.size == 0 or crop_n.size == 0:
            continue

        # 暗色像素：RGB 三通道均 < 200
        orig_dark = np.all(crop_o < 200, axis=2)
        opt_dark = np.all(crop_n < 200, axis=2)

        # 核心：同位置都是暗色，且颜色差异 < 30（说明是同样的旧文字像素）
        same_position_dark = orig_dark & opt_dark
        if same_position_dark.any():
            # 检查颜色是否接近
            orig_dark_pixels = crop_o[same_position_dark]
            opt_dark_pixels = crop_n[same_position_dark]
            color_diff = np.abs(orig_dark_pixels.astype(int) - opt_dark_pixels.astype(int))
            close_color = np.all(color_diff < 30, axis=1)  # 颜色接近 → 旧文字残留
            far_color = ~close_color  # 颜色不同 → 新文字覆盖

            residue_count = np.sum(close_color)
            new_text_count = np.sum(far_color)
            orig_dark_count = np.sum(orig_dark)

            if orig_dark_count > 0:
                residue_pct = residue_count / orig_dark_count * 100
                if residue_pct > 10:  # 超过 10% 原文字像素残留
                    residue_issues += 1
                    print(f"  ❌ [{idx:3d}] {change['field_type']:12s} "
                          f"旧文字残留: {residue_pct:.0f}% ({residue_count}像素) "
                          f"新文字: {new_text_count}像素 ")

    if residue_issues == 0:
        print("  ✅ 所有区域旧文字已完全擦除，无残留")
    else:
        print(f"  ❌ {residue_issues} 个区域有旧文字残留")

    # ─── 检测 2：背景色覆盖 ───
    print("\n" + "-" * 60)
    print("检测 2：背景色覆盖（填充色 vs 周围色）")
    print("-" * 60)

    bg_issues = 0
    for change in changes:
        idx = change["block_index"]
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        h, w = optimized.shape[:2]

        # 采样外围颜色：与 _sample_background_color 使用相同逻辑
        # 采样 bbox 四角内侧 3x3 像素（与填充逻辑一致）
        outside_samples = []
        margin = 3
        sample_size = 3
        for dx in range(sample_size):
            for dy in range(sample_size):
                # 左上角
                px, py = x0 + margin + dx, y0 + margin + dy
                if 0 <= px < w and 0 <= py < h:
                    outside_samples.append(optimized[py, px])
                # 右上角
                px, py = x1 - margin - dx, y0 + margin + dy
                if 0 <= px < w and 0 <= py < h:
                    outside_samples.append(optimized[py, px])
                # 左下角
                px, py = x0 + margin + dx, y1 - margin - dy
                if 0 <= px < w and 0 <= py < h:
                    outside_samples.append(optimized[py, px])
                # 右下角
                px, py = x1 - margin - dx, y1 - margin - dy
                if 0 <= px < w and 0 <= py < h:
                    outside_samples.append(optimized[py, px])

        # 过滤暗色像素（与填充逻辑一致）
        bright = [p for p in outside_samples if p[0] > 180 and p[1] > 180 and p[2] > 180]
        if bright:
            outside_samples = bright

        if not outside_samples:
            continue

        outside_avg = np.mean(outside_samples, axis=0).astype(int)

        # 采样内部非文字区域（非暗色像素）
        crop_n = optimized[y0:y1, x0:x1]
        non_dark = ~np.all(crop_n < 200, axis=2)  # 非暗色 = 背景区域
        if non_dark.any():
            inside_bg = np.mean(crop_n[non_dark], axis=0).astype(int)
        else:
            inside_bg = np.mean(crop_n.reshape(-1, 3), axis=0).astype(int)

        diff = np.sum(np.abs(inside_bg.astype(int) - outside_avg.astype(int)))
        if diff > 30:
            bg_issues += 1
            if bg_issues <= 5:
                print(f"  ❌ [{idx:3d}] {change['field_type']:12s} "
                      f"内部RGB({inside_bg[0]},{inside_bg[1]},{inside_bg[2]}) ≠ "
                      f"外围RGB({outside_avg[0]},{outside_avg[1]},{outside_avg[2]}) 色差={diff}")
        elif diff > 15:
            if bg_issues <= 5:
                print(f"  ⚠️ [{idx:3d}] {change['field_type']:12s} "
                      f"轻微色差: 内部({inside_bg[0]},{inside_bg[1]},{inside_bg[2]}) "
                      f"外围({outside_avg[0]},{outside_avg[1]},{outside_avg[2]}) diff={diff}")

    if bg_issues == 0:
        print("  ✅ 所有擦除区域背景色与周围一致")
    else:
        print(f"  ❌ {bg_issues} 个区域有可见色块痕迹")

    # ─── 检测 3：新文字边缘溢出 ───
    print("\n" + "-" * 60)
    print("检测 3：新文字是否超出 bbox 范围")
    print("-" * 60)

    overflow_issues = 0
    for change in changes:
        idx = change["block_index"]
        bbox = change["bbox"]
        x0, y0, x1, y1 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        h, w = optimized.shape[:2]
        # 检查 bbox 外围 3px 是否有新文字溢出
        overflow_pixels = 0
        margin = 3

        # 下方溢出
        for y in range(y1, min(h, y1 + margin)):
            for x in range(x0, min(x1, w), 3):
                p = optimized[y, x]
                if p[0] < 200 and p[1] < 200 and p[2] < 200:
                    overflow_pixels += 1

        # 右侧溢出
        for x in range(x1, min(w, x1 + margin)):
            for y in range(y0, min(y1, h), 3):
                p = optimized[y, x]
                if p[0] < 200 and p[1] < 200 and p[2] < 200:
                    overflow_pixels += 1

        if overflow_pixels > 3:
            overflow_issues += 1
            if overflow_issues <= 5:
                print(f"  ❌ [{idx:3d}] {change['field_type']:12s} "
                      f"新文字溢出 bbox ({overflow_pixels} 暗色像素在边界外)")

    if overflow_issues == 0:
        print("  ✅ 所有新文字都在 bbox 范围内")
    else:
        print(f"  ❌ {overflow_issues} 个区域新文字溢出 bbox")

    # ─── 检测 4：新文字是否压住下方内容 ───
    print("\n" + "-" * 60)
    print("检测 4：新文字是否压住下方内容")
    print("-" * 60)

    # 构建块之间的垂直关系（只检查 optimized 块）
    optimized_indices = {c["block_index"] for c in changes}
    blocks_sorted = sorted(layout["blocks"], key=lambda b: b["bbox"][1])
    overlap_below = 0

    for i, block in enumerate(blocks_sorted):
        if block["index"] not in optimized_indices:
            continue  # 只检查被优化的块
        bbox = block["bbox"]
        # 找到正下方的块
        for j, other in enumerate(blocks_sorted):
            if other["bbox"][1] <= bbox[3] + 5:
                continue
            # 垂直相邻且水平重叠
            if (bbox[0] < other["bbox"][2] and bbox[2] > other["bbox"][0]):
                gap = other["bbox"][1] - bbox[3]
                # 检查优化后的 bbox 是否侵入下方块
                # 读取优化后的实际暗色像素最下端
                crop_n = optimized[int(bbox[1]):min(h, int(bbox[3] + 20)), int(bbox[0]):int(bbox[2])]
                if crop_n.size > 0:
                    # 找到最后一行有暗色像素的位置
                    for row in range(crop_n.shape[0] - 1, -1, -1):
                        if np.any(np.all(crop_n[row] < 200, axis=1)):
                            actual_bottom = int(bbox[1]) + row
                            if actual_bottom > other["bbox"][1] and gap < 20:
                                overlap_below += 1
                                if overlap_below <= 5:
                                    print(f"  ❌ [{block['index']:3d}] {block.get('type',''):12s} "
                                          f"压住下方 [{other['index']:3d}] (间距={gap}px)")
                            break
                break  # 只检查最近的下方块

    if overlap_below == 0:
        print("  ✅ 无内容压住下方模块")
    else:
        print(f"  ❌ {overlap_below} 处内容压住下方模块")

    # ─── 总结 ───
    print("\n" + "=" * 70)
    print("V2 合规性判定")
    print("=" * 70)
    print(f"  旧文字残留:  {'✅ 通过' if residue_issues == 0 else '❌ ' + str(residue_issues) + ' 处'}")
    print(f"  背景色覆盖:  {'✅ 通过' if bg_issues == 0 else '❌ ' + str(bg_issues) + ' 处色块'}")
    print(f"  新文字溢出:  {'✅ 通过' if overflow_issues == 0 else '❌ ' + str(overflow_issues) + ' 处'}")
    print(f"  压住下方:    {'✅ 通过' if overlap_below == 0 else '❌ ' + str(overlap_below) + ' 处'}")


if __name__ == "__main__":
    test_v2()