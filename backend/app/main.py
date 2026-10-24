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
from app.api import capability
from app.api import templates as templates_api
from app.api import ai_photo
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
    # 岗位能力测评：幂等播种内置岗位画像（create_all 之后，恢复任务之前）
    from app.services.capability_seed import seed_job_profiles
    from app.database import async_session_factory
    try:
        async with async_session_factory() as seed_session:
            await seed_job_profiles(seed_session)
    except Exception:
        logging.getLogger(__name__).warning("[岗位画像] 播种失败", exc_info=True)
    # 可靠任务队列（P0）：启动时清理上次进程遗留的中断任务（pending/processing → failed）
    from app.services.task_recovery import recover_interrupted_tasks
    try:
        await recover_interrupted_tasks()
    except Exception:
        logging.getLogger(__name__).warning("[任务恢复] 启动恢复执行失败", exc_info=True)
    yield
    # 退出收尾：释放常驻 Chromium（不释放会留下孤儿进程，占内存且拖慢重启）
    try:
        from app.services.browser_pool import shutdown_browser
        await shutdown_browser()
    except Exception:
        logging.getLogger(__name__).warning("[浏览器池] 释放失败", exc_info=True)


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
app.include_router(capability.router)
app.include_router(templates_api.router, prefix="/api/templates", tags=["Templates"])
app.include_router(ai_photo.router, tags=["AI Photo"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}