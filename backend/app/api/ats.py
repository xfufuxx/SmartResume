"""ATS 预检接口：对简历 JSON 做规则化 ATS 友好度检查（不调用 AI）。"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.user import User
from app.services.ats_check import ats_check

router = APIRouter(prefix="/api/ats", tags=["ATS"])


class AtsCheckRequest(BaseModel):
    resume_json: dict
    job_json: Optional[dict] = None


@router.post("/check", summary="ATS 友好度预检")
async def ats_check_endpoint(
    body: AtsCheckRequest,
    user: User = Depends(get_current_user),
):
    """对简历/优化结果做 ATS 预检，返回评分、问题清单与修改建议。

    可传入 job_json（岗位结构化 JSON）以获得关键词覆盖分析。
    """
    return ats_check(body.resume_json, body.job_json)
