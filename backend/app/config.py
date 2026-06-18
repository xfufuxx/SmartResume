from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Smart Resume API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://postgres:root@localhost:5432/smart_resume"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    S3_BUCKET: str = "smart-resume"
    S3_ENDPOINT: Optional[str] = None
    S3_REGION: str = "us-east-1"

    LLM_API_KEY: Optional[str] = None
    LLM_MODEL_VISION: str = "gpt-4o"
    LLM_MODEL_TEXT: str = "gpt-4o-mini"
    LLM_API_BASE: Optional[str] = None

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024

    BACKEND_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    USE_LOCAL_OCR: bool = False
    USE_WEASYPRINT: bool = True
    USE_TEMPLATE_PDF: bool = True  # 使用统一模板渲染简历（替代像素级复原）

    SMTP_HOST: str = "smtp.qq.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()