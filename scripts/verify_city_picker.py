"""城市级联选择卡片全量验证：遍历所有区县城市 / 直选城市 / 热门城市。

用法：
    .venv/Scripts/python.exe scripts/verify_city_picker.py

期望值直接从前端数据源 frontend/src/lib/cities.ts 解析，保证与代码同步：
- 每个有区县数据的城市：选省 → 选市 → 区县面板（全市 + N 个区县）→ 选区县写回「城市·区县」
- 每个无区县数据的抽查城市：选省 → 选市 → 直接选中（无第三级）
- 全部热门城市：点击后进入区县面板（当前热门列表全是有区县数据的城市）
- 左侧省份列表滚动可达最后一个省份（西藏）
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = "http://localhost:3000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"

# 直选抽查城市（不在 CITY_DISTRICTS 中，点击即选中）
DIRECT_PICK_SAMPLE = ["咸阳", "赣州", "三亚", "兰州", "呼和浩特", "拉萨"]

passed = 0
failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name}" + (f" —— {detail}" if detail else ""))


def parse_cities_ts() -> tuple[dict[str, list[str]], dict[str, list[str]], list[str]]:
    """从 cities.ts 提取 CITY_DISTRICTS / PROVINCE_CITIES / HOT_CITIES。"""
    src = Path(__file__).resolve().parent.parent / "frontend/src/lib/cities.ts"
    text = src.read_text(encoding="utf-8")

    districts: dict[str, list[str]] = {}
    m = re.search(r"export const CITY_DISTRICTS[^=]*=\s*\{(.*?)\n\}", text, re.DOTALL)
    assert m, "未找到 CITY_DISTRICTS"
    for city, arr in re.findall(r"(\w+):\s*\[([^\]]*)\]", m.group(1)):
        districts[city] = re.findall(r"'([^']+)'", arr)

    provinces: dict[str, list[str]] = {}
    m = re.search(r"export const PROVINCE_CITIES[^=]*=\s*\[(.*?)\n\]", text, re.DOTALL)
    assert m, "未找到 PROVINCE_CITIES"
    for province, arr in re.findall(r"province:\s*'([^']+)',\s*cities:\s*\[([^\]]*)\]", m.group(1)):
        provinces[province] = re.findall(r"'([^']+)'", arr)

    m = re.search(r"export const HOT_CITIES\s*=\s*\[([^\]]*)\]", text)
    assert m, "未找到 HOT_CITIES"
    hot = re.findall(r"'([^']+)'", m.group(1))

    return districts, provinces, hot


def province_of(city: str, provinces: dict[str, list[str]]) -> str:
    return next(p for p, cs in provinces.items() if city in cs)


def wait_closed(page) -> None:
    """等面板（含关闭动画）彻底隐藏，避免下一次 is_visible 误判。"""
    try:
        page.locator('[data-testid="match-city-popover"]').wait_for(state="hidden", timeout=3000)
    except Exception:  # noqa: BLE001 本来就没开
        pass


def open_panel(page) -> None:
    """状态感知打开：面板已开时不要再点触发按钮（toggle 会把它关掉）。"""
    pop = page.locator('[data-testid="match-city-popover"]')
    if not pop.is_visible():
        page.locator('[data-testid="match-city-trigger"]').click()
    pop.wait_for(state="visible", timeout=5000)


def main() -> int:
    global passed, failed
    districts, provinces, hot = parse_cities_ts()
    print(f"数据源：{len(provinces)} 省 / {len(districts)} 个区县城市 / {len(hot)} 热门")

    errs: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"{FRONT}/login", wait_until="load", timeout=120000)
        page.get_by_placeholder("邮箱地址").fill(EMAIL)
        page.get_by_placeholder("密码").fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=90000)
        page.goto(f"{FRONT}/match", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        # ── 1. 全部区县城市：省 → 市 → 区县全流程 ──
        print(f"\n── 区县城市全流程（{len(districts)} 个）──")
        for city, ds in districts.items():
            province = province_of(city, provinces)
            open_panel(page)
            page.locator(".match-city-province", has_text=province).first.click()
            if len(provinces[province]) == 1:
                # 直辖市：点击省份直接进入区县面板
                page.locator('[data-testid="match-city-districts"]').wait_for(state="visible", timeout=3000)
            else:
                page.locator('[data-testid="match-city-option"]', has_text=city).first.click()
                page.locator('[data-testid="match-city-districts"]').wait_for(state="visible", timeout=3000)

            got = page.locator('[data-testid="match-city-district"]').count()
            check(f"{province}→{city}：区县数量 {got}=={len(ds)}", got == len(ds))
            check(f"{city}：有「全市」", page.locator('[data-testid="match-city-district-all"]').count() == 1)
            check(f"{city}：返回按钮显示城市", city in page.locator(".match-city-back").inner_text())

            first_district = page.locator('[data-testid="match-city-district"]').first.inner_text().strip()
            page.locator('[data-testid="match-city-district"]').first.click()
            page.wait_for_timeout(150)
            trigger = page.locator('[data-testid="match-city-trigger"]').inner_text().strip()
            check(f"{city}：写回「{city}·{first_district}」", trigger == f"{city}·{first_district}",
                  f"实际为「{trigger}」")
            wait_closed(page)

        # ── 2. 直选城市（无区县数据）：点击直接选中 ──
        print(f"\n── 直选城市抽查（{len(DIRECT_PICK_SAMPLE)} 个）──")
        for city in DIRECT_PICK_SAMPLE:
            province = province_of(city, provinces)
            open_panel(page)
            page.locator(".match-city-province", has_text=province).first.click()
            if len(provinces[province]) == 1:
                # 单城省份（甘肃/青海/西藏等）：点击省份即选中并关闭面板
                page.wait_for_timeout(150)
            else:
                page.locator('[data-testid="match-city-option"]', has_text=city).first.click()
                page.wait_for_timeout(150)
            wait_closed(page)
            trigger = page.locator('[data-testid="match-city-trigger"]').inner_text().strip()
            check(f"{province}→{city}：直接选中", trigger == city, f"实际为「{trigger}」")

        # ── 3. 全部热门城市：点击进入区县面板 + 高亮转移 ──
        print(f"\n── 热门城市（{len(hot)} 个）──")
        for city in hot:
            province = province_of(city, provinces)
            open_panel(page)
            page.locator(".match-city-hot .match-city-chip", has_text=city).first.click()
            page.locator('[data-testid="match-city-districts"]').wait_for(state="visible", timeout=3000)
            chip_cls = page.locator(".match-city-hot .match-city-chip", has_text=city).first.get_attribute("class") or ""
            prov_cls = page.locator(".match-city-province", has_text=province).first.get_attribute("class") or ""
            check(f"热门 {city}：进入区县面板", page.locator('[data-testid="match-city-districts"]').count() == 1)
            check(f"热门 {city}：chip 高亮", "active" in chip_cls)
            check(f"热门 {city}：省份高亮同步", "active" in prov_cls)

        # ── 4. 省份列表滚动：最后一个省份（西藏）可达且可选 ──
        print("\n── 省份列表滚动 ──")
        open_panel(page)
        page.locator(".match-city-province", has_text="西藏").first.click()
        page.wait_for_timeout(200)
        trigger = page.locator('[data-testid="match-city-trigger"]').inner_text().strip()
        check("滚动到西藏并直选拉萨", trigger == "拉萨", f"实际为「{trigger}」")
        wait_closed(page)

        # ── 5. 清除 ──
        open_panel(page)
        page.locator(".match-city-clear-all").click()
        page.wait_for_timeout(150)
        trigger = page.locator('[data-testid="match-city-trigger"]').inner_text().strip()
        check("清除后回到占位文案", "期望城市" in trigger, f"实际为「{trigger}」")
        wait_closed(page)

        # 热门城市全部有区县数据的一致性（数据源约束，防将来改数据时静默降级）
        print("\n── 数据一致性 ──")
        missing = [c for c in hot if c not in districts]
        check("热门城市全部支持区县", not missing, f"缺少区县数据：{missing}")
        unknown = [c for c in districts if c not in {x for cs in provinces.values() for x in cs}]
        check("区县城市都在省份映射中", not unknown, f"未挂到省份：{unknown}")

        browser.close()

    print(f"\n错误：{errs[:3] if errs else '无'}")
    print(f"结果：{passed} passed, {failed} failed")
    return 1 if failed or errs else 0


if __name__ == "__main__":
    sys.exit(main())
