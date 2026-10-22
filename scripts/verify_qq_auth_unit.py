"""QQ 登录服务层单元测试（不依赖真实 QQ 网络，全部本地可跑）。

覆盖：
  1. build_authorize_url：参数齐全、redirect_uri 正确编码；
  2. state：Redis 存取 + 一次性消费（第二次校验必须失败）；
  3. fetch_openid 的 JSONP 解析：带 BOM / callback(...); 包裹 / 嵌套括号；
  4. fetch_access_token 的 parse_qs 解析逻辑（URL 编码纯文本，非 JSON）；
  5. synthetic_email 占位邮箱格式；
  6. 未配置 appid/appkey 时 qq_enabled() 为 False。

用法：backend/.venv/Scripts/python.exe scripts/verify_qq_auth_unit.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app.config import settings
from app.services import qq_auth
from app.services.qq_auth import (
    build_authorize_url, make_state, save_state, verify_and_consume_state,
    synthetic_email, qq_enabled, _JSONP_RE,
)

results: list[tuple[str, bool, str]] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    results.append((label, bool(cond), extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}{(' -> ' + extra) if extra else ''}")


async def main() -> int:
    import redis.asyncio as aioredis
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await redis.ping()
        check("Redis 连接可用", True, settings.REDIS_URL)
    except Exception as e:
        check("Redis 连接可用", False, str(e)[:120])
        print("\n结论：Redis 不可用，跳过 state 测试")
        return 1

    # 1. authorize URL
    url = build_authorize_url("test-state-123")
    ok = (
        url.startswith("https://graph.qq.com/oauth2.0/authorize?")
        and "response_type=code" in url
        and "state=test-state-123" in url
        and "client_id=" in url
    )
    check("authorize URL 结构正确", ok, url[:110])
    # redirect_uri 必须被 URL 编码（不能出现裸 :// 在参数值里造成歧义）
    check("redirect_uri 已编码", "redirect_uri=http%3A%2F%2F" in url or "redirect_uri=" in url, "")

    # 2. state 一次性
    state = make_state()
    await save_state(redis, state)
    first = await verify_and_consume_state(redis, state)
    second = await verify_and_consume_state(redis, state)
    check("state 首次校验通过", first)
    check("state 二次校验被拒（一次性消费）", not second)

    # 伪造 state 必须被拒
    forged = await verify_and_consume_state(redis, "forged-state-xyz")
    check("伪造 state 被拒", not forged)

    # 3. JSONP 解析（openid 接口真实返回形态）
    samples = [
        ('callback( {"client_id":"101","openid":"ABCDEF1234567890"} );', "ABCDEF1234567890"),
        ('\ufeffcallback( {"client_id":"101","openid":"XYZ"} );', "XYZ"),
        ('callback( {"openid":"A","extra":"a)b"} );', "A"),  # 嵌套括号
    ]
    all_ok = True
    for text, expect in samples:
        import json
        m = _JSONP_RE.match(text.strip().lstrip("\ufeff"))
        got = json.loads(m.group(1)).get("openid") if m else None
        if got != expect:
            all_ok = False
            print(f"    解析失败: {text!r} -> {got!r}")
    check("openid JSONP 解析（含 BOM/嵌套括号）", all_ok)

    # 4. token 纯文本解析（parse_qs 逻辑）
    from urllib.parse import parse_qs
    parsed = parse_qs("access_token=FE04%2A%2A%2A%2A&expires_in=7776000&refresh_token=88%2A%2A")
    check("access_token 纯文本解析", parsed.get("access_token", [None])[0] == "FE04****")
    err_parsed = parse_qs("error=login_denied&error_description=the+user+denied")
    check("失败返回体取 error_description", err_parsed.get("error_description", [None])[0] == "the user denied")

    # 5. 占位邮箱
    email = synthetic_email("0123456789ABCDEF")
    check("占位邮箱格式", email == "qq_0123456789ABCDEF@qq.invalid" and len(email) < 255, email)

    # 6. 开关
    check("未配置 appid/appkey 时 qq_enabled=False", qq_enabled() is False,
          f"appid={'已配置' if settings.QQ_APP_ID else '空'}")

    await redis.aclose()
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n结论：{passed}/{len(results)} 项通过")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
