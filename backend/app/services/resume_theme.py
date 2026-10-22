"""
简历主题配置（themeConfig）—— 预览与导出共用同一套主题变量。

背景
----
模板体系过去把「配色/字体」焊死在每套模板的私有 CSS 里（硬编码 hex、pt）。
规格模式 4 要求：用户可按记录定制主题（主色/辅色/字体/字号/行距/页边距/章节间距），
且**预览与导出必须消费同一套主题变量**，否则「预览好看、导出走样」。

实现
----
1. 模板私有样式里的硬编码值已机械替换为 ``var(--tpl-primary, <原值>)`` 形式：
   没有用户主题时回退原值，观感与改造前**逐像素一致**（回归脚本守护）。
2. 用户主题（``optimized_resumes.theme_config``，JSON）经 :func:`normalize_theme_config`
   与模板默认（``TEMPLATE_META.theme``）合并、校验、clamp；
3. :func:`build_export_theme_css` 生成最终注入 HTML 的 CSS 变量（``:root { --tpl-* }``），
   打印基座（``print_css.build_print_css``）与预览端点（iframe）走同一定值函数。

字段与约束
--------
===========================  ========  ==========================================
字段                         范围      说明
===========================  ========  ==========================================
primary                     #RRGGBB   主色（章节标题/边框/侧栏等强调元素）
accent                      #RRGGBB   辅色（渐变第二色/次级强调）
fontFamily                  白名单     字体（见 FONT_WHITELIST）
baseFontSizePt              8-16pt    正文字号
lineHeight                  1.1-2.0   正文行距
marginMm                    0-30mm    页边距（0 时视为全幅，配合 full_bleed）
sectionGapMm                0-20mm    章节间距（章节标题上方）
===========================  ========  ==========================================

未提供字段一律回退到模板默认值（``TEMPLATE_META.theme``）或 ``DEFAULT_THEME``；
API 边界对**未知字段与越界值**返回 400（绝不静默丢弃，见审查报告问题 3 的教训）。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, asdict
from typing import Mapping

logger = logging.getLogger(__name__)

__all__ = [
    "ResumeTheme",
    "DEFAULT_THEME",
    "FONT_WHITELIST",
    "normalize_theme_config",
    "build_export_theme_css",
    "theme_css_variables",
    "theme_summary",
]

#: 主题字段的合法范围（clamp 前先校验类型；颜色单独走 hex 正则）
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

#: 字体白名单（简历场景可用字体；前端下拉同源）
FONT_WHITELIST: tuple[str, ...] = (
    "Noto Sans SC",
    "Microsoft YaHei",
    "PingFang SC",
    "SimSun",
    "SimHei",
    "Source Han Serif SC",
    "Alibaba PuHuiTi",
)

#: 数值字段的 (字段, 最小值, 最大值, 默认值)（pt / 倍数 / mm 均为 float）
_NUMERIC_FIELDS: tuple[tuple[str, float, float, float], ...] = (
    ("baseFontSizePt", 8.0, 16.0, 10.5),
    ("lineHeight", 1.1, 2.0, 1.6),
    ("marginMm", 0.0, 30.0, 15.0),
    ("sectionGapMm", 0.0, 20.0, 6.0),
)


@dataclass(frozen=True)
class ResumeTheme:
    """合并后的最终主题（模板默认 ← 用户定制）。"""

    primary: str = "#2c6fbb"
    accent: str = "#1a5276"
    fontFamily: str = "Noto Sans SC"
    baseFontSizePt: float = 10.5
    lineHeight: float = 1.6
    marginMm: float = 15.0
    sectionGapMm: float = 6.0

    def to_dict(self) -> dict:
        return asdict(self)

    def css_variables(self) -> dict[str, str]:
        """转 ``--tpl-*`` CSS 变量（字符串值，直接进 :root）。"""
        return {
            "primary": self.primary,
            "accent": self.accent,
            "font": self.fontFamily,
            "base-size": f"{_num(self.baseFontSizePt)}pt",
            "line-height": _num(self.lineHeight),
            "section-gap": f"{_num(self.sectionGapMm)}mm",
        }

    def summary(self) -> str:
        """PDF 元数据用的一句话摘要（逗号分隔，便于机器反查）。"""
        return (
            f"theme-primary={self.primary}, theme-accent={self.accent}, "
            f"theme-font={self.fontFamily}, theme-base-size={_num(self.baseFontSizePt)}pt, "
            f"theme-line-height={_num(self.lineHeight)}, theme-margin={_num(self.marginMm)}mm, "
            f"theme-section-gap={_num(self.sectionGapMm)}mm"
        )


#: 全局兜底默认（模板元数据缺失字段时使用）
DEFAULT_THEME = ResumeTheme()


def _num(value: float) -> str:
    """数字去尾零（10.50 → 10.5，1.60 → 1.6，6.00 → 6）。"""
    text = f"{float(value):.2f}".rstrip("0").rstrip(".")
    return text or "0"


def _template_defaults(template_id: str | None) -> dict:
    """取模板自带主题色作为合并基线。

    注意键名映射：模板元数据的 ``theme.secondary`` 对应主题字段 ``accent``
    （漏了这层映射会让所有模板的辅色错用全局默认——jade-twocol 侧栏渐变
    实测因此变色，被 verify_print_base 的位图对比抓出）。
    """
    if not template_id:
        return {}
    from app.services.template_meta import get_template_meta

    meta = get_template_meta(template_id)
    if not meta:
        return {}
    out: dict = {}
    if meta.theme.get("primary"):
        out["primary"] = meta.theme["primary"]
    if meta.theme.get("secondary"):
        out["accent"] = meta.theme["secondary"]
    return out


def normalize_theme_config(
    config: Mapping | None,
    *,
    template_id: str | None = None,
    text_defaults: Mapping | None = None,
    page_margin_mm: float | None = None,
    strict: bool = False,
) -> ResumeTheme:
    """把用户提交的主题配置合并、校验、clamp 成最终主题。

    Args:
        config: 用户提交（可为空/部分字段/None）
        template_id: 模板 ID，取其 ``meta.theme`` 的 primary/accent 为基线
        text_defaults: 模板的 ``text_defaults``（baseFontSizePt/lineHeight/sectionGapMm），
                       缺失字段回退 ``DEFAULT_THEME``——**没有它 professional 的 11pt
                       会被全局默认 10.5pt 改掉**
        page_margin_mm: 模板版式的页边距（layout_features.page_margin_y_mm），
                        作为 marginMm 的基线（用户不传时保持模板原边距）
        strict: True 时**未知字段/越界值直接抛 ValueError**（API 边界用）；
                False 时记 warning 并回退（内部调用/渲染兜底用）

    Returns:
        合并后的 ResumeTheme

    Raises:
        ValueError: strict 模式下配置不合法（消息可直接回给前端）
    """
    base: dict = {
        "primary": DEFAULT_THEME.primary,
        "accent": DEFAULT_THEME.accent,
        "fontFamily": DEFAULT_THEME.fontFamily,
        "baseFontSizePt": DEFAULT_THEME.baseFontSizePt,
        "lineHeight": DEFAULT_THEME.lineHeight,
        "marginMm": DEFAULT_THEME.marginMm,
        "sectionGapMm": DEFAULT_THEME.sectionGapMm,
    }
    # 模板默认覆盖全局默认：颜色取 meta.theme，文本取 text_defaults，边距取 layout_features
    for key in ("primary", "accent"):
        value = _template_defaults(template_id).get(key)
        if _HEX_RE.match(str(value or "")):
            base[key] = str(value)
    if text_defaults:
        for key in ("baseFontSizePt", "lineHeight", "sectionGapMm"):
            if key in text_defaults:
                try:
                    base[key] = float(text_defaults[key])
                except (TypeError, ValueError):
                    logger.warning("[主题配置] text_defaults.%s 非法: %r，用全局默认", key, text_defaults[key])
        # 模板自有字体栈（如 academic 的衬线栈）优先于全局默认，避免被 --tpl-font 覆盖
        if text_defaults.get("fontFamily"):
            base["fontFamily"] = str(text_defaults["fontFamily"])
    if page_margin_mm is not None:
        base["marginMm"] = float(page_margin_mm)

    if config:
        for key, value in config.items():
            if key not in base:
                msg = f"未知主题字段: {key}"
                if strict:
                    raise ValueError(msg)
                logger.warning("[主题配置] %s，已忽略", msg)
                continue

            if key in ("primary", "accent"):
                if not _HEX_RE.match(str(value or "")):
                    msg = f"{key} 必须是 #RRGGBB 十六进制色值（收到 {value!r}）"
                    if strict:
                        raise ValueError(msg)
                    logger.warning("[主题配置] %s，回退模板默认", msg)
                    continue
                base[key] = str(value).lower()
                continue

            if key == "fontFamily":
                if value not in FONT_WHITELIST:
                    msg = f"fontFamily 不在白名单: {value!r}（可选 {list(FONT_WHITELIST)}）"
                    if strict:
                        raise ValueError(msg)
                    logger.warning("[主题配置] %s，回退默认字体", msg)
                    continue
                base[key] = str(value)
                continue

            # 数值字段：类型 → clamp
            field = next(f for f in _NUMERIC_FIELDS if f[0] == key)
            name, lo, hi, _default = field
            try:
                number = float(value)
            except (TypeError, ValueError):
                msg = f"{name} 必须是数字（收到 {value!r}）"
                if strict:
                    raise ValueError(msg) from None
                logger.warning("[主题配置] %s，回退默认值", msg)
                continue
            clamped = min(max(number, lo), hi)
            if clamped != number:
                msg = f"{name} 必须在 [{lo:g}, {hi:g}] 之间（收到 {number:g}）"
                if strict:
                    raise ValueError(msg)
                logger.warning("[主题配置] %s", msg)
            base[key] = clamped

    return ResumeTheme(**base)


def theme_css_variables(theme: ResumeTheme) -> dict[str, str]:
    """主题 → CSS 变量字典（与 print_css.build_print_css 的 theme 参数同格式）。"""
    return theme.css_variables()


def build_export_theme_css(theme: ResumeTheme) -> str:
    """生成注入导出/预览 HTML 的主题变量 ``<style>`` 片段（纯函数，输出稳定）。"""
    variables = "".join(
        f"    --tpl-{key}: {value};\n" for key, value in sorted(theme.css_variables().items())
    )
    if not variables:
        return ""
    return (
        "/* ══ 主题变量（resume_theme.build_export_theme_css 自动生成，勿手改）══\n"
        "   预览与导出共用同一套变量；模板私有样式以 var(--tpl-*, 原值) 消费。 */\n"
        ":root {\n" + variables + "}\n"
    )


def theme_summary(theme: ResumeTheme) -> str:
    """PDF 元数据摘要（供 keywords 追加）。"""
    return theme.summary()
