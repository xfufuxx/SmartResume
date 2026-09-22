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

    # 大模型：千问（阿里云百炼）OpenAI 兼容端点。
    # 实际取值以 backend/.env 为准，这里的默认值仅作为 .env 缺失时的兜底。
    # 文本与视觉共用同一个 base_url —— 两者必须来自同一服务端点。
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL_VISION: str = "qwen3.7-plus"
    LLM_MODEL_TEXT: str = "qwen3.7-plus"
    LLM_API_BASE: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024

    # 文件访问签名 URL 有效期（秒）。通过签名代理 /api/files/{key} 下发，
    # 替代原先公开挂载的 /uploads 静态目录，避免 PII 简历原件被直连泄露。
    FILE_URL_TTL: int = 60 * 60 * 24 * 30  # 30 天

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

    # ── 真实投递（阶段1：邮件直投）──
    DELIVERY_ENABLED: bool = True          # 总开关（关闭时投递一律走 manual 记录模式）
    DELIVERY_DAILY_LIMIT: int = 20         # 每用户每日真实投递上限（反骚扰/反滥用）
    DELIVERY_FROM_NAME: str = "智能简历求职助手"  # 邮件里的发件人显示名

    # ── 阶段2：IMAP 回执轮询（收退信/HR 自动回复）──
    # 使用与 SMTP 同一邮箱账号的 IMAP 收件；未配置时 /email/sync 返回 enabled:false。
    IMAP_HOST: str = "imap.qq.com"
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    IMAP_FOLDER: str = "INBOX"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()