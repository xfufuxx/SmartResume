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
