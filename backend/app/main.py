import os, sys, asyncio

# Windows 下必须使用 ProactorEventLoop 才能支持子进程（Playwright 需要）
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import auth, resumes, jobs, optimization, scoring, matching, batch, refine, user, messages, admin
from app.api import files, export, ats
from app.api import insights, interview, interview_tracks, search, analysis, applications, communications
from app.core.log_filter import install_sensitive_log_filter

# 确保 uploads 目录存在（模块加载时创建）
os.makedirs("uploads", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 全局安装日志脱敏过滤器：防止姓名/电话/邮箱等 PII 原文写入日志
    install_sensitive_log_filter()
    from app.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 轻量迁移：create_all 不能给老表补列，此处幂等 ALTER（阶段1 邮件直投列）
    from app.db_migrations import run_lightweight_migrations
    await run_lightweight_migrations(engine)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# 注意：不再以 StaticFiles 公开挂载 /uploads，避免简历 PII 被直连下载（PIPL 红线）。
# 文件访问统一走签名 URL 代理 /api/files/{key}（见 app/api/files.py）。

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(resumes.router, prefix="/api/resumes", tags=["Resumes"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Job Analysis"])
app.include_router(optimization.router, prefix="/api/optimize", tags=["Optimization"])
app.include_router(scoring.router, prefix="/api", tags=["Scoring"])
# 注：「投递反馈」(feedback) 路由已下线：项目不具备投递能力，
# 面试追踪改为由用户在 /api/interview-tracks 手动录入。feedbacks 表保留为历史数据。
app.include_router(interview_tracks.router, tags=["Interview Tracks"])
app.include_router(applications.router, tags=["Applications"])
app.include_router(communications.router, tags=["Communications"])
from app.api.email_templates import router as email_templates_router  # noqa: E402
app.include_router(email_templates_router, tags=["EmailTemplates"])
app.include_router(matching.router, prefix="/api/match", tags=["Matching"])
app.include_router(batch.router, prefix="/api", tags=["Batch"])
app.include_router(refine.router, prefix="/api", tags=["Refine"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(files.router, tags=["Files"])
app.include_router(export.router, tags=["Export"])
app.include_router(ats.router, tags=["ATS"])
app.include_router(insights.router, tags=["Insights"])
app.include_router(interview.router, tags=["Interview"])
app.include_router(search.router, tags=["Search"])
app.include_router(analysis.router, tags=["Analysis"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}