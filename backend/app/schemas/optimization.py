from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MatchAnalysis(BaseModel):
    match_score: int
    strengths: list[str] = []
    gaps: list[str] = []
    rewrite_strategy: dict = {}


class OptimizeRequest(BaseModel):
    resume_id: Optional[str] = None
    job_image_id: Optional[str] = None
    custom_instructions: Optional[str] = None
    template: Optional[str] = None  # 模板方案: 不传则自动选择


class QuickOptimizeRequest(BaseModel):
    """「我的信息」一键优化：直接传入简历文本和岗位文本"""
    resume_text: str
    job_text: str
    custom_instructions: Optional[str] = None
    template: Optional[str] = "professional"  # professional | simple


class RenderRequest(BaseModel):
    """直接渲染：跳过 AI 优化，将简历 JSON 直接生成 PDF"""
    resume_id: str
    template: Optional[str] = "professional"


class RenderTextRequest(BaseModel):
    """直接渲染（文本）：解析简历文本后直接生成 PDF，跳过 AI 优化"""
    resume_text: str
    template: Optional[str] = "professional"


class OptimizeResponse(BaseModel):
    id: str
    resume_id: Optional[str] = None
    job_image_id: Optional[str] = None
    match_analysis: Optional[MatchAnalysis] = None
    original_json: Optional[dict] = None
    optimized_json: Optional[dict] = None
    layout_json: Optional[dict] = None
    # 用户选定的模板 ID（预览/重新导出/PDF 文档属性的唯一事实来源）
    template: Optional[str] = None
    # 用户主题定制（部分字段；NULL/空 = 用模板默认主题，见 app/services/resume_theme.py）
    theme_config: Optional[dict] = None
    changes_description: Optional[str] = None
    custom_instructions: Optional[str] = None
    pdf_url: Optional[str] = None
    match_score: Optional[int] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    category: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_favorite: bool = False
    satisfaction_score: Optional[int] = None
    feedback_text: Optional[str] = None
    parent_record_id: Optional[str] = None
    refine_count: int = 0
    deleted_at: Optional[datetime] = None
    status: str
    created_at: Optional[datetime] = None


class SatisfactionFeedbackRequest(BaseModel):
    satisfaction_score: int
    feedback_text: Optional[str] = None


class UpdateContentRequest(BaseModel):
    """在线编辑优化结果：整体替换 optimized_json（前端保证结构与解析结果一致）。"""
    optimized_json: dict


class SaveLayoutRequest(BaseModel):
    """可视化排版：保存布局文档（前端保证结构合法，后端只做最基础的形状校验）。"""
    layout: dict


class TemplateUpdateRequest(BaseModel):
    """切换记录使用的模板（模板 ID 落库，成为预览/导出的唯一事实来源）。"""
    template: str


class QrCodeUpdateRequest(BaseModel):
    """设置/移除简历底部二维码（存于 optimized_json['qr_code']，渲染时统一注入）。

    - image：data URL（base64 png/jpeg/webp，解码后 ≤300KB）；None/空 = 移除
    - label / url：可选文字说明与链接（渲染为图片旁的两行小字）
    """
    image: Optional[str] = None
    label: Optional[str] = None
    url: Optional[str] = None


class ThemeUpdateRequest(BaseModel):
    """更新记录的主题定制（部分字段即可；与模板默认合并，见 resume_theme.normalize_theme_config）。

    字段范围：
    - primary / accent：#RRGGBB
    - fontFamily：白名单字体（Noto Sans SC / Microsoft YaHei / PingFang SC / SimSun /
      SimHei / Source Han Serif SC / Alibaba PuHuiTi）
    - baseFontSizePt：8-16；lineHeight：1.1-2.0；marginMm：0-30；sectionGapMm：0-20
    """
    primary: Optional[str] = None
    accent: Optional[str] = None
    fontFamily: Optional[str] = None
    baseFontSizePt: Optional[float] = None
    lineHeight: Optional[float] = None
    marginMm: Optional[float] = None
    sectionGapMm: Optional[float] = None

    def to_config(self) -> dict:
        """只取显式提供的字段（None 不算提供——否则会把用户没改的项覆盖成空）。"""
        return self.model_dump(exclude_none=True)


class ExportLayoutRequest(BaseModel):
    """可视化排版导出：前端共享渲染器生成的 body HTML + 块样式 CSS。

    html/css 是预览所用的同一实现（renderHtml.ts），后端只负责包字体壳
    并用 Playwright 出 A4 PDF，保证导出与预览 1:1。
    """
    html: str
    css: str = ""
    layout: Optional[dict] = None


class DiffRequest(BaseModel):
    id1: str
    id2: str


class DiffResponse(BaseModel):
    record_a: OptimizeResponse
    record_b: OptimizeResponse
    diff_summary: str


# ── AI 修改逐条确认（P0）──

class FactCheck(BaseModel):
    """单条 AI 建议的事实核验结果（P0-4，规则引擎产出）。"""
    level: str = "ok"            # ok / warn
    flags: list[str] = []        # sourced / insufficient_source / added_number / added_skill / exaggeration
    added_numbers: list[str] = []  # 原简历没有的数字，如 ["35%","3倍"]
    exag_words: list[str] = []     # 原简历没有的强主张词，如 ["主导","精通"]
    added_words: list[str] = []    # AI 新增的内容片段（供核对）


class ChangeItem(BaseModel):
    """单条 AI 修改建议（条/点级粒度，带稳定 id 与定位信息）。"""
    id: str
    kind: str  # modified / added / removed
    section: str  # summary / skills / experience / projects
    section_label: str
    label: str
    original_text: Optional[str] = None
    suggested_text: Optional[str] = None
    loc: dict = {}
    payload: Optional[dict] = None
    editable: bool = True  # 是否支持「编辑后接受」（结构类条目仅接受/拒绝）
    fact_check: Optional[FactCheck] = None  # 事实核验标注


class ChangeReviewResponse(BaseModel):
    record_id: str
    changes: list[ChangeItem] = []
    counts: dict = {}
    warn_count: int = 0  # 含「需确认事实」警告的建议条数


class ChangeApplyDecision(BaseModel):
    id: str
    action: str  # accept / reject
    text: Optional[str] = None  # 「编辑后接受」的最终文本


class ChangeApplyRequest(BaseModel):
    decisions: list[ChangeApplyDecision]