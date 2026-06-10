"""
Prompt 模板版本管理服务
支持多场景、版本控制、灰度发布
"""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.admin import PromptTemplate


PROMPT_SCENES = {
    "work_experience": "工作经历优化",
    "summary": "个人总结优化",
    "project": "项目经验优化",
    "skill_fill": "关键词填充",
    "star_rewrite": "STAR法则重写",
    "general": "通用优化",
}


async def create_prompt_version(
    db: AsyncSession,
    name: str,
    scene: str,
    content: str,
    variables: dict | None = None,
    admin_id: str | None = None,
) -> PromptTemplate:
    latest_result = await db.execute(
        select(func.max(PromptTemplate.version)).where(
            PromptTemplate.name == name, PromptTemplate.scene == scene
        )
    )
    latest = latest_result.scalar()
    new_version = (latest or 0) + 1

    if new_version == 1:
        is_active = True
    else:
        is_active = False

    prompt = PromptTemplate(
        id=str(uuid.uuid4()),
        name=name, scene=scene, version=new_version,
        content=content, variables=variables,
        is_active=is_active, gray_ratio=0,
        created_by=admin_id,
    )
    db.add(prompt)
    await db.flush()
    await db.refresh(prompt)
    return prompt


async def get_active_prompt(db: AsyncSession, name: str, scene: str) -> PromptTemplate | None:
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.name == name,
            PromptTemplate.scene == scene,
            PromptTemplate.is_active == True,
        ).order_by(PromptTemplate.version.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def deploy_prompt(
    db: AsyncSession,
    prompt_id: str,
    gray_ratio: int = 0,
    admin_id: str | None = None,
) -> PromptTemplate:
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise ValueError("Prompt not found")

    if gray_ratio == 100:
        others_result = await db.execute(
            select(PromptTemplate).where(
                PromptTemplate.name == prompt.name,
                PromptTemplate.scene == prompt.scene,
                PromptTemplate.is_active == True,
            )
        )
        for other in others_result.scalars().all():
            other.is_active = False

    prompt.gray_ratio = gray_ratio
    prompt.is_active = True
    await db.flush()
    return prompt


async def rollback_prompt(db: AsyncSession, name: str, scene: str, target_version: int) -> PromptTemplate:
    target_result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.name == name,
            PromptTemplate.scene == scene,
            PromptTemplate.version == target_version,
        )
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise ValueError(f"Version {target_version} not found")

    current_result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.name == name,
            PromptTemplate.scene == scene,
            PromptTemplate.is_active == True,
        )
    )
    for current in current_result.scalars().all():
        current.is_active = False

    target.is_active = True
    target.gray_ratio = 100
    await db.flush()
    return target


async def get_prompt_versions(db: AsyncSession, name: str, scene: str) -> list[PromptTemplate]:
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.name == name, PromptTemplate.scene == scene
        ).order_by(PromptTemplate.version.desc())
    )
    return list(result.scalars().all())


async def resolve_prompt_for_user(db: AsyncSession, name: str, scene: str, user_id: str) -> tuple[PromptTemplate | None, str]:
    """
    根据灰度比例解析用户应该使用哪个Prompt版本
    返回 (prompt, strategy): strategy = 'active' | 'gray' | 'default'
    """
    base_result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.name == name,
            PromptTemplate.scene == scene,
            PromptTemplate.is_active == True,
        ).order_by(PromptTemplate.gray_ratio.desc()).limit(2)
    )
    candidates = base_result.scalars().all()
    if not candidates:
        return None, "default"

    active = candidates[0]
    if active.gray_ratio >= 100 or len(candidates) == 1:
        return active, "active"

    gray_candidate = candidates[1] if len(candidates) > 1 and candidates[1].gray_ratio > 0 else None
    if gray_candidate:
        bucket = hash(user_id) % 100
        if bucket < gray_candidate.gray_ratio:
            return gray_candidate, "gray"

    return active, "active"