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
        BackendTemplateMeta(
            id="jade-minimal", name="极简留白版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.75, "sectionGapMm": 4.8},
            layout_features=LayoutFeatures(page_margin_y_mm=18.0, page_margin_x_mm=20.0),
            category="simple", industries=("通用", "设计", "产品"), tags=("极简", "单栏", "留白"),
            theme={"primary": "#1a1a1a", "secondary": "#8a8a8a", "bg": "#ffffff", "text": "#1a1a1a"},
            desc="jadeAI 极简：无边框无底色，靠字号、字间距与留白建立层级，留白最大",
        ),
        BackendTemplateMeta(
            id="jade-modern", name="现代渐变头部版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.65, "sectionGapMm": 3.4},
            layout_features=LayoutFeatures(full_bleed_header=True),
            category="business", industries=("互联网", "金融", "产品"), tags=("渐变头部", "全幅", "现代"),
            theme={"primary": "#1e40af", "secondary": "#0f172a", "bg": "#ffffff", "text": "#1f2937"},
            desc="jadeAI 现代：深蓝渐变全幅头部 + 白字反白，主体单栏配主色分隔线",
        ),
        BackendTemplateMeta(
            id="jade-timeline", name="时间线版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.65, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(timeline=True, page_margin_y_mm=16.0, page_margin_x_mm=16.0),
            category="business", industries=("通用", "产品", "运营"), tags=("时间线", "单栏", "节点"),
            theme={"primary": "#0f766e", "secondary": "#5f7d7a", "bg": "#ffffff", "text": "#0f766e"},
            desc="jadeAI 时间线：青绿竖线串起圆点节点，日期做成主色胶囊，经历脉络一目了然",
        ),
        BackendTemplateMeta(
            id="jade-sidebar", name="浅色侧边栏双栏版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.2},
            layout_features=LayoutFeatures(page_margin_y_mm=0.0, page_margin_x_mm=0.0, sidebar_side="left",
                          sidebar_width_mm=65.0, sidebar_dark=False, two_column=True),
            category="business", industries=("通用", "互联网", "职能"), tags=("双栏", "浅色侧栏", "清爽"),
            theme={"primary": "#475569", "secondary": "#64748b", "bg": "#ffffff", "text": "#334155"},
            desc="jadeAI 侧边栏：左侧浅灰信息栏承载联系/技能/教育，右侧主栏放经历，边界清晰",
        ),
        BackendTemplateMeta(
            id="jade-executive", name="高管稳重版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.5, "lineHeight": 1.7, "sectionGapMm": 4.0},
            layout_features=LayoutFeatures(full_bleed_header=True),
            category="business", industries=("管理", "金融", "咨询"), tags=("全幅头部", "稳重", "高管"),
            theme={"primary": "#1e293b", "secondary": "#64748b", "bg": "#ffffff", "text": "#1e293b"},
            desc="jadeAI 高管：深炭全幅头部 + 金色细线，大留白大字号，适合资深管理者",
        ),
        BackendTemplateMeta(
            id="jade-professional", name="专业深蓝版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.62, "sectionGapMm": 3.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="business", industries=("金融", "咨询", "法律", "通用"), tags=("深蓝", "单栏", "正式"),
            theme={"primary": "#1e3a8a", "secondary": "#3b82f6", "bg": "#ffffff", "text": "#1e3a8a"},
            desc="jadeAI 专业：深蓝反白分节标题 + 双线页眉，最稳妥的商务正式风",
        ),
        BackendTemplateMeta(
            id="jade-creative", name="创意渐变版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.62, "sectionGapMm": 3.4},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="creative", industries=("设计", "传媒", "市场", "广告"), tags=("渐变", "紫粉", "创意"),
            theme={"primary": "#7c3aed", "secondary": "#db2777", "bg": "#ffffff", "text": "#5b21b6"},
            desc="jadeAI 创意：紫粉渐变不对称头部 + 渐变方块标题与技能胶囊，视觉张力强",
        ),
        BackendTemplateMeta(
            id="jade-ats", name="ATS 友好纯文本版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.5, "lineHeight": 1.5, "sectionGapMm": 2.9},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="simple", industries=("通用", "求职平台", "海投"), tags=("ATS", "纯文本", "零装饰"),
            theme={"primary": "#000000", "secondary": "#333333", "bg": "#ffffff", "text": "#000000"},
            desc="jadeAI ATS：纯黑白、原生列表、无伪元素无图形，机器解析成功率最高",
        ),
        BackendTemplateMeta(
            id="jade-academic", name="学术版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.68, "sectionGapMm": 3.4},
            layout_features=LayoutFeatures(page_margin_y_mm=16.0, page_margin_x_mm=16.0),
            category="academic", industries=("高校", "科研", "教育"), tags=("学术", "教育优先", "编号章节"),
            theme={"primary": "#1e3b4d", "secondary": "#4a6b7c", "bg": "#ffffff", "text": "#1e3b4d"},
            desc="jadeAI 学术：教育背景前置 + 编号章节 + 双线页眉，适合科研与教职申请",
        ),
        BackendTemplateMeta(
            id="jade-elegant", name="优雅柔和版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 4.0},
            layout_features=LayoutFeatures(page_margin_y_mm=17.0, page_margin_x_mm=18.0),
            category="business", industries=("服务", "教育", "文化", "通用"), tags=("玫瑰", "居中对称", "优雅"),
            theme={"primary": "#9d174d", "secondary": "#9ca3af", "bg": "#ffffff", "text": "#9d174d"},
            desc="jadeAI 优雅：玫瑰色调 + 居中对称细线页眉 + 斜体流式技能，柔和不抢戏",
        ),
        BackendTemplateMeta(
            id="jade-developer", name="开发者双栏版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.2},
            layout_features=LayoutFeatures(page_margin_y_mm=0.0, page_margin_x_mm=0.0, sidebar_side="left",
                          sidebar_width_mm=68.0, sidebar_dark=True, two_column=True),
            category="tech", industries=("互联网", "软件", "研发"), tags=("双栏", "深色侧栏", "技术栈"),
            theme={"primary": "#065f46", "secondary": "#10b981", "bg": "#ffffff", "text": "#065f46"},
            desc="jadeAI 开发者：墨绿深色侧栏承载技术栈，右侧主栏放经历，技术岗首选",
        ),
        BackendTemplateMeta(
            id="jade-designer", name="设计师作品集版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.62, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(page_margin_y_mm=18.0, page_margin_x_mm=18.0),
            category="creative", industries=("设计", "艺术", "摄影", "建筑"), tags=("作品集", "左标签网格", "大留白"),
            theme={"primary": "#111827", "secondary": "#6b7280", "bg": "#ffffff", "text": "#111827"},
            desc="jadeAI 设计师：30pt 大标题 + 左侧固定宽标签网格，克制而有版式感",
        ),
        BackendTemplateMeta(
            id="jade-startup", name="初创活力版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.6, "sectionGapMm": 3.4},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="business", industries=("创业", "互联网", "市场"), tags=("橙色", "活力", "圆角头部"),
            theme={"primary": "#ea580c", "secondary": "#f97316", "bg": "#ffffff", "text": "#ea580c"},
            desc="jadeAI 初创：橙色渐变圆角头部 + 实心技能胶囊，年轻有冲劲",
        ),
        # ── 批次 B：行业/职业 ──
        BackendTemplateMeta(
            id="jade-nordic", name="北欧冷淡版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.85, "sectionGapMm": 5.3},
            layout_features=LayoutFeatures(page_margin_y_mm=18.0, page_margin_x_mm=18.0),
            category="simple", industries=("设计", "通用", "建筑"), tags=("北欧", "冷淡", "留白"),
            theme={"primary": "#4a5568", "secondary": "#cbd5e1", "bg": "#ffffff", "text": "#3d4753"},
            desc="jadeAI 北欧：冷灰蓝调 + 超大留白，竖线标签与淡灰胶囊，克制清爽",
        ),
        BackendTemplateMeta(
            id="jade-corporate", name="企业正式版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="business", industries=("制造业", "国企", "行政"), tags=("正式", "单栏", "实心标题条"),
            theme={"primary": "#1e3a5f", "secondary": "#64748b", "bg": "#ffffff", "text": "#243244"},
            desc="jadeAI 企业：左侧竖色条页眉 + 实心深蓝分节标题条，稳重正式",
        ),
        BackendTemplateMeta(
            id="jade-consultant", name="咨询顾问版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="business", industries=("咨询", "战略", "金融"), tags=("编号章节", "案例式", "铜色"),
            theme={"primary": "#2b3038", "secondary": "#b45309", "bg": "#ffffff", "text": "#33383f"},
            desc="jadeAI 咨询：铜色双线页眉 + 编号章节 + 编号要点，结构化案例表达",
        ),
        BackendTemplateMeta(
            id="jade-finance", name="金融投行版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 9.5, "lineHeight": 1.65, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0,
                                           sidebar_side="right", sidebar_width_mm=52.0, two_column=True),
            category="business", industries=("金融", "投行", "会计"), tags=("深藏蓝", "金色", "右栏"),
            theme={"primary": "#0f2d52", "secondary": "#b8860b", "bg": "#ffffff", "text": "#1f2937"},
            desc="jadeAI 金融：深藏蓝页眉 + 金色细线，右侧窄栏放技能与教育，信息密度高",
        ),
        BackendTemplateMeta(
            id="jade-medical", name="医疗健康版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.75, "sectionGapMm": 4.2},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="simple", industries=("医疗", "健康", "公益"), tags=("青绿", "亲和", "圆点标题"),
            theme={"primary": "#0d9488", "secondary": "#5eead4", "bg": "#ffffff", "text": "#33414d"},
            desc="jadeAI 医疗：淡青底圆角页眉 + 十字装饰 + 青色圆点标题，清爽亲和",
        ),
        # ── 批次 C：现代/科技 ──
        BackendTemplateMeta(
            id="jade-gradient", name="渐变现代版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(full_bleed_header=True),
            category="creative", industries=("互联网", "产品", "运营"), tags=("渐变", "全幅", "紫粉"),
            theme={"primary": "#7c3aed", "secondary": "#db2777", "bg": "#ffffff", "text": "#2e2a3a"},
            desc="jadeAI 渐变：紫→粉全幅渐变头部 + 渐变圆点要点 + 渐变技能胶囊",
        ),
        BackendTemplateMeta(
            id="jade-metro", name="磁贴格纹版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.65, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="tech", industries=("技术", "互联网", "产品"), tags=("磁贴", "色块", "无圆角"),
            theme={"primary": "#0078d7", "secondary": "#00bcf2", "bg": "#ffffff", "text": "#24292e"},
            desc="jadeAI 磁贴：Metro 风纯色块拼接页眉 + 交替配色技能磁贴，利落硬朗",
        ),
        BackendTemplateMeta(
            id="jade-material", name="质感卡片版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.72, "sectionGapMm": 2.6},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="tech", industries=("互联网", "产品", "设计"), tags=("卡片", "Material", "浅灰底"),
            theme={"primary": "#3f51b5", "secondary": "#ff4081", "bg": "#f4f6f8", "text": "#2c3033"},
            desc="jadeAI 质感：浅灰底 + 白色圆角卡片分节 + chip 技能，层次分明",
        ),
        BackendTemplateMeta(
            id="jade-coder", name="代码终端版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 3.7},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="tech", industries=("技术", "研发", "互联网"), tags=("等宽", "终端", "深色头部"),
            theme={"primary": "#1e2227", "secondary": "#4ec9b0", "bg": "#ffffff", "text": "#2b3034"},
            desc="jadeAI 代码：终端窗口页眉 + 等宽字体标题/日期 + 尖括号技能标签，为开发者设计",
        ),
        BackendTemplateMeta(
            id="jade-blocks", name="块状网格版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 3.4},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=15.0),
            category="tech", industries=("技术", "产品", "运营"), tags=("方块", "卡片条目", "蓝"),
            theme={"primary": "#2563eb", "secondary": "#60a5fa", "bg": "#ffffff", "text": "#26313d"},
            desc="jadeAI 块状：蓝色块页眉 + 序号方块标题 + 浅底卡片条目，网格感强",
        ),
        BackendTemplateMeta(
            id="jade-magazine", name="杂志排版版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.72, "sectionGapMm": 6.0},
            layout_features=LayoutFeatures(
                two_column=True, sidebar_side="left", sidebar_width_mm=52.0,
                page_margin_y_mm=14.0, page_margin_x_mm=15.0,
            ),
            category="creative", industries=("传媒", "杂志", "广告", "设计"), tags=("杂志", "不对称双栏", "衬线"),
            theme={"primary": "#b4345c", "secondary": "#2b2b2b", "bg": "#ffffff", "text": "#2b2b2b"},
            desc="jadeAI 杂志：刊头式双线 masthead + 不对称双栏，衬线标题与首字放大，编辑感强",
        ),
        BackendTemplateMeta(
            id="jade-artistic", name="艺术创想版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 6.0},
            layout_features=LayoutFeatures(page_margin_y_mm=14.0, page_margin_x_mm=16.0),
            category="creative", industries=("设计", "艺术", "传媒", "广告"), tags=("色块", "拼贴", "艺术"),
            theme={"primary": "#e0682f", "secondary": "#f2b03c", "bg": "#ffffff", "text": "#33302e"},
            desc="jadeAI 艺术：色块拼贴页眉 + 斜体粗条标题 + 圆点技能胶囊，视觉张力大",
        ),
        BackendTemplateMeta(
            id="jade-retro", name="复古雅致版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.72, "sectionGapMm": 6.0},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="creative", industries=("文化", "教育", "出版", "设计"), tags=("复古", "衬线", "纸质"),
            theme={"primary": "#8c5a2b", "secondary": "#c8b48d", "bg": "#faf3e3", "text": "#4a3728"},
            desc="jadeAI 复古：米黄纸质底 + 衬线居中刊头 + 菱形装饰标题，怀旧雅致",
        ),
        BackendTemplateMeta(
            id="jade-neon", name="霓虹暗夜版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.7, "sectionGapMm": 6.0},
            layout_features=LayoutFeatures(full_bleed_header=True, dark_background=True),
            category="tech", industries=("技术", "互联网", "游戏", "直播"), tags=("霓虹", "暗夜", "青紫"),
            theme={"primary": "#00e5ff", "secondary": "#b14aff", "bg": "#0a0a16", "text": "#dff6ff"},
            desc="jadeAI 霓虹：整页深色底 + 青紫霓虹描边与发光标题，暗夜赛博感",
        ),
        BackendTemplateMeta(
            id="jade-watercolor", name="水彩晕染版", author="jadeAI (twwch/JadeAI) 迁移", version="1.0.0",
            text_defaults={"baseFontSizePt": 10.0, "lineHeight": 1.75, "sectionGapMm": 6.0},
            layout_features=LayoutFeatures(page_margin_y_mm=15.0, page_margin_x_mm=16.0),
            category="creative", industries=("设计", "艺术", "教育", "文化"), tags=("水彩", "晕染", "柔和"),
            theme={"primary": "#c97f9c", "secondary": "#a78bcd", "bg": "#fdfaf8", "text": "#554a52"},
            desc="jadeAI 水彩：多层径向渐变模拟晕染页眉 + 大圆角柔色卡片，温润轻盈",
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
