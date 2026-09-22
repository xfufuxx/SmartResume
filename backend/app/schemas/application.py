"""岗位投递申请：用户向指定岗位发起投递（招聘软件式一键投递）。

核心设计（贴近 Boss直聘 / 智联等招聘软件体验）：
- 投递时用户只需「选择简历 + 选填附言」，联系方式（姓名 / 邮箱 / 电话）
  自动取自个人资料（User 表），无需每次重复填写。
- 申请数据与对应岗位关联存储（job_image_id 外键，岗位级联删除）。
- 投递状态记录与结果反馈（status：submitted/viewed/interview/offer/rejected）。
- 防重复投递：user_id + job_image_id 唯一约束 + 创建前二次拦截返回 409。
"""
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

# 投递状态（前端下拉、统计卡共用同一套取值）
APPLICATION_STATUSES = ["submitted", "viewed", "interview", "offer", "rejected"]
APPLICATION_STATUS_LABELS = {
    "submitted": "已投递",
    "viewed": "被查看",
    "interview": "邀面试",
    "offer": "已录用",
    "rejected": "不合适",
}

_STATUS_SET = set(APPLICATION_STATUSES)

# 外部投递通道与状态（阶段1：邮件直投；阶段3：官网表单；阶段4：平台引导）
DELIVERY_CHANNELS = ["email", "manual", "form", "guide"]
DELIVERY_CHANNEL_LABELS = {
    "email": "邮件直投",
    "manual": "手动投递记录",
    "form": "官网表单投递",
    "guide": "平台引导投递",
}
DELIVERY_STATUSES = ["pending", "sent", "failed", "bounced", "not_applicable"]
DELIVERY_STATUS_LABELS = {
    "pending": "发送中",
    "sent": "已送达",
    "failed": "发送失败",
    "bounced": "被退信",
    "not_applicable": "记录模式",
}

import re

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_URL_RE = re.compile(r"^https?://[^\s<>'\"/]+(/[^\s<>'\"]*)?$", re.IGNORECASE)


def _check_url(v: str | None) -> str | None:
    """URL 宽松校验：仅接受 http/https 且长度 ≤500。"""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if len(v) > 500 or not _URL_RE.match(v):
        raise ValueError("投递链接格式不正确（需以 http/https 开头）")
    return v


class ApplicationCreate(BaseModel):
    """发起投递：岗位 + 选填简历/附言 + 投递通道参数。

    - recipient_email 为空 → manual 记录模式（引导用户去官方渠道投递，站内留痕）。
    - recipient_email 非空 → 邮件直投通道，必须同时 consent_given=True（PIPL 单独同意）。
    """
    job_image_id: str = Field(..., description="投递的岗位 ID")
    resume_id: str | None = Field(None, description="投递所用简历（可选）")
    cover_letter: str | None = Field(None, max_length=5000, description="附言 / 求职信（可选）")
    recipient_email: str | None = Field(
        None, max_length=255, description="HR 接收邮箱（空则走记录模式）",
    )
    apply_url: str | None = Field(
        None, max_length=500, description="官网投递入口 URL（提供且授权时走官网表单半自动通道）；guide 通道传平台深链",
    )
    channel_hint: str | None = Field(
        None, description="显式通道选择（guide=平台引导投递）；不传则按 email>form 自动决策",
    )
    consent_given: bool = Field(
        False, description="用户对本次对外投递的明示同意（PIPL 单独同意，必为 true 才发送）",
    )

    @field_validator("channel_hint")
    @classmethod
    def _check_channel_hint(cls, v: str | None) -> str | None:
        if v is not None and v != "guide":
            raise ValueError("channel_hint 仅支持 guide（email/form 由系统自动决策）")
        return v

    @field_validator("recipient_email")
    @classmethod
    def _check_recipient_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v and not _EMAIL_RE.match(v):
            raise ValueError("HR 邮箱格式不正确")
        return v or None

    @field_validator("apply_url")
    @classmethod
    def _check_apply_url(cls, v: str | None) -> str | None:
        return _check_url(v)


class ApplicationUpdate(BaseModel):
    """更新投递：手动推进状态、改投递简历或补附言（联系方式不可改，取自个人资料）。"""
    status: str | None = Field(None, description="投递状态（不传则保持原状）")
    resume_id: str | None = Field(None, description="投递所用简历（可选）")
    cover_letter: str | None = Field(None, max_length=5000, description="附言 / 求职信（可选）")

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _STATUS_SET:
            raise ValueError(f"状态必须是 {'/'.join(APPLICATION_STATUSES)} 之一")
        return v

    @field_validator("cover_letter", "resume_id")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip() or None
        return v


