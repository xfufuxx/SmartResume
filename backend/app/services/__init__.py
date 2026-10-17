from app.config import settings


_PLACEHOLDER_KEYS = {
    "sk-your-openai-api-key",
    "sk-your-llm-api-key-here",
    "sk-your-qwen-api-key",
    "your-api-key",
    "change-me",
    "",
}

def has_valid_api_key() -> bool:
    key = settings.LLM_API_KEY
    if not key:
        return False
    if key.strip().lower() in _PLACEHOLDER_KEYS:
        return False
    if key.startswith("sk-your"):
        return False
    return True


def ensure_mock_allowed(feature: str = "AI 功能") -> None:
    """生产环境下禁止静默返回 Mock 结果（用户会误以为完成了真实 AI 处理）。

    development 环境保持原有 Mock 兜底便于本地开发；production 环境下
    LLM 未配置或鉴权失败时显式抛错，由上层接口返回明确提示，允许用户重试。
    """
    if getattr(settings, "APP_ENV", "development") == "production":
        raise ValueError(
            f"AI 服务暂时不可用：未配置有效的 LLM API Key，本次{feature}未产生真实结果，"
            "请检查 backend/.env 中的 LLM_API_KEY 后重试。"
        )
