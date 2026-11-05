"""证书与学习方向推荐 API：基于简历 + 目标岗位 JD 的差距分析 → 证书/课程推荐。"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import RateLimiter, get_current_user, get_db
from app.core.errors import app_err
from app.core.llm_errors import LLMQuotaExhausted, wrap_llm_error
from app.core.llm_policy import PaidCallBlocked
from app.models.job_image import JobImage
from app.models.resume import Resume
from app.models.user import User
from app.services.cert_catalog import CATEGORIES, CERT_CATALOG
from app.services.cert_recommend import recommend_certs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/certs", tags=["Cert Recommend"])

_certs_limiter = RateLimiter(max_requests=3, window_seconds=60)


class CertRecommendRequest(BaseModel):
    resume_id: str
    job_id: str
    existing_certifications: str | None = Field(default=None, max_length=2000)
    time_budget: str | None = Field(default=None, max_length=100)
    budget: str | None = Field(default=None, max_length=100)


@router.get("/catalog")
async def get_cert_catalog(user: User = Depends(get_current_user)):
    """内置行业证书 & 学习资源库（静态目录，人工整理；不调 LLM、不耗额度）。"""
    return {"categories": CATEGORIES, "items": CERT_CATALOG}


@router.post("/recommend")
async def create_cert_recommendation(
    body: CertRecommendRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rl: None = Depends(_certs_limiter),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == body.resume_id, Resume.user_id == user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise app_err("RESUME_NOT_FOUND")
    if not resume.parsed_json:
        raise app_err("PARSE_BEFORE_OPTIMIZE")

    job_result = await db.execute(
        select(JobImage).where(JobImage.id == body.job_id, JobImage.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise app_err("JOB_NOT_FOUND")
    if not job.parsed_job_json:
        raise app_err("PARSE_BEFORE_OPTIMIZE")

    try:
        return await recommend_certs(
            resume.parsed_json,
            job.parsed_job_json,
            existing_certifications=body.existing_certifications,
            time_budget=body.time_budget,
            budget=body.budget,
        )
    except PaidCallBlocked as e:
        # 计费策略拦截（当前配置的模型已转为按量计费且未允许付费）
        logger.warning("证书推荐被计费策略拦截: %s", e)
        raise HTTPException(
            status_code=503,
            detail=(
                "AI 模型额度已用尽（当前模型已转为按量计费）。"
                "请在 backend/.env 将 LLM_MODEL_TEXT 换成免费额度内的模型，"
                "或设置 LLM_ALLOW_PAID=true 允许按量计费后重试。"
            ),
        ) from e
    except LLMQuotaExhausted as e:
        logger.warning("证书推荐额度耗尽: %s", e)
        raise HTTPException(status_code=402, detail=str(e)) from e
    except ValueError as e:
        # JSON 解析失败 / 上游 400 等，提示本身已是中文
        logger.warning("证书推荐返回异常: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001 —— 兜底：统一转中文，不裸 500
        logger.exception("证书推荐失败")
        friendly = wrap_llm_error(e, settings.LLM_MODEL_TEXT)
        raise HTTPException(status_code=502, detail=str(friendly)) from e
