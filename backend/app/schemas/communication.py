"""面试追踪 - 沟通消息：用户与某家公司就某次投递的往来记录。

与全局通知中心 /messages 相互独立，这里是对「某次投递 / 某公司」的过程性沟通，
可在面试追踪栏目中与投递记录、面试进度并列查看。
"""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# 方向 / 渠道（前端下拉与统计共用同一套取值，避免前后端漂移）
COMMUNICATION_DIRECTIONS = ["out", "in"]
COMMUNICATION_DIRECTION_LABELS = {"out": "我→公司", "in": "公司→我"}
COMMUNICATION_CHANNELS = ["phone", "email", "wechat", "other"]
COMMUNICATION_CHANNEL_LABELS = {"phone": "电话", "email": "邮件", "wechat": "微信", "other": "其他"}

_DIR_SET = set(COMMUNICATION_DIRECTIONS)
_CH_SET = set(COMMUNICATION_CHANNELS)


class CommunicationCreate(BaseModel):
    """新增沟通：可关联一条投递记录（自动带出公司 / 职位），也可只填公司名。"""
    application_id: str | None = Field(None, description="关联的投递记录（可选）")
    company: str | None = Field(None, max_length=200, description="公司名称（未关联投递时必填）")
    position: str | None = Field(None, max_length=200, description="职位（可选）")
    direction: str = Field(..., description="out(我→公司) / in(公司→我)")
    channel: str = Field(..., description="phone / email / wechat / other")
    content: str = Field(..., min_length=1, max_length=5000, description="沟通内容")
    contact_at: datetime | None = Field(None, description="沟通发生时间（可选，默认现在）")

    @field_validator("direction")
    @classmethod
    def _chk_dir(cls, v: str) -> str:
        if v not in _DIR_SET:
            raise ValueError(f"direction 必须是 {'/'.join(COMMUNICATION_DIRECTIONS)} 之一")
        return v

    @field_validator("channel")
    @classmethod
    def _chk_ch(cls, v: str) -> str:
        if v not in _CH_SET:
            raise ValueError(f"channel 必须是 {'/'.join(COMMUNICATION_CHANNELS)} 之一")
        return v

    @field_validator("company", "position", "content")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip() or None
        return v


class CommunicationUpdate(BaseModel):
    """更新沟通：各字段均可选，不传则保持原状。"""
    application_id: str | None = Field(None)
    company: str | None = Field(None, max_length=200)
    position: str | None = Field(None, max_length=200)
    direction: str | None = Field(None)
    channel: str | None = Field(None)
    content: str | None = Field(None, min_length=1, max_length=5000)
    contact_at: datetime | None = Field(None)

    @field_validator("direction")
    @classmethod
    def _chk_dir(cls, v: str | None) -> str | None:
        if v is not None and v not in _DIR_SET:
            raise ValueError(f"direction 必须是 {'/'.join(COMMUNICATION_DIRECTIONS)} 之一")
        return v

    @field_validator("channel")
    @classmethod
    def _chk_ch(cls, v: str | None) -> str | None:
        if v is not None and v not in _CH_SET:
            raise ValueError(f"channel 必须是 {'/'.join(COMMUNICATION_CHANNELS)} 之一")
        return v

    @field_validator("company", "position", "content")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip() or None
        return v


class CommunicationResponse(BaseModel):
    id: str
    user_id: str
    application_id: str | None = None
    company: str = ""
    position: str | None = None
    direction: str
    channel: str
    content: str
    contact_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class CommunicationStats(BaseModel):
    """基于真实沟通记录的统计（无模拟数据）。"""
    total: int = 0
    by_direction: dict = {}
    by_channel: dict = {}
