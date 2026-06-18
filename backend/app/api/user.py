from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.core.crypto import mask_phone, mask_email
from app.models.user import User
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.schemas.user import (
    UserResponse, UserProfileResponse, UpdateProfileRequest,
    UpdateExpectationRequest,
)
from app.services.storage import storage
from app.services.text_formatter import format_resume_text, format_job_text

router = APIRouter()


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id, email=mask_email(user.email),
        phone=mask_phone(user.phone) if user.phone else None,
        nickname=user.nickname, avatar_url=user.avatar_url,
        is_verified=user.is_verified, career_state=user.career_state,
        status=user.status,
    )


def _user_to_profile(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        phone=mask_phone(user.phone) if user.phone else None,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        career_state=user.career_state,
        expectation=user.expectation,
        saved_texts=user.saved_texts,
        privacy_agreed=user.privacy_agreed,
        status=user.status,
        created_at=user.created_at,
    )


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(user: User = Depends(get_current_user)):
    return _user_to_profile(user)


@router.put("/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.nickname is not None:
        user.nickname = body.nickname
    if body.career_state is not None:
        user.career_state = body.career_state
    if body.privacy_agreed is not None:
        user.privacy_agreed = body.privacy_agreed
    await db.commit()
    await db.refresh(user)
    return _user_to_profile(user)


@router.put("/expectation")
async def update_expectation(
    body: UpdateExpectationRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.expectation = {
        "industries": body.industries or [],
        "job_title": body.job_title or "",
        "salary_range": body.salary_range or "",
        "cities": body.cities or [],
    }
    await db.commit()
    return {"detail": "求职意向已更新", "expectation": user.expectation}


@router.post("/sync-saved-texts")
async def sync_saved_texts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """从已有的简历库和岗位库中读取默认数据，填充到用户的 saved_texts 中"""
    saved = dict(user.saved_texts) if user.saved_texts else {}
    updated_fields = []

    # 读取默认简历（可能存在多条 is_primary=True，取最新一条）
    resume_result = await db.execute(
        select(Resume).where(
            Resume.user_id == user.id,
            Resume.deleted_at.is_(None),
            Resume.is_primary == True,
        ).order_by(Resume.created_at.desc()).limit(1)
    )
    primary_resume = resume_result.scalars().first()
    if not primary_resume:
        fallback = await db.execute(
            select(Resume).where(
                Resume.user_id == user.id,
                Resume.deleted_at.is_(None),
            ).order_by(Resume.created_at.desc()).limit(1)
        )
        primary_resume = fallback.scalars().first()

    if primary_resume and primary_resume.parsed_json:
        resume_text = format_resume_text(primary_resume.parsed_json)
        if resume_text:
            saved["resume_text"] = resume_text
            updated_fields.append("简历信息")

    # 读取默认岗位（可能存在多条 is_primary=True，取最新一条）
    job_result = await db.execute(
        select(JobImage).where(
            JobImage.user_id == user.id,
            JobImage.deleted_at.is_(None),
            JobImage.is_primary == True,
        ).order_by(JobImage.created_at.desc()).limit(1)
    )
    primary_job = job_result.scalars().first()
    if not primary_job:
        fallback = await db.execute(
            select(JobImage).where(
                JobImage.user_id == user.id,
                JobImage.deleted_at.is_(None),
            ).order_by(JobImage.created_at.desc()).limit(1)
        )
        primary_job = fallback.scalars().first()

    if primary_job and primary_job.parsed_job_json:
        job_text = format_job_text(primary_job.parsed_job_json)
        if job_text:
            saved["job_text"] = job_text
            updated_fields.append("岗位信息")

    if not updated_fields:
        return {"detail": "没有找到可同步的简历或岗位数据", "saved_texts": user.saved_texts}

    user.saved_texts = saved
    await db.commit()
    await db.refresh(user)

    return {"detail": f"已同步: {', '.join(updated_fields)}", "saved_texts": user.saved_texts}


@router.put("/saved-texts")
async def update_saved_texts(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """允许用户手动修改简历文字和岗位文字"""
    saved = dict(user.saved_texts) if user.saved_texts else {}

    if "resume_text" in body:
        saved["resume_text"] = body["resume_text"] or ""
    if "job_text" in body:
        saved["job_text"] = body["job_text"] or ""

    user.saved_texts = saved
    await db.commit()
    await db.refresh(user)

    return {"detail": "已更新", "saved_texts": user.saved_texts}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ext = file.filename.split(".")[-1].lower() if file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="仅支持 PNG/JPG/WEBP 格式")

    import uuid
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像文件不能超过 5MB")

    key = f"avatars/{user.id}/{uuid.uuid4()}.{ext}"
    url = await storage.upload_bytes(content, key, f"image/{ext}")
    user.avatar_url = url
    await db.commit()

    return {"avatar_url": url}


@router.post("/privacy/agree")
async def agree_privacy(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.privacy_agreed = True
    await db.commit()
    return {"detail": "隐私协议已确认"}


@router.get("/export-data")
async def export_user_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """导出用户全部个人数据（GDPR 要求）"""
    await user.resumes
    await user.optimized_resumes
    await user.job_images

    data = {
        "user": {
            "id": user.id,
            "email": user.email,
            "phone": user.phone,
            "nickname": user.nickname,
            "career_state": user.career_state,
            "expectation": user.expectation,
            "saved_texts": user.saved_texts,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "resumes": [
            {
                "id": r.id, "title": r.title, "file_type": r.file_type,
                "parsed_json": r.parsed_json, "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in user.resumes if not r.deleted_at
        ],
        "optimized_resumes": [
            {
                "id": o.id, "job_title": o.job_title, "company": o.company,
                "match_score": o.match_score, "satisfaction_score": o.satisfaction_score,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in user.optimized_resumes[:50]
        ],
        "exported_at": user.created_at,
    }

    return {"detail": "数据导出成功", "data": data}