from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Smart Resume API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    # 运行环境：development（默认，LLM 未配置时静默 Mock 兜底，方便本地开发）
    # / production（LLM 未配置或鉴权失败时不再返回 Mock，而是显式报错提示重试，
    #   避免用户误以为已完成真实 AI 处理）
    APP_ENV: str = "development"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:root@localhost:5432/smart_resume"
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── 密钥配置（职责分离，见《项目全面审查与优化建议》问题 11）────────────
    # 三个用途各自独立配置、独立轮换，杜绝「一钥三用」：
    #   JWT_SECRET            JWT access/refresh 签名（泄露面：token 日志、前端可见）
    #   FIELD_ENCRYPTION_KEY  字段级 AES-256-GCM 加密（泄露面：数据库、PII）
    #   FILE_URL_SECRET       文件签名 URL 的 HMAC 密钥（泄露面：URL、代理日志）
    # APP_ENV=production 时任一为默认值/缺失 → 启动即失败（fail-fast，ECS 部署立刻暴露）。
    JWT_SECRET: str = "change-me-in-production"
    FIELD_ENCRYPTION_KEY: str = ""
    # 轮换窗口期的旧密钥（逗号分隔，仅用于解密历史密文，不参与新加密）
    FIELD_ENCRYPTION_PREVIOUS: str = ""
    FILE_URL_SECRET: str = ""
    # 仅用于解密最早的 v1 AES-CBC 历史密文（旧 SECRET_KEY 派生）；不参与任何新加密。
    # 历史数据全部重加密为 v2 后即可删除本配置。
    LEGACY_CBC_KEY: Optional[str] = None

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
    # 计费守卫（详见 app/core/llm_policy.py）：
    # LLM_ALLOW_PAID=false（默认）时，命中免费额度已过期/不覆盖的模型直接拒绝调用，绝不发请求；
    # LLM_AUTO_FALLBACK=true 时，付费/过期模型自动降级到仍在免费额度内的替补模型；
    # LLM_ENABLE_CALL_LOG=true 时，每次调用写 ai_model_call_logs（token/耗时/成败/费用）。
    LLM_ALLOW_PAID: bool = False
    LLM_AUTO_FALLBACK: bool = True
    LLM_ENABLE_CALL_LOG: bool = True

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
    # 发件人显示名（收件方邮件列表里显示的名字，隐藏真实邮箱账号前缀）
    SMTP_FROM_NAME: str = "智能简历"

    # ── 真实投递（阶段1：邮件直投）──
    DELIVERY_ENABLED: bool = True          # 总开关（关闭时投递一律走 manual 记录模式）
    DELIVERY_DAILY_LIMIT: int = 20         # 每用户每日真实投递上限（反骚扰/反滥用）
    DELIVERY_FROM_NAME: str = "智能简历求职助手"  # 邮件里的发件人显示名

    # ── AI 职业照（图像编辑模型，参考 JadeAI linkedin-photo）─────────────
    # Key 由用户前端提供（localStorage），随请求上传、服务端不落库；
    # 这里只配默认模型与每用户每日生成上限（Redis 自然日分桶，防刷）。
    AI_PHOTO_MODEL: str = "gemini-3.1-flash-image-preview"  # Nano Banana 图像编辑
    AI_PHOTO_DAILY_LIMIT: int = 20         # 每用户每日生成上限
    POLISH_DAILY_LIMIT: int = 30           # 每用户每日 AI 对话润色次数上限

    # ── QQ 登录（QQ 互联 OAuth2.0，网站应用）────────────────────────────
    # 申请入口：https://connect.qq.com  → 创建「网站应用」→ 审核通过后拿到
    # APP ID / APP Key，并把「网站回调地址」填成 QQ_REDIRECT_URI。
    # 两个 Key 均留空时，后端 /api/auth/qq/authorize 返回 503，前端不展示入口。
    QQ_APP_ID: str = ""
    QQ_APP_KEY: str = ""
    # 必须与 QQ 互联后台「网站回调地址」完全一致（含协议、域名、端口、路径）
    QQ_REDIRECT_URI: str = "http://localhost:8000/api/auth/qq/callback"
    # 前端站点地址：QQ 授权完成后后端带令牌跳回的前端页面
    FRONTEND_URL: str = "http://localhost:3000"

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


def _validate_production_secrets(s: Settings) -> None:
    """生产环境密钥 fail-fast：任一用途仍为默认值/缺失 → 拒绝启动。

    开发环境（APP_ENV != production）宽松处理：
      - JWT_SECRET 留默认值（本地 token 无价值）；
      - FIELD_ENCRYPTION_KEY 留空 → crypto 模块进程内生成随机密钥（重启即失效，仅开发可接受）；
      - FILE_URL_SECRET 留空 → 由 JWT_SECRET 派生。
    """
    if s.APP_ENV.strip().lower() != "production":
        return
    problems: list[str] = []
    if not s.JWT_SECRET or s.JWT_SECRET == "change-me-in-production":
        problems.append("JWT_SECRET 仍为默认值")
    if not s.FIELD_ENCRYPTION_KEY:
        problems.append("FIELD_ENCRYPTION_KEY 未配置")
    if not s.FILE_URL_SECRET:
        problems.append("FILE_URL_SECRET 未配置")
    if problems:
        raise RuntimeError(
            "生产环境密钥配置不合法（app/config.py 职责分离校验）："
            + "；".join(problems)
            + "。请在 .env 中分别为 JWT 签名 / 字段加密 / 文件签名配置独立密钥。"
        )


settings = Settings()
_validate_production_secrets(settings)