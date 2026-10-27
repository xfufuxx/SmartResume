"""仪表盘「优化方向分布」环形图几何回归（需 :3000/:8000 在线）。

守的是 2026-10-27 修掉的一类 bug：ECharts 饼图的 center/radius 是**画布百分比**，
`center: ['34%']` + `radius: '80%'` 在窄卡片里会让外圆越过画布左边界（实测
176px 宽画布 → 左边缘 -10.5px），左侧圆弧被垂直切断；同时内置 legend 与卡片
底部的自定义图例重复，把圆环挤得更窄。

脚本用 **canvas 像素扫描**取圆环真实包围盒（不依赖 option 字面值，改配置也能
守住观感），逐视口断言：
  C1 圆环已渲染（环色像素数 > 200）
  C2 四边均未裁切（包围盒距画布边 ≥ 2px）
  C3 水平居中（|环心x - 画布w/2| ≤ 3）
  C4 垂直居中（|环心y - 画布h/2| ≤ 3）
  C5 圆环右侧无重复内置图例（该区域暗像素 < 30）
  C6 中心数字块水平居中（|文字块中心 - 画布中心| ≤ 4）
  C7 扇形数据一致（底部分项数值之和 == 中心总数）

运行：./backend/.venv/Scripts/python.exe scripts/verify_dashboard_pie.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
VIEWPORTS = (1600, 1440, 1100, 860, 620, 420)

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def get_token():
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(f"{API}/api/auth/login", data=body,
                                 headers={"Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["access_token"], data.get("refresh_token")


#: 在页面内取圆环像素包围盒 + 中心文字块几何
MEASURE = r"""
() => {
  const cards = [...document.querySelectorAll('.app-card')];
  const card = cards.find(c => c.innerText.includes('优化方向分布'));
  if (!card) return {error: 'card not found'};
  const wrap = card.querySelector('div[style*="position: relative"]');
  const holder = wrap ? wrap.firstElementChild : null;
  const canvas = card.querySelector('canvas');
  const center = wrap ? wrap.querySelector('div[style*="absolute"]') : null;
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return {left:+r.left.toFixed(1), top:+r.top.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1)}; };
  const out = {canvasRect: rect(canvas), centerRect: rect(center),
               footText: card.innerText.replace(/\s+/g, ' ')};
  if (!canvas) return out;

  const W = canvas.width, H = canvas.height;
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const dpr = W / (out.canvasRect.w || W);
  const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const isRing = ([r, g, b, a]) => a > 200 && !(r > 235 && g > 235 && b > 235) &&
    ((b > 150 && r < 120 && g < 190) || (g > 120 && r < 130 && b < 170) ||
     (r > 190 && g > 110 && g < 215 && b < 120));

  let minX = W, maxX = -1, minY = H, maxY = -1, n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (isRing(px(x, y))) { n++; if (x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  out.ringPixels = n;
  out.canvasPx = {w: W, h: H, dpr: +dpr.toFixed(2)};
  if (maxX < 0) return out;
  out.ring = {
    left: +(minX / dpr).toFixed(1), right: +(maxX / dpr).toFixed(1),
    top: +(minY / dpr).toFixed(1), bottom: +(maxY / dpr).toFixed(1),
  };
  // 圆环右侧（原内置图例所在区）的暗像素 → 判断图例是否还在
  let dark = 0;
  for (let y = 0; y < H; y += 2) for (let x = maxX + Math.round(2 * dpr); x < W; x += 2) {
    const [r, g, b, a] = px(x, y);
    if (a < 30 || (r > 248 && g > 248 && b > 248)) continue;
    if (0.299 * r + 0.587 * g + 0.114 * b < 235) dark++;
  }
  out.rightDarkPixels = dark;
  return out;
}
"""


def main():
    token, refresh = get_token()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in VIEWPORTS:
            print(f"\n[{width}px]")
            ctx = browser.new_context(viewport={"width": width, "height": 1000})
            ctx.add_cookies([
                {"name": "sr-token", "value": token, "domain": "localhost", "path": "/"},
                {"name": "sr-refresh", "value": refresh, "domain": "localhost", "path": "/"},
            ])
            page = ctx.new_page()
            page.goto(f"{BASE}/login", wait_until="domcontentloaded")
            page.evaluate("([t, r]) => { localStorage.setItem('token', t); if (r) localStorage.setItem('refreshToken', r); }",
                          [token, refresh])
            page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            page.wait_for_selector(".app-card", timeout=30000)
            page.locator(".app-card", has_text="优化方向分布").first.scroll_into_view_if_needed()
            page.wait_for_timeout(3_000)  # 等 ECharts 入场动画结束
            d = page.evaluate(MEASURE)

            if d.get("error") or not d.get("canvasPx"):
                check("找到环形图卡片与画布", False, str(d.get("error") or d))
                ctx.close()
                continue

            W, H = d["canvasPx"]["w"], d["canvasPx"]["h"]
            r = d.get("ring")
            check("C1 圆环已渲染", d.get("ringPixels", 0) > 200, f"pixels={d.get('ringPixels')}")
            if not r:
                ctx.close()
                continue

            check("C2a 左侧未裁切", r["left"] >= 2, f"left={r['left']}")
            check("C2b 右侧未裁切", r["right"] <= W - 2, f"right={r['right']} canvasW={W}")
            check("C2c 顶部未裁切", r["top"] >= 2, f"top={r['top']}")
            check("C2d 底部未裁切", r["bottom"] <= H - 2, f"bottom={r['bottom']} canvasH={H}")

            cx = (r["left"] + r["right"]) / 2
            cy = (r["top"] + r["bottom"]) / 2
            check("C3 圆环水平居中", abs(cx - W / 2) <= 3,
                  f"环心x={cx:.1f} 画布中心={W / 2:.1f}")
            check("C4 圆环垂直居中", abs(cy - H / 2) <= 3,
                  f"环心y={cy:.1f} 画布中心={H / 2:.1f}")

            check("C5 无重复内置图例", d.get("rightDarkPixels", 999) < 30,
                  f"圆环右侧暗像素={d.get('rightDarkPixels')}")

            c_rect, cv = d.get("centerRect"), d["canvasRect"]
            if c_rect and cv:
                off = abs((c_rect["left"] + c_rect["w"] / 2) - (cv["left"] + cv["w"] / 2))
                check("C6 中心数字水平居中", off <= 4, f"偏移={off:.1f}px")

            # 底部分项之和 == 中心总数
            nums = re.findall(r"(\d+)\s*\(\d+%\)", d.get("footText", ""))
            total = re.search(r"\s(\d+)\s*总数", d.get("footText", ""))
            if nums and total:
                check("C7 分项之和 == 总数", sum(map(int, nums)) == int(total.group(1)),
                      f"分项{nums} 总数={total.group(1)}")
            ctx.close()
        browser.close()

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
