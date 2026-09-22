"""邮件模板管理（阶段2）：投递附言的默认模板 + 用户自定义模板 CRUD。

- 首次访问时惰性播种两条内置模板（正式版/简洁版），降低上手成本；
- is_default 每用户至多一条，设新默认时自动取消旧默认；
- 模板 body 支持 {job_title}/{company}/{applicant_name} 占位符，
  由前端在选择模板时替换后填入附言框（可继续手动编辑）。
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.email_template import EmailTemplate
from app.models.user import User
from app.schemas.email_template import (
    EmailTemplateCreate,
    EmailTemplateResponse,
    EmailTemplateUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/email-templates", tags=["EmailTemplates"])

# 内置默认模板（首次访问播种；占位符由前端渲染时替换）
_BUILTIN_TEMPLATES = [
    {
        "name": "默认·正式版",
        "body": (
            "您好！\n\n我从贵司招聘信息中了解到 {company} 正在招聘 {job_title}，"
            "我的背景与该岗位要求较为匹配，特此投递简历，期待有机会进一步沟通。\n\n"
            "简历详见附件，感谢您百忙之中查阅！\n\n{applicant_name}"
        ),
        "is_default": True,
    },
    {
        "name": "默认·简洁版",
        "body": "您好，我对 {company} 的 {job_title} 岗位很感兴趣，简历请查收附件，盼回复。{applicant_name}",
        "is_default": False,
    },
]


async def _seed_if_empty(db: AsyncSession, user: User) -> None:
    """该用户一条模板都没有时，播种内置默认模板（只发生一次）。"""
    existing = await db.execute(
        select(EmailTemplate.id).where(EmailTemplate.user_id == user.id).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return
    for tpl in _BUILTIN_TEMPLATES:
        db.add(EmailTemplate(user_id=user.id, **tpl))
    await db.flush()


async def _clear_other_default(db: AsyncSession, user_id: str, keep_id: str | None) -> None:
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.user_id == user_id,
            EmailTemplate.is_default.is_(True),
            EmailTemplate.id != keep_id,
        )
    )
    for t in result.scalars().all():
        t.is_default = False


@router.get("/", response_model=list[EmailTemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """我的模板列表（首次访问自动播种内置默认模板）。"""
    await _seed_if_empty(db, user)
    await db.commit()
    result = await db.execute(
        select(EmailTemplate)
        .where(EmailTemplate.user_id == user.id)
        .order_by(EmailTemplate.is_default.desc(), EmailTemplate.updated_at.desc())
    )
    return list(result.scalars().all())


@router.post("/", response_model=EmailTemplateResponse, status_code=201)
async def create_template(
    body: EmailTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """新建自定义模板；is_default=True 时取消其它默认。"""
    tpl = EmailTemplate(user_id=user.id, name=body.name.strip(), body=body.body.strip(),
                        is_default=body.is_default)
    db.add(tpl)
    await db.flush()
    if body.is_default:
        await _clear_other_default(db, user.id, tpl.id)
    await db.commit()
    await db.refresh(tpl)
    return tpl


@router.put("/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: str,
    body: EmailTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.id == template_id, EmailTemplate.user_id == user.id)
    )
    tpl = result.scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    if body.name is not None:
        tpl.name = body.name.strip()
    if body.body is not None:
        tpl.body = body.body.strip()
    if body.is_default is True:
        tpl.is_default = True
        await _clear_other_default(db, user.id, tpl.id)
    elif body.is_default is False:
        tpl.is_default = False
    await db.commit()
    await db.refresh(tpl)
    return tpl


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.id == template_id, EmailTemplate.user_id == user.id)
    )
    tpl = result.scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    await db.delete(tpl)
    await db.commit()
    return {"detail": "模板已删除"}
