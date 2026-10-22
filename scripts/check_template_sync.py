#!/usr/bin/env python
"""
模板体系一致性快测（秒级，纯静态解析 + 本地渲染，无需起服务/浏览器）。

检什么
------
1. **四集合相等**：前端 registry 的 id 集 == 后端 TEMPLATE_META 键集 ==
   ``templates/*.html`` 文件名集 == 打印白名单（``_ALLOWED_TEMPLATES`` /
   ``JINJA2_STYLE_TEMPLATES``，现已从 TEMPLATE_META 派生，仍做实测比对防回退）。
2. **字段完备性**：版本号语义化、分类合法、industries/tags 非空、theme 四色齐备、
   react 模式必须有 lazyComponent 且组件文件存在、id 与模板文件名一致。
3. **前后端逐字段一致**：name / version / category / theme / layoutFeatures。
4. **渲染产物**：每个模板渲染一次（Jinja + 打印基座），断言 ``@page`` 边距与
   layoutFeatures 相符、含 ``print-color-adjust`` / ``break-inside`` /
   ``<meta name="template-id">``、深色侧栏含 ``box-decoration-break``。
5. **演示数据一致**：后端 ``app/api/templates.py::_DEMO_RESUME``（经
   ``GET /api/templates/demo`` 下发）与前端 ``lib/template-demo-data.ts``
   （React 组件预览的静态副本）逐字段深比较——两侧是同一数据的双形态，
   任一侧漂移都会被这里拦下（iframe 预览走后端、组件预览走前端）。
6. **Registry 入口纪律**：纯模块 ``lib/template-registry.ts`` 不含注册动作，
   任何源码不得绕过 ``lib/templates-register.tsx`` 直接 import 它
   （否则得到空 Registry——编译期不报错、运行期模板全失踪）。

为什么检查渲染产物而不是 HTML 源文件
------------------------------------
打印规则已收敛到 ``app/services/print_css.py`` 基座（由版式特征驱动），模板源文件
里不再需要重复写 ``@page`` / ``break-inside``。因此断言必须落在**最终渲染结果**上，
否则会逼着模板继续复制粘贴规则——那正是本次重构要消灭的问题。

用法
----
    backend/.venv/Scripts/python.exe scripts/check_template_sync.py
    backend/.venv/Scripts/python.exe scripts/check_template_sync.py -q   # 只打印失败项

退出码：0 全绿；1 有失败项（可直接挂 pre-commit / CI）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
REGISTRY_FILE = FRONTEND / "src" / "lib" / "templates-register.tsx"
DEMO_FILE = FRONTEND / "src" / "lib" / "template-demo-data.ts"
TEMPLATE_DIR = BACKEND / "app" / "templates"

#: 非「风格模板」的渲染壳（布局导出用），不参与模板集合比对
NON_STYLE_TEMPLATES = {"layout_export"}

CATEGORIES = {"business", "creative", "tech", "academic", "simple"}
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
HEX = re.compile(r"^#[0-9a-fA-F]{3,8}$")
THEME_KEYS = {"primary", "secondary", "bg", "text"}

_features_default = {
    "fullBleedHeader": False,
    "darkBackground": False,
    "sidebarSide": None,
    "sidebarWidthMm": None,
    "sidebarDark": False,
    "twoColumn": False,
    "timeline": False,
    "pageMarginYMm": 15,
    "pageMarginXMm": 15,
}

_results: list[tuple[bool, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    _results.append((bool(ok), name, detail))
    return bool(ok)


def report(quiet: bool) -> int:
    failed = [r for r in _results if not r[0]]
    if not quiet:
        for ok, name, detail in _results:
            if ok:
                print(f"[PASS] {name}")
    for _, name, detail in failed:
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))
    total = len(_results)
    print(f"\n{'✅' if not failed else '❌'} {total - len(failed)}/{total} 通过"
          + (f"，{len(failed)} 项失败" if failed else ""))
    return 0 if not failed else 1


# ══════════════════════════════════════════════════════════════════════
# 解析前端 registry
# ══════════════════════════════════════════════════════════════════════

def _parse_lf(args: str) -> dict:
    """解析 `LF({ fullBleedHeader: true, sidebarSide: 'left', sidebarWidthMm: 71.4 })` 的参数。"""
    out = dict(_features_default)
    for key, raw in re.findall(r"(\w+):\s*([^,}]+)", args or ""):
        value = raw.strip()
        if value in ("true", "false"):
            out[key] = value == "true"
        elif value == "null":
            out[key] = None
        elif value.startswith(("'", '"')):
            out[key] = value.strip("'\"")
        else:
            try:
                out[key] = float(value) if "." in value else int(value)
            except ValueError:
                out[key] = value
    return out


#: textDefaults 的后端等价默认（用于缺省比较；academic 的字体栈单列）
_TEXT_DEFAULT_KEYS = ("baseFontSizePt", "lineHeight", "sectionGapMm", "fontFamily")


def _parse_td(args: str) -> dict:
    """解析 `TD({ baseFontSizePt: 10, lineHeight: 1.6, sectionGapMm: 4.2 })` 的参数。

    注意：引号串内可能含逗号（academic 的衬线字体栈），必须先匹配引号串再匹配裸值。
    """
    out: dict = {"baseFontSizePt": None, "lineHeight": None, "sectionGapMm": None, "fontFamily": None}
    for key, raw in re.findall(
        r"(\w+):\s*(\"(?:[^\"\\]|\\.)*\"|'[^']*'|[^,}]+)", args or ""
    ):
        value = raw.strip()
        if value.startswith(("'", '"')):
            out[key] = value[1:-1]
        else:
            try:
                out[key] = float(value) if "." in value else int(value)
            except ValueError:
                out[key] = value
    return out


def parse_registry() -> dict[str, dict]:
    src = REGISTRY_FILE.read_text(encoding="utf-8")
    start = src.index("TemplateRegistry.registerAll([")
    block = src[start:]
    out: dict[str, dict] = {}
    # 逐条目切分：以 "    id: 'xxx'," 为界
    entries = re.split(r"(?m)^  \{\n(?=    id: )", block)[1:]
    for entry in entries:
        m = re.search(r"id: '([^']+)'", entry)
        if not m:
            continue
        tid = m.group(1)
        name = re.search(r"name: '([^']*)'", entry)
        version = re.search(r"version: '([^']*)'", entry)
        category = re.search(r"category: '([^']*)'", entry)
        layout = re.search(r"layout: '([^']*)'", entry)
        render_mode = re.search(r"renderMode: '([^']*)'", entry)
        lazy = re.search(r"lazyComponent: \(\) => import\('([^']+)'\)", entry)
        theme = re.search(r"theme: \{([^}]*)\}", entry)
        industries = re.search(r"industries: \[([^\]]*)\]", entry)
        tags = re.search(r"tags: \[([^\]]*)\]", entry)
        lf = re.search(r"layoutFeatures: LF\((\{.*?\})?\)", entry, re.S)
        td = re.search(r"textDefaults: TD\((\{.*?\})?\)", entry, re.S)
        out[tid] = {
            "name": name.group(1) if name else None,
            "version": version.group(1) if version else None,
            "category": category.group(1) if category else None,
            "layout": layout.group(1) if layout else None,
            "renderMode": render_mode.group(1) if render_mode else None,
            "lazyComponent": lazy.group(1) if lazy else None,
            "theme": {
                k: v.strip().strip("'\"")
                for k, v in re.findall(r"(\w+):\s*('[^']*'|\"[^\"]*\"|#[0-9a-fA-F]+)", theme.group(1))
            } if theme else {},
            "industries": [x.strip().strip("'\"") for x in industries.group(1).split(",") if x.strip()] if industries else [],
            "tags": [x.strip().strip("'\"") for x in tags.group(1).split(",") if x.strip()] if tags else [],
            "layoutFeatures": _parse_lf(lf.group(1)) if lf else None,
            "textDefaults": _parse_td(td.group(1)) if td else None,
        }
    return out


# ══════════════════════════════════════════════════════════════════════
# 演示数据（后端 _DEMO_RESUME vs 前端 template-demo-data.ts）
# ══════════════════════════════════════════════════════════════════════

def _extract_object_literal(src: str, anchor: str, *, quote_keys: bool) -> dict | None:
    """从源码中截取 `anchor = { ... }` 的对象字面量并求值为 dict。

    - 后端是合法 Python 字典字面量（支持括号内隐式字符串拼接），直接 ``literal_eval``；
    - 前端是 TS 对象字面量，与 Python 字面量的唯一差异是「键未加引号」，
      先给裸键补引号再求值（``quote_keys=True``）。
    解析失败一律返回 None——调用方按断言失败处理，绝不静默跳过。
    """
    import ast

    m = re.search(anchor + r"\s*=\s*\{", src)
    if not m:
        return None
    start = m.end() - 1  # 第一个 {
    depth = 0
    body = None
    for i in range(start, len(src)):
        ch = src[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                body = src[start:i + 1]
                break
    if body is None:
        return None
    if quote_keys:
        # {key: / ,key: / [后 key: → "key":（误匹配字符串内容会致求值失败，属安全失败）
        body = re.sub(r"([{,]\s*)([A-Za-z_]\w*)\s*:", r'\1"\2":', body)
    try:
        value = ast.literal_eval(body)
    except (ValueError, SyntaxError):
        return None
    return value if isinstance(value, dict) else None


def _diff_path(a, b, path: str = "") -> str:
    """递归找出两个结构第一处差异，返回可读路径（用于失败详情）。"""
    if type(a) is not type(b):
        return f"{path or '.'}: {type(a).__name__} vs {type(b).__name__}"
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                return f"{path}.{k}: 仅一侧存在"
            sub = _diff_path(a[k], b[k], f"{path}.{k}")
            if sub:
                return sub
        return ""
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: 长度 {len(a)} vs {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            sub = _diff_path(x, y, f"{path}[{i}]")
            if sub:
                return sub
        return ""
    return "" if a == b else f"{path}: {a!r} vs {b!r}"


# ══════════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════════

def main() -> int:
    ap = argparse.ArgumentParser(description="模板体系一致性快测")
    ap.add_argument("-q", "--quiet", action="store_true", help="只打印失败项")
    ap.add_argument("--deep", action="store_true",
                    help="额外导入 app.api.optimization 做白名单运行时比对（多 ~7s，CI 用）")
    args = ap.parse_args()

    sys.path.insert(0, str(BACKEND))
    from app.services.template_meta import TEMPLATE_META  # noqa: E402
    from app.services.pdf_generator import render_template_html  # noqa: E402

    # 快测刻意不 import api/styler 模块（会拉起 SQLAlchemy / fastapi / openai，多 5-7s）：
    # 白名单一致性走「源码派生校验」，--deep 时才做真正的运行时集合比对。
    _ALLOWED_TEMPLATES: set[str] | None = None
    _STYLE_TEMPLATES: set[str] | None = None
    if args.deep:
        from app.api.optimization import _ALLOWED_TEMPLATES as _allowed  # noqa: E402
        from app.services.pdf_styler import JINJA2_STYLE_TEMPLATES as _style  # noqa: E402
        _ALLOWED_TEMPLATES = set(_allowed)
        _STYLE_TEMPLATES = set(_style)

    front = parse_registry()
    back = TEMPLATE_META
    html_files = {
        p.stem for p in TEMPLATE_DIR.glob("*.html") if p.stem not in NON_STYLE_TEMPLATES
    }

    print("[1] 四集合一致性")
    check("前端 registry 非空", bool(front), f"{len(front)} 条")
    check("后端 TEMPLATE_META 非空", bool(back), f"{len(back)} 条")
    check("前端 ID 集 == 后端键集",
          set(front) == set(back),
          f"仅前端: {sorted(set(front) - set(back))} 仅后端: {sorted(set(back) - set(front))}")
    check("后端键集 == templates/*.html",
          set(back) == html_files,
          f"仅后端: {sorted(set(back) - html_files)} 仅文件: {sorted(html_files - set(back))}")
    if _STYLE_TEMPLATES is None:
        check("JINJA2_STYLE_TEMPLATES 运行时比对（--deep 未开，跳过）", True, "skipped")
    else:
        check("JINJA2_STYLE_TEMPLATES == 后端键集（运行时）",
              _STYLE_TEMPLATES == set(back),
              f"差异: {sorted(_STYLE_TEMPLATES ^ set(back))}")
    if _ALLOWED_TEMPLATES is None:
        check("_ALLOWED_TEMPLATES 运行时比对（--deep 未开，跳过）", True, "skipped")
    else:
        check("_ALLOWED_TEMPLATES == 后端键集（运行时）",
              _ALLOWED_TEMPLATES == set(back),
              f"差异: {sorted(_ALLOWED_TEMPLATES ^ set(back))}")

    # 白名单必须保持「派生」而不是硬编码集合字面量
    opt_src = (BACKEND / "app" / "api" / "optimization.py").read_text(encoding="utf-8")
    styler_src = (BACKEND / "app" / "services" / "pdf_styler.py").read_text(encoding="utf-8")
    check("optimization._ALLOWED_TEMPLATES 从 TEMPLATE_META 派生",
          "_ALLOWED_TEMPLATES" in opt_src and "TEMPLATE_META" in opt_src
          and not re.search(r"_ALLOWED_TEMPLATES\s*=\s*\{", opt_src))
    check("pdf_styler.JINJA2_STYLE_TEMPLATES 从 TEMPLATE_META 派生",
          "TEMPLATE_META" in styler_src
          and not re.search(r"JINJA2_STYLE_TEMPLATES\s*=\s*\{", styler_src))

    print("\n[2] 字段完备性（后端 + 前端）")
    for tid, meta in back.items():
        check(f"后端 {tid} 版本号语义化", bool(SEMVER.match(meta.version)), meta.version)
        check(f"后端 {tid} 分类合法", meta.category in CATEGORIES, str(meta.category))
        check(f"后端 {tid} 行业/标签非空", bool(meta.industries) and bool(meta.tags))
        check(f"后端 {tid} theme 四色齐备且为色值",
              set(meta.theme) == THEME_KEYS and all(HEX.match(v) for v in meta.theme.values()),
              str(meta.theme))
        check(f"后端 {tid} text_defaults 数值字段齐备",
              all(k in meta.text_defaults for k in ("baseFontSizePt", "lineHeight", "sectionGapMm")),
              str(meta.text_defaults))
        check(f"后端 {tid} 有描述", bool(meta.desc.strip()))

    for tid, entry in front.items():
        check(f"前端 {tid} 版本号语义化", bool(entry["version"] and SEMVER.match(entry["version"])), str(entry["version"]))
        check(f"前端 {tid} 分类合法", entry["category"] in CATEGORIES, str(entry["category"]))
        check(f"前端 {tid} 行业/标签非空", bool(entry["industries"]) and bool(entry["tags"]))
        check(f"前端 {tid} theme 四色齐备",
              set(entry["theme"]) == THEME_KEYS and all(HEX.match(v) for v in entry["theme"].values()),
              str(entry["theme"]))
        check(f"前端 {tid} 有 layoutFeatures", entry["layoutFeatures"] is not None)
        check(f"前端 {tid} 有 textDefaults", entry["textDefaults"] is not None)
        if entry["textDefaults"]:
            td = entry["textDefaults"]
            check(f"前端 {tid} textDefaults 数值字段齐备",
                  all(td.get(k) is not None for k in ("baseFontSizePt", "lineHeight", "sectionGapMm")),
                  str(td))
        if entry["renderMode"] == "react":
            lazy = entry["lazyComponent"]
            check(f"前端 {tid} react 模式有 lazyComponent", bool(lazy), str(lazy))
            if lazy:
                rel = lazy.replace("@/", "src/")
                comp = FRONTEND / (rel + ".tsx")
                check(f"前端 {tid} React 组件文件存在", comp.exists(), str(comp.relative_to(ROOT)))

    print("\n[3] 前后端字段一致")
    for tid in sorted(set(front) & set(back)):
        f, b = front[tid], back[tid]
        check(f"{tid} name 一致", f["name"] == b.name, f"{f['name']!r} vs {b.name!r}")
        check(f"{tid} version 一致", f["version"] == b.version, f"{f['version']!r} vs {b.version!r}")
        check(f"{tid} category 一致", f["category"] == b.category, f"{f['category']!r} vs {b.category!r}")
        check(f"{tid} theme 一致", f["theme"] == b.theme, f"{f['theme']} vs {b.theme}")
        if f["layoutFeatures"] is not None:
            back_lf = b.layout_features.to_dict()
            diff = {
                k: (f["layoutFeatures"].get(k), back_lf.get(k))
                for k in _features_default
                if f["layoutFeatures"].get(k) != back_lf.get(k)
            }
            check(f"{tid} layoutFeatures 一致", not diff, str(diff))
        if f["textDefaults"] is not None:
            diff = {
                k: (f["textDefaults"].get(k), b.text_defaults.get(k))
                for k in _TEXT_DEFAULT_KEYS
                if f["textDefaults"].get(k) != b.text_defaults.get(k)
            }
            check(f"{tid} textDefaults 一致", not diff, str(diff))

    print("\n[4] 渲染产物（模板私有样式 + 打印基座）")
    demo = {
        "personal_info": {"name": "陈思远", "email": "a@b.com", "phone": "138-0000-0000"},
        "summary": "一致性快测用示例数据。",
        "experience": [{"company": "A 公司", "title": "工程师", "start": "2020.01", "end": "2022.12",
                        "points": ["负责核心模块"]}],
        "education": [{"school": "S 大学", "degree": "本科", "major": "计算机", "start": "2016", "end": "2020"}],
        "skills": ["Python"],
    }
    for tid, meta in back.items():
        try:
            html = render_template_html(f"{tid}.html", demo)
        except Exception as exc:  # noqa: BLE001 —— 渲染失败本身就是断言失败
            check(f"{tid} 渲染成功", False, f"{type(exc).__name__}: {exc}")
            continue
        check(f"{tid} 渲染成功", True)
        check(f"{tid} 含 @page", "@page" in html)
        lf = meta.layout_features
        page_block = html[html.rfind("@page"): html.rfind("@page") + 120]
        # 与 print_css.build_print_css 的条件严格对齐：full_bleed_header **或** 纵向边距为 0
        # 都会输出 `margin: 0`（早期这里只判 full_bleed_header，侧边栏这类「零边距但非全幅头部」
        # 的模板会被误判成期望 `0mm 0mm`）。
        if lf.full_bleed_header or lf.page_margin_y_mm == 0:
            check(f"{tid} @page 边距为 0（全幅/零边距）", re.search(r"margin:\s*0", page_block) is not None, page_block[:60])
        else:
            expect = f"margin: {lf.page_margin_y_mm:g}mm {lf.page_margin_x_mm:g}mm"
            check(f"{tid} @page 边距符合特征（{expect}）", expect in page_block, page_block[:60])
        check(f"{tid} 含 print-color-adjust", "print-color-adjust" in html)
        check(f"{tid} 含条目级 break-inside", "break-inside" in html)
        check(f"{tid} 含 <meta name=\"template-id\">",
              f'name="template-id" content="{tid}"' in html or f"content=\"{tid}\"" in html)
        if lf.sidebar_dark:
            check(f"{tid} 深色侧栏含 box-decoration-break", "box-decoration-break" in html)
        # 主题变量：默认值来自模板自身（meta.theme + text_defaults），用户覆盖时改变量值
        td = meta.text_defaults
        check(f"{tid} 注入 --tpl-primary 默认值",
              f"--tpl-primary: {meta.theme['primary']}" in html)
        check(f"{tid} 注入 --tpl-accent 默认值",
              f"--tpl-accent: {meta.theme['secondary']}" in html)
        check(f"{tid} 注入 --tpl-base-size 默认值",
              f"--tpl-base-size: {td['baseFontSizePt']:g}pt" in html)
        check(f"{tid} 注入 --tpl-line-height 默认值",
              f"--tpl-line-height: {td['lineHeight']:g}" in html)
        check(f"{tid} 注入 --tpl-section-gap 默认值",
              f"--tpl-section-gap: {td['sectionGapMm']:g}mm" in html)
        themed = render_template_html(f"{tid}.html", demo, theme_config={"primary": "#abcdef"})
        check(f"{tid} 用户主题覆盖 --tpl-primary", "--tpl-primary: #abcdef" in themed)

    print("\n[5] 演示数据一致性（后端 _DEMO_RESUME vs 前端 template-demo-data.ts）")
    templates_src = (BACKEND / "app" / "api" / "templates.py").read_text(encoding="utf-8")
    demo_back = _extract_object_literal(templates_src, r"_DEMO_RESUME", quote_keys=False)
    check("后端 _DEMO_RESUME 可解析", demo_back is not None and bool(demo_back))
    demo_front = _extract_object_literal(
        DEMO_FILE.read_text(encoding="utf-8"), r"export const DEMO_RESUME[^=]*", quote_keys=True
    )
    check("前端 DEMO_RESUME 可解析", demo_front is not None and bool(demo_front))
    if demo_back and demo_front:
        diff = _diff_path(demo_back, demo_front)
        check("演示数据前后端逐字段一致", not diff,
              diff or "（改任一侧都必须同步另一侧，否则预览与导出漂移）")
    check("GET /api/templates/demo 端点已注册", '@router.get("/demo")' in templates_src)

    print("\n[6] Registry 入口纪律（问题 14：纯模块不得被直接 import）")
    # 纯 .ts 不含注册动作：绕过 templates-register 直接 import 它会得到空 Registry
    # （编译期不报错、运行期模板全失踪——曾因 .ts/.tsx 同名解析差异真实踩过）。
    bad_imports: list[str] = []
    for path in FRONTEND.rglob("*.ts*"):
        rel = path.relative_to(FRONTEND).as_posix()
        if rel in ("src/lib/templates-register.tsx", "src/lib/template-registry.ts"):
            continue  # 注册文件自身 + 纯模块自身
        if not path.is_file() or "node_modules" in rel or rel.startswith(".next"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"""from\s+['"]([^'"]*template-registry)['"]""", text):
            spec = m.group(1)
            if spec.endswith("templates-register"):
                continue
            bad_imports.append(f"{rel} → {spec}")
    check("无源码绕过 templates-register 直接 import 纯 registry 模块",
          not bad_imports, "; ".join(bad_imports[:5]))

    return report(args.quiet)


if __name__ == "__main__":
    sys.exit(main())
