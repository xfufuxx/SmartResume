import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.api import auth, resumes, jobs, optimization, scoring, feedback, matching, batch, refine, user, messages, admin

# 确保 uploads 目录存在（模块加载时创建，避免 StaticFiles 挂载失败）
os.makedirs("uploads", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# 挂载本地文件存储目录，使浏览器可以访问上传的文件和生成的 PDF
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(matching.router, prefix="/api/match", tags=["Matching"])
app.include_router(batch.router, prefix="/api", tags=["Batch"])
app.include_router(refine.router, prefix="/api", tags=["Refine"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}