"""QQ 登录（QQ 互联 OAuth2.0 · 网站应用）服务端链路。

完整流程：
  1. 前端点「QQ 登录」→ GET /api/auth/qq/authorize → 后端生成一次性 state
     （Redis 10 分钟 TTL 防 CSRF）并返回 QQ 授权页 URL；
  2. 用户在 QQ 页确认授权 → QQ 带 code+state 回调 /api/auth/qq/callback；
  3. 后端校验并消费 state → 用 code 换 access_token → 取 openid（用户唯一身份）
     → 取昵称/头像 → 按 openid 找/建用户 → 签发本站 JWT（access+refresh）；
  4. 令牌经 URL **hash 片段**跳回前端 /login/qq-callback（hash 不进服务器
     日志与 Referer，比 query 参数安全）。

安全设计：
- appid/appkey 只存在于后端配置，浏览器永远接触不到；
- state 一次性消费，重复回调直接拒绝；
- QQ 侧各接口均有显式错误处理，失败时带中文原因跳回前端，不静默。

注意（QQ 互联的两个历史坑）：
- 换 token 的接口返回的是 **URL 编码的纯文本**（access_token=...&expires_in=...），
  不是 JSON，直接 .json() 会解析失败；
- 取 openid 的接口返回的是 **JSONP**（callback( {...} );），且开头可能带 UTF-8 BOM，
  必须先剥掉封装再 json.loads。
"""
import json
import logging
import re
import secrets
from urllib.parse import parse_qs, quote, urlencode

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

QQ_AUTHORIZE_URL = "https://graph.qq.com/oauth2.0/authorize"
QQ_TOKEN_URL = "https://graph.qq.com/oauth2.0/token"
QQ_OPENID_URL = "https://graph.qq.com/oauth2.0/me"
QQ_USERINFO_URL = "https://graph.qq.com/user/get_user_info"

# state 在 Redis 中的 key 前缀与 TTL（秒）
STATE_KEY_PREFIX = "qqoauth:state:"
STATE_TTL_SECONDS = 600

# openid 为 32 位十六进制；此处宽松匹配，取不到时由调用方报错
_JSONP_RE = re.compile(r"^[^(]*\((.*)\)[^)]*$", re.DOTALL)


def qq_enabled() -> bool:
    """appid/appkey 均配置才算启用（任一缺失前端不展示入口）。"""
    return bool(settings.QQ_APP_ID and settings.QQ_APP_KEY)


def make_state() -> str:
    """生成一次性 state（防 CSRF）。"""
    return secrets.token_urlsafe(24)


async def save_state(redis, state: str) -> None:
    await redis.set(f"{STATE_KEY_PREFIX}{state}", "1", ex=STATE_TTL_SECONDS)


async def verify_and_consume_state(redis, state: str) -> bool:
    """校验并消费 state：一次性，用过后即删。

    本地 Redis 3.0 没有 GETDEL（6.2+ 才有），这里用 GET+DEL 两步，
    CSRF state 的并发竞争窗口可忽略。
    """
    key = f"{STATE_KEY_PREFIX}{state}"
    val = await redis.get(key)
    if not val:
        return False
    await redis.delete(key)
    return True


def build_authorize_url(state: str) -> str:
    """构造 QQ 授权页 URL（redirect_uri 必须与 QQ 互联后台配置逐字一致）。"""
    params = {
        "response_type": "code",
        "client_id": settings.QQ_APP_ID,
        "redirect_uri": settings.QQ_REDIRECT_URI,
        "state": state,
    }
    return f"{QQ_AUTHORIZE_URL}?{urlencode(params)}"


def synthetic_email(openid: str) -> str:
    """为纯 QQ 用户生成占位邮箱（users.email 非空唯一）。

    用 .invalid 保留域（RFC 6761），不可投递、不可用于找回密码，
    从形态上避免与真实邮箱混淆。
    """
    return f"qq_{openid}@qq.invalid"


async def fetch_access_token(code: str) -> str:
    """用授权码换 access_token（返回体是 URL 编码纯文本，非 JSON）。"""
    params = {
        "grant_type": "authorization_code",
        "client_id": settings.QQ_APP_ID,
        "client_secret": settings.QQ_APP_KEY,
        "code": code,
        "redirect_uri": settings.QQ_REDIRECT_URI,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(QQ_TOKEN_URL, params=params)
    if resp.status_code != 200:
        raise ValueError(f"QQ 换 token 失败 HTTP {resp.status_code}")
    parsed = parse_qs(resp.text.strip())
    token = parsed.get("access_token", [None])[0]
    if not token:
        # QQ 侧失败时同样返回纯文本，但带 error/error_description
        err = parsed.get("error_description", parsed.get("error", ["未知错误"]))[0]
        raise ValueError(f"QQ 换 token 失败: {err}")
    return token


async def fetch_openid(access_token: str) -> str:
    """取用户 openid（返回体是 JSONP：callback( {...} );，可能带 BOM）。"""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(QQ_OPENID_URL, params={"access_token": access_token})
    if resp.status_code != 200:
        raise ValueError(f"QQ 取 openid 失败 HTTP {resp.status_code}")
    text = resp.text.strip().lstrip("\ufeff")
    m = _JSONP_RE.match(text)
    if not m:
        raise ValueError("QQ 取 openid 返回格式异常")
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise ValueError(f"QQ 取 openid 解析失败: {e}") from e
    openid = data.get("openid")
    if not openid:
        raise ValueError(f"QQ 取 openid 失败: {data.get('error_description') or data}")
    return openid


async def fetch_user_info(access_token: str, openid: str) -> dict:
    """取 QQ 昵称/头像（ret=0 才算成功）。"""
    params = {
        "access_token": access_token,
        "oauth_consumer_key": settings.QQ_APP_ID,
        "openid": openid,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(QQ_USERINFO_URL, params=params)
    if resp.status_code != 200:
        raise ValueError(f"QQ 取用户信息失败 HTTP {resp.status_code}")
    data = resp.json()
    if data.get("ret") != 0:
        raise ValueError(f"QQ 取用户信息失败: {data.get('msg') or data}")
    return data


def error_fragment(message: str) -> str:
    """前端回调页用 hash 片段承载的错误信息（quote 保证中文安全）。"""
    return f"#error={quote(message)}"
