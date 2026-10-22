"""
模板元数据（后端单一事实源）。

与前端 frontend/src/lib/template-registry.tsx 的 TemplateMetadata 保持字段对齐：
  - id        模板 key（= backend/app/templates/{id}.html）
  - name      展示名
  - author    作者 / 来源
  - version   版本号（写入 PDF 文档属性）
  - category  business / creative / tech / academic / simple
  - industries / tags / theme 与前端一致（供预览 API 下发）

新增模板时必须同步（白名单已从本表派生，无需再手改）：
  1. 本文件（元数据）
  2. backend/app/templates/{id}.html（Jinja 模板）
  3. 前端 lib/template-registry.tsx（注册表）
  4. docs/jadeAI模板体系升级交付文档.md 的模板清单（对外文档）
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass, field

from app.services.print_css import LayoutFeatures

logger = logging.getLogger(__name__)

# 默认模板：未指定 / 非法值 / 存量数据回填的唯一去处
DEFAULT_TEMPLATE_ID = "professional"


@dataclass(frozen=True)
class BackendTemplateMeta:
    id: str
    name: str
    author: str
    version: str
    category: str
    industries: tuple[str, ...]
    tags: tuple[str, ...]
    theme: dict[str, str]
    desc: str
    #: 结构化版式特征（驱动打印分页基座，见 app/services/print_css.py）
    layout_features: LayoutFeatures = field(default_factory=LayoutFeatures)
    #: 文本默认值（主题定制的合并基线：字号/行距/章节间距，与模板 HTML 的 var 回退一致）
    text_defaults: dict[str, float] = field(default_factory=dict)


TEMPLATE_META: dict[str, BackendTemplateMeta] = {
    t.id: t
    for t in [
        BackendTemplateMeta(
            id="professional", name="专业分栏", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 11.0, "lineHeight": 1.6, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=15.0),
            category="business", industries=("通用", "互联网", "金融"), tags=("双栏", "商务"),
            theme={"primary": "#2c6fbb", "secondary": "#1a5276", "bg": "#ffffff", "text": "#333333"},
            desc="蓝色主题双栏布局，左侧联系信息右侧工作经历",
        ),
        BackendTemplateMeta(
            id="simple", name="简约单栏", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.5, "lineHeight": 1.7, "sectionGapMm": 4.8},
            layout_features=LayoutFeatures(page_margin_y_mm=18.0, page_margin_x_mm=18.0),
            category="simple", industries=("通用", "行政", "教育"), tags=("单栏", "极简"),
            theme={"primary": "#444444", "secondary": "#dddddd", "bg": "#ffffff", "text": "#444444"},
            desc="极简单栏居中，浅灰色调，适合内容简洁的简历",
        ),
        BackendTemplateMeta(
            id="modern", name="现代渐变", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.5, "lineHeight": 1.6, "sectionGapMm": 4.8},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=71.4, two_column=True),
            category="creative", industries=("互联网", "市场", "运营"), tags=("横幅", "渐变"),
            theme={"primary": "#2c6fbb", "secondary": "#3498db", "bg": "#ffffff", "text": "#333333"},
            desc="蓝色渐变顶部横幅，左侧技能标签右侧工作经历",
        ),
        BackendTemplateMeta(
            id="ocean", name="海洋之蓝", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=67.2, two_column=True),
            category="business", industries=("互联网", "制造业", "咨询"), tags=("横幅", "渐变", "清爽"),
            theme={"primary": "#0e7490", "secondary": "#0c4a6e", "bg": "#f0f9ff", "text": "#334155"},
            desc="青蓝渐变顶部，清爽干练，适合互联网与制造业岗位",
        ),
        BackendTemplateMeta(
            id="sunset", name="暖阳落日", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=67.2, two_column=True),
            category="creative", industries=("运营", "市场", "创意"), tags=("横幅", "暖色"),
            theme={"primary": "#ea580c", "secondary": "#9a3412", "bg": "#fffbeb", "text": "#44403c"},
            desc="暖橙渐变顶部，亲和有活力，适合运营市场与创意岗位",
        ),
        BackendTemplateMeta(
            id="violet", name="紫韵流光", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 4.8},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=71.4,
                          sidebar_dark=True, two_column=True, timeline=True),
            category="creative", industries=("设计", "互联网", "传媒"), tags=("双栏", "时间轴"),
            theme={"primary": "#7c3aed", "secondary": "#4c1d95", "bg": "#faf5ff", "text": "#3f3f46"},
            desc="深紫侧边栏+时间轴条目，兼具设计感与专业性",
        ),
        BackendTemplateMeta(
            id="academic", name="学术严谨", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.65, "sectionGapMm": 4.2,
                           "fontFamily": "Georgia, 'Times New Roman', 'Noto Sans SC', 'Microsoft YaHei', serif"},
            layout_features=LayoutFeatures(full_bleed_header=True),
            category="academic", industries=("学术", "国企", "科研"), tags=("单栏", "衬线", "正式"),
            theme={"primary": "#1e3a5f", "secondary": "#6b7280", "bg": "#ffffff", "text": "#1f2937"},
            desc="衬线字体单栏版式，双线页眉，适合学术、国企与严肃场合",
        ),
        BackendTemplateMeta(
            id="compact", name="紧凑高效", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 9.5, "lineHeight": 1.5, "sectionGapMm": 2.6},
            layout_features=LayoutFeatures(timeline=True, page_margin_y_mm=12.0, page_margin_x_mm=15.0),
            category="simple", industries=("技术", "通用"), tags=("单栏", "高密度"),
            theme={"primary": "#111111", "secondary": "#333333", "bg": "#ffffff", "text": "#333333"},
            desc="最大信息密度，时间线排版，适合内容丰富的简历",
        ),
        BackendTemplateMeta(
            id="elegant", name="优雅金边", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 2.1},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=63.0,
                          sidebar_dark=True, two_column=True),
            category="business", industries=("金融", "高管", "咨询"), tags=("双栏", "高端"),
            theme={"primary": "#c9a962", "secondary": "#2d2d2d", "bg": "#ffffff", "text": "#3a3a3a"},
            desc="深色侧边栏+金色点缀，高端商务风格",
        ),
        BackendTemplateMeta(
            id="dark", name="深色科技", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(full_bleed_header=True, dark_background=True),
            category="tech", industries=("技术", "互联网", "游戏"), tags=("深色", "霓虹"),
            theme={"primary": "#00d4ff", "secondary": "#0d1117", "bg": "#0d1117", "text": "#e0e0e0"},
            desc="深色背景+霓虹蓝点缀，科技感十足，适合技术岗",
        ),
        BackendTemplateMeta(
            id="fresh", name="清新绿意", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=67.2, two_column=True),
            category="simple", industries=("教育", "医疗", "公益"), tags=("横幅", "自然"),
            theme={"primary": "#2d6a4f", "secondary": "#52b788", "bg": "#fafcf8", "text": "#3a5a40"},
            desc="绿色渐变顶部，自然清新风格，双栏布局",
        ),
        BackendTemplateMeta(
            id="classic", name="经典黑白", author="智能简历", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=18.0),
            category="academic", industries=("通用", "国企", "公务"), tags=("单栏", "正式", "黑白"),
            theme={"primary": "#000000", "secondary": "#555555", "bg": "#ffffff", "text": "#1a1a1a"},
            desc="黑白极简，传统正式风格，粗线分隔，适合严肃场合",
        ),
        # ── jadeAI 迁移模板 ──
        BackendTemplateMeta(
            id="jade-classic", name="经典单栏专业版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="business", industries=("通用", "互联网", "金融", "咨询"), tags=("单栏", "ATS 友好", "经典"),
            theme={"primary": "#1f2937", "secondary": "#6b7280", "bg": "#ffffff", "text": "#1f2937"},
            desc="jadeAI 经典单栏：深灰标题 + 细分隔线 + 圆点条目，ATS 解析最友好",
        ),
        BackendTemplateMeta(
            id="jade-twocol", name="现代双栏创意版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 0.8},
            layout_features=LayoutFeatures(full_bleed_header=True, sidebar_side="left", sidebar_width_mm=73.5,
                          sidebar_dark=True, two_column=True, timeline=True),
            category="creative", industries=("设计", "互联网", "产品", "传媒"), tags=("双栏", "渐变侧栏", "创意"),
            theme={"primary": "#2563eb", "secondary": "#1e3a8a", "bg": "#ffffff", "text": "#1f2937"},
            desc="jadeAI 现代双栏：左侧渐变信息栏 + 右侧时间轴，兼顾设计感与可读性",
        ),
    ]
}


def get_template_meta(template_id: str) -> BackendTemplateMeta | None:
    """按 key 取元数据（兼容传 '.html' 后缀）。"""
    if not template_id:
        return None
    return TEMPLATE_META.get(template_id.removesuffix(".html"))


def is_registered(template_id: str) -> bool:
    """是否已注册（兼容 '.html' 后缀）。"""
    return get_template_meta(template_id) is not None


def resolve_template_id(
    value: str | None,
    *,
    default: str = DEFAULT_TEMPLATE_ID,
    extra_allowed: Iterable[str] = (),
) -> str:
    """把外部传入的模板值收敛成合法 ID（唯一收口点）。

    规则（对齐 jadeAI 规格「兜底必须显式」）：
      - 空值 → 默认模板（不算异常，调用方本就没选）
      - 已注册的模板 ID / 显式放行的方案名（jinja2/html/latex/preserve）→ 原样返回
      - 其它 → 默认模板，并打 **warning** 日志，绝不静默渲染错误模板
    """
    raw = (value or "").strip()
    if not raw:
        return default

    key = raw.removesuffix(".html")
    if key in TEMPLATE_META:
        return key
    if key in set(extra_allowed):
        return key

    logger.warning(
        "[模板] 未注册的模板 ID %r，已回退到默认模板 %r（请检查前端清单与后端白名单是否同步）",
        value,
        default,
    )
    return default