class ApplicationResponse(BaseModel):
    id: str
    user_id: str
    job_image_id: str
    resume_id: str | None = None
    # 联系方式快照（创建时从个人资料自动写入，用于展示与导出）
    applicant_name: str = ""
    email: str = ""
    phone: str = ""
    expected_salary: str | None = None
    available_from: date | None = None
    cover_letter: str | None = None
    status: str = "submitted"
    # ── 真实触达（阶段1：邮件直投；阶段3：官网表单）──
    channel: str | None = None
    apply_url: str | None = None
    recipient_email: str | None = None
    delivery_status: str | None = None
    sent_at: datetime | None = None
    provider_message_id: str | None = None
    consent_at: datetime | None = None
    # 展示用：来自岗位快照（岗位被级联删除时申请也已删除，故此字段恒有值）
    job_title: str | None = None
    job_company: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class DeliveryEventResponse(BaseModel):
    """投递事件流水（发送/送达/退信/失败…），用于投递轨迹时间线。"""
    id: str
    application_id: str
    event_type: str
    detail: str | None = None
    occurred_at: datetime | None = None

    model_config = {"from_attributes": True}


class ApplicationStats(BaseModel):
    """基于真实投递记录的统计（无模拟数据）。"""
    total: int = 0
    by_status: dict = {}


# ── 阶段2：批量投递 ──

BATCH_MAX_JOBS = 10  # 单次批量上限（配合每日额度 20 封防滥用）


class BatchApplicationCreate(BaseModel):
    """批量投递：多个岗位共用同一份简历 / 附言 / 授权与通道参数，逐个排队。

    recipient_emails 可选：{job_image_id: hr_email}，只对提供了邮箱且 consent
    的岗位走邮件直投，其余走 manual 记录模式。
    """
    job_image_ids: list[str] = Field(..., min_length=1, max_length=BATCH_MAX_JOBS, description="岗位 ID 列表（≤10）")
    resume_id: str | None = Field(None, description="批量共用简历（可选）")
    cover_letter: str | None = Field(None, max_length=5000, description="批量共用附言（可选）")
    recipient_emails: dict[str, str] | None = Field(None, description="岗位→HR邮箱映射（可选）")
    consent_given: bool = Field(False, description="对本次批量对外投递的明示同意（PIPL）")


class BatchResultItem(BaseModel):
    job_image_id: str
    application_id: str | None = None
    ok: bool = False
    code: int = 201
    detail: str = ""


class BatchApplicationResult(BaseModel):
    created: int = 0
    skipped: int = 0
    failed_quota: int = 0
    items: list[BatchResultItem] = []


class SuppressionEntryResponse(BaseModel):
    id: str
    email: str
    reason: str
    detail: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class SuppressionCreate(BaseModel):
    email: str = Field(..., max_length=255, description="要加入名单的邮箱")
    detail: str | None = Field(None, max_length=500, description="备注")

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("邮箱格式不正确")
        return v


# ── 阶段3：官网表单半自动投递（通道 B）──

class FormProbeRequest(BaseModel):
    """官网表单探测：抓取 apply_url 页面并识别投递表单结构（只读，不提交任何数据）。"""
    url: str = Field(..., max_length=500, description="官网投递页 URL")

    @field_validator("url")
    @classmethod
    def _check_url_field(cls, v: str) -> str:
        checked = _check_url(v)
        if not checked:
            raise ValueError("url 不能为空")
        return checked


class FormProbeField(BaseModel):
    """探测到的单个表单字段（含定位器与用途分类，供预填与前端展示）。"""
    selector: str = Field(..., description="Playwright/页面定位器（优先 id/name）")
    kind: str = Field(..., description="字段用途: name/email/phone/cover_letter/resume_file/other")
    input_type: str = Field("text", description="输入类型: text/email/tel/textarea/file/select/other")
    label: str | None = Field(None, description="字段标签文本（识别不出为空）")


class FormProbeResult(BaseModel):
    """探测结果：robots 核查 + 表单结构识别。"""
    ok: bool = Field(..., description="探测是否成功（robots 允许 且 找到表单）")
    url: str
    robots_allowed: bool = True
    robots_detail: str | None = Field(None, description="robots 核查说明（被拒时给出原因）")
    form_detected: bool = False
    fields: list[FormProbeField] = []
    site_title: str | None = None
    detail: str | None = Field(None, description="补充说明（如页面不可达原因）")


class FormResultReport(BaseModel):
    """用户在官网浏览器人工确认后的提交结果回填。"""
    result: str = Field(..., description="submitted=已在官网确认提交 / failed=提交未完成")
    detail: str | None = Field(None, max_length=500, description="补充说明")

    @field_validator("result")
    @classmethod
    def _check_result(cls, v: str) -> str:
        if v not in ("submitted", "failed"):
            raise ValueError("result 必须是 submitted/failed 之一")
        return v


# ── 阶段4：平台引导投递（通道 C）──

class GuidePackResponse(BaseModel):
    """一键准备包：平台引导信息 + 可复制的简历纯文本。"""
    platform_key: str = Field(..., description="平台标识（boss/zhilian/51job/liepin/lagou/linkedin）")
    platform_name: str = Field(..., description="平台展示名")
    deep_link: str = Field(..., description="平台岗位深链（JD 内平台链接优先，否则平台搜索页）")
    link_source: str = Field(..., description="深链来源: job_url=JD内平台链接 / platform_search=平台搜索页")
    job_title: str | None = None
    job_company: str | None = None
    resume_title: str | None = Field(None, description="所用简历标题")
    resume_text: str = Field("", description="简历纯文本（可直接粘贴到平台输入框）")
