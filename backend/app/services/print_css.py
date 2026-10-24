"""
打印 CSS 基座（版式特征驱动）。

背景
----
历史上 14 套模板各自在 HTML 里手写 ``@page`` / ``break-inside`` / ``print-color-adjust``，
演进结果是「新模板写对了、老模板漏规则」——professional / simple 连
``print-color-adjust`` 都没有（Chromium 打印会丢背景色），elegant / modern 完全没有
条目级分页保护。每加一个模板都要重新人肉实现一遍分页规则，漏一条就是一个 PDF 瑕疵。

本模块把「分页相关的规则」从模板私有视觉样式里剥离出来，由**版式特征**（LayoutFeatures）
驱动生成，在渲染时统一注入到 ``</head>`` 之前（位于模板私有样式之后，同名规则后写者胜）。
模板 HTML 于是收敛为两层：视觉样式（模板自己管）+ 打印基座（本模块管）。

特征与规则的映射
----------------
- ``full_bleed_header``  → ``@page { margin: 0 }``（背景条/渐变头要顶到纸边）
- 否则                  → ``@page { margin: {y}mm {x}mm }``
- ``dark_background``    → 强制打印背景色 + 整页背景跨页延续
- ``sidebar_dark``       → 侧栏 ``box-decoration-break: clone``（跨页时每页都有底色）
- 任意模板              → ``break-after: avoid``（标题不落页尾）、``orphans/widows``、
                           条目级 ``break-inside: avoid``（条目不被腰斩）

注意：条目级规则**不加**在 section 容器上——section 加 ``break-inside: avoid``
会把整节推下一页，留下大片空白（2026-10 踩过）。
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Mapping

__all__ = [
    "LayoutFeatures",
    "build_print_css",
    "inject_print_css",
]


@dataclass(frozen=True)
class LayoutFeatures:
    """模板的**结构化**版式特征（与前端 TemplateMetadata.layoutFeatures 字段一一对应）。

    与 ``layout``（'dual'|'single'|'banner'|'dark'）的区别：那个是预览示意图用的粗略
    标签，语义混杂（dark 既是布局又是配色）；这里是机器可判定、可被导出链路消费的事实。
    """

    #: 全幅背景头部（渐变条/色块顶到纸边）→ @page margin: 0
    full_bleed_header: bool = False
    #: 整页深色背景 → 必须打印背景色，且跨页延续
    dark_background: bool = False
    #: 侧栏位置（None = 无侧栏）
    sidebar_side: str | None = None
    #: 侧栏宽度（mm，按 A4 210mm 折算；仅供消费方决策，不覆盖模板自身宽度）
    sidebar_width_mm: float | None = None
    #: 侧栏是否为深色底（深色侧栏跨页需 box-decoration-break: clone）
    sidebar_dark: bool = False
    #: 是否双栏
    two_column: bool = False
    #: 是否时间轴条目（连线跨页需条目级保护）
    timeline: bool = False
    #: 非全幅模板的纵向页边距（mm）
    page_margin_y_mm: float = 15.0
    #: 非全幅模板的横向页边距（mm）
    page_margin_x_mm: float = 15.0

    def to_dict(self) -> dict:
        """转 camelCase 字典（下发给前端 / 写入日志）。"""
        raw = asdict(self)
        out: dict = {}
        for key, value in raw.items():
            parts = key.split("_")
            camel = parts[0] + "".join(p.capitalize() for p in parts[1:])
            out[camel] = value
        return out

    @classmethod
    def from_dict(cls, data: Mapping | None) -> "LayoutFeatures":
        """从 camelCase / snake_case 字典还原（缺字段走默认值）。"""
        if not data:
            return cls()
        alias = {
            "fullBleedHeader": "full_bleed_header",
            "darkBackground": "dark_background",
            "sidebarSide": "sidebar_side",
            "sidebarWidthMm": "sidebar_width_mm",
            "sidebarDark": "sidebar_dark",
            "twoColumn": "two_column",
            "pageMarginYMm": "page_margin_y_mm",
            "pageMarginXMm": "page_margin_x_mm",
        }
        kwargs: dict = {}
        for key, value in data.items():
            name = alias.get(key, key)
            if name in cls.__dataclass_fields__:
                kwargs[name] = value
        return cls(**kwargs)


# 条目级容器（模板里出现过的条目 class；新增模板沿用其中之一即可自动获得分页保护）
_ENTRY_SELECTORS = (
    ".exp-item",
    ".proj-item",
    ".edu-item",
    ".timeline-item",
    ".side-block",
    ".entry",
    ".job-item",
    ".project-item",
    ".education-item",
    ".experience-item",
)

_ENTRY_RULE = ",\n".join(_ENTRY_SELECTORS)


def _mm(value: float) -> str:
    """格式化毫米值（去尾零，0 显示为 0）。"""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


def build_print_css(features: LayoutFeatures | None = None, *, theme: Mapping[str, str] | None = None) -> str:
    """按版式特征生成打印基座 CSS。

    Args:
        features: 模板版式特征（None = 默认单栏、15mm 边距）
        theme: 可选主题色（生成 ``--tpl-*`` CSS 变量，供后续主题定制链路消费）

    Returns:
        可直接插入 ``<head>`` 的 ``<style>`` 片段（纯函数，输出稳定，便于断言）
    """
    f = features or LayoutFeatures()

    if f.full_bleed_header or f.page_margin_y_mm == 0:
        page_rule = "  @page {\n    size: A4;\n    margin: 0;\n  }"
    else:
        page_rule = (
            "  @page {\n"
            "    size: A4;\n"
            f"    margin: {_mm(f.page_margin_y_mm)}mm {_mm(f.page_margin_x_mm)}mm;\n"
            "  }"
        )

    # ── 纸张尺寸对齐：消除「body 写死 210mm → Chromium 整体缩放」 ──
    # 模板 body 一律 `width: 210mm`（且无 padding，页边距全部交给 @page）。
    # 打印时 @page margin 生效，内容区只有 210-2X mm，body 的 210mm 放不下 →
    # Chromium 会整体缩放约 (210-2X)/210（X=20mm 时仅 0.81），实测 26pt 姓名
    # 只渲染成 21pt、9pt 正文成 7.3pt。而 iframe 预览处于屏幕媒体下 @page 不生效、
    # 不缩放也不留白 —— 于是「预览是 10pt 无边距、导出是 8.1pt 有边距」，
    # 直接违背所见即所得。
    # 修法：打印态让 body 退回内容区尺寸（不再被缩放），屏幕态用 padding 还原
    # 等价页边距 —— 两边内容区宽度、字号、换行位置全部对齐。
    page_margin_y = 0.0 if (f.full_bleed_header or f.page_margin_y_mm == 0) else f.page_margin_y_mm
    page_margin_x = 0.0 if (f.full_bleed_header or f.page_margin_y_mm == 0) else f.page_margin_x_mm
    body_box_rule = (
        "  /* 纸张盒模型：打印态填满内容区 / 屏幕态用 padding 还原同款页边距。\n"
        "     目的：预览与导出的内容区宽度、字号、换行位置完全一致（所见即所得）。\n"
        "     模板 body 若有自定义 padding 会被本段归零——页边距一律以 A4 页边距规则为准。\n"
        "     position:relative 给职业照槽位（.tpl-avatar-slot）提供包含块：\n"
        "     屏幕态 body 即 210mm 纸面、打印态即内容区，两者都与各自 Media 下的\n"
        "     槽位偏移规则配套；对既有绝对定位元素是等效 no-op（它们的祖先本就 relative）。 */\n"
        "  @media print {\n"
        "    body {\n"
        "      box-sizing: border-box;\n"
        "      width: auto;\n"
        "      position: relative;\n"
        f"      min-height: calc(297mm - {_mm(2 * page_margin_y)}mm);\n"
        "      padding: 0;\n"
        "      margin: 0;\n"
        "    }\n"
        "  }\n"
        "  @media screen {\n"
        "    html { background: #eceef1; }\n"
        "    body {\n"
        "      box-sizing: border-box;\n"
        "      position: relative;\n"
        f"      min-height: calc(297mm - {_mm(2 * page_margin_y)}mm);\n"
        f"      padding: {_mm(page_margin_y)}mm {_mm(page_margin_x)}mm;\n"
        "      margin: 0 auto;\n"
        "    }\n"
        "  }"
    )

    # 职业照槽位（.tpl-avatar-slot，placement=corner）的媒体感知偏移：
    # 屏幕态避开 body 的模拟页边距（与内容区对齐），打印态贴内容区（@page 已给边距）。
    # 全幅模板边距为 0，两态一致（且全幅模板本身用 flow 摆放，走不到这条规则）。
    avatar_slot_rule = (
        "  /* 职业照槽位偏移：屏幕态避开模拟页边距 / 打印态贴内容区（预览=导出） */\n"
        "  @media screen {\n"
        f"    .tpl-avatar-slot {{ top: {_mm(page_margin_y)}mm; right: {_mm(page_margin_x)}mm; }}\n"
        "  }\n"
        "  @media print {\n"
        "    .tpl-avatar-slot { top: 0; right: 0; }\n"
        "  }"
    )

    blocks: list[str] = [
        "/* ══ 打印基座（print_css.build_print_css 自动生成，勿手改）══\n"
        "   本段位于模板私有样式之后：同名规则以本段为准。\n"
        "   分页策略由 template_meta.layout_features 驱动。 */",
        page_rule,
        body_box_rule,
        avatar_slot_rule,
        "  /* 背景色必须打印（否则渐变/色块在 PDF 里凭空消失） */\n"
        "  html, body {\n"
        "    -webkit-print-color-adjust: exact;\n"
        "    print-color-adjust: exact;\n"
        "  }",
        "  /* 标题不落在页尾（孤立标题） */\n"
        "  h1, h2, h3, h4 {\n"
        "    break-after: avoid;\n"
        "    page-break-after: avoid;\n"
        "  }",
        "  /* 段落孤行/寡行控制 */\n"
        "  p, li {\n"
        "    orphans: 3;\n"
        "    widows: 3;\n"
        "  }",
        "  /* 条目级分页保护（勿加到 section 容器：会把整节推下一页留大白） */\n"
        f"  {_ENTRY_RULE} {{\n"
        "    break-inside: avoid;\n"
        "    page-break-inside: avoid;\n"
        "  }",
    ]

    if f.dark_background:
        # 只做跨页延续：**不要**动 background-color —— 模板自己设了整页深色底，
        # 这里再写一次（inherit/transparent）会把底色抹掉（实测 dark 模板整页变白）。
        blocks.append(
            "  /* 整页深色背景：跨页延续（底色由模板自己定义） */\n"
            "  html, body {\n"
            "    -webkit-box-decoration-break: clone;\n"
            "    box-decoration-break: clone;\n"
            "  }"
        )

    if f.sidebar_dark:
        # 只做跨页背景延续，不覆盖宽度：宽度是模板私有样式的职责，
        # 在基座里再写一次等于制造第二个事实源（padding/flex-gap 下必然算错）。
        blocks.append(
            "  /* 深色侧栏跨页：每一页都有底色（否则第 2 页侧栏变白） */\n"
            "  .sidebar, aside {\n"
            "    -webkit-box-decoration-break: clone;\n"
            "    box-decoration-break: clone;\n"
            "  }"
        )

    if f.timeline:
        blocks.append(
            "  /* 时间轴：连线随条目走，条目内不断开 */\n"
            "  .timeline-item, .timeline-entry {\n"
            "    break-inside: avoid;\n"
            "    page-break-inside: avoid;\n"
            "  }"
        )

    if theme:
        variables = "".join(
            f"    --tpl-{key}: {value};\n"
            for key, value in sorted(theme.items())
            if isinstance(value, str) and value
        )
        if variables:
            blocks.append("  /* 主题变量（导出与预览共用同一套） */\n  :root {\n" + variables + "  }")

    return "<style>\n" + "\n".join(blocks) + "\n</style>\n"


def inject_print_css(html: str, features: LayoutFeatures | None = None, *,
                     theme: Mapping[str, str] | None = None) -> str:
    """把打印基座注入到 ``</head>`` 之前（模板私有样式之后，确保同名规则生效）。

    没有 ``</head>`` 时退化为追加到文档末尾，绝不抛错（渲染链路不该因注入失败中断）。
    """
    css = build_print_css(features, theme=theme)
    lowered = html.lower()
    idx = lowered.rfind("</head>")
    if idx == -1:
        return html + css
    return html[:idx] + css + html[idx:]
