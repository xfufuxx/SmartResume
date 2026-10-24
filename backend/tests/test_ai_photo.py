"""AI 职业照服务单元测试（不发起真实上游请求，全部 mock）。

覆盖：dataURL 解析、最终提示词组装、响应提取（camel/snake case）、
错误分类（invalid_key / safety_filtered / generate_failed / 超时）、
每日额度（API 层 _check_and_consume_quota / _release_quota，fake Redis）。
"""
import base64

import httpx
import pytest

from app.api import ai_photo as ai_photo_api
from app.services import ai_photo
from app.services.ai_photo import AiPhotoError


# ── parse_data_url ────────────────────────────────────────────────

def test_parse_data_url_png():
    b64 = base64.b64encode(b"\x89PNG fake").decode()
    mime, data = ai_photo.parse_data_url(f"data:image/png;base64,{b64}")
    assert mime == "image/png"
    assert data == b64


def test_parse_data_url_bare_base64():
    b64 = base64.b64encode(b"jpeg-bytes").decode()
    mime, data = ai_photo.parse_data_url(b64)
    assert mime == "image/jpeg"
    assert data == b64


def test_parse_data_url_rejects_empty():
    with pytest.raises(AiPhotoError) as ei:
        ai_photo.parse_data_url("   ")
    assert ei.value.code == "generate_failed"
    assert ei.value.status == 400


def test_parse_data_url_rejects_invalid_base64():
    with pytest.raises(AiPhotoError) as ei:
        ai_photo.parse_data_url("data:image/png;base64,!!!not-base64!!!")
    assert ei.value.code == "generate_failed"


def test_parse_data_url_rejects_oversize():
    big = base64.b64encode(b"x" * (9 * 1024 * 1024)).decode()
    with pytest.raises(AiPhotoError) as ei:
        ai_photo.parse_data_url(f"data:image/jpeg;base64,{big}")
    assert "过大" in ei.value.message


# ── build_final_prompt ────────────────────────────────────────────

def test_prompt_ratio_appended():
    out = ai_photo.build_final_prompt("BASE", "3:4", None)
    assert out.startswith("BASE")
    assert "aspect ratio: 3:4" in out


def test_prompt_ratio_one_to_one_not_appended():
    out = ai_photo.build_final_prompt("BASE", "1:1", None)
    assert out == "BASE"


def test_prompt_requirements_appended():
    out = ai_photo.build_final_prompt("BASE", "1:1", "  穿深色西装 ")
    assert "Additional requirements: 穿深色西装" in out


def test_prompt_rejects_illegal_ratio():
    with pytest.raises(AiPhotoError):
        ai_photo.build_final_prompt("BASE", "9:16", None)


def test_prompt_rejects_empty():
    with pytest.raises(AiPhotoError):
        ai_photo.build_final_prompt("   ", "1:1", None)


# ── _extract_result ───────────────────────────────────────────────

def test_extract_camel_case():
    data = {
        "candidates": [{
            "content": {"parts": [
                {"text": "done"},
                {"inlineData": {"mimeType": "image/png", "data": "QUJD"}},
            ]},
        }],
    }
    r = ai_photo._extract_result(data)
    assert r.image == "data:image/png;base64,QUJD"
    assert r.text == "done"


def test_extract_snake_case():
    data = {
        "candidates": [{
            "content": {"parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": "QUJD"}},
            ]},
        }],
    }
    r = ai_photo._extract_result(data)
    assert r.image == "data:image/jpeg;base64,QUJD"


def test_extract_safety_blocked():
    data = {"candidates": [{"finishReason": "SAFETY", "content": {"parts": []}}]}
    with pytest.raises(AiPhotoError) as ei:
        ai_photo._extract_result(data)
    assert ei.value.code == "safety_filtered"
    assert ei.value.status == 400


def test_extract_no_image():
    data = {"candidates": [{"content": {"parts": [{"text": "拒绝生成"}]}}]}
    with pytest.raises(AiPhotoError) as ei:
        ai_photo._extract_result(data)
    assert ei.value.code == "generate_failed"
    assert "拒绝生成" in ei.value.message  # 模型文本带回前端便于排查


# ── generate_professional_photo（mock httpx）──────────────────────

class _FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class _FakeStream:
    """模拟 httpx.AsyncClient 的 async with + post。"""

    def __init__(self, response=None, exc=None, recorder=None):
        self._response = response
        self._exc = exc
        self._recorder = recorder

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, *, params=None, json=None, headers=None):
        if self._recorder is not None:
            self._recorder.append({"url": url, "params": params, "json": json, "headers": headers})
        if self._exc:
            raise self._exc
        return self._response


def _patch_client(monkeypatch, response=None, exc=None, recorder=None):
    def _factory(*args, **kwargs):
        return _FakeStream(response=response, exc=exc, recorder=recorder)

    monkeypatch.setattr(ai_photo.httpx, "AsyncClient", _factory)


_OK_PAYLOAD = {
    "candidates": [{"content": {"parts": [
        {"inlineData": {"mimeType": "image/png", "data": "QUJD"}},
    ]}}],
}


@pytest.mark.asyncio
async def test_generate_success(monkeypatch):
    rec: list[dict] = []
    _patch_client(monkeypatch, response=_FakeResponse(200, _OK_PAYLOAD), recorder=rec)
    b64 = base64.b64encode(b"photo").decode()
    result = await ai_photo.generate_professional_photo(
        image=f"data:image/jpeg;base64,{b64}",
        prompt="职业照",
        requirements="西装",
        aspect_ratio="3:4",
        api_key="key-123",
    )
    assert result.image == "data:image/png;base64,QUJD"
    # 请求要素：URL 带模型、params 带 key、parts 含文本+图片、提示词含比例与追加要求
    sent = rec[0]
    assert "gemini" in sent["url"]
    assert sent["params"]["key"] == "key-123"
    parts = sent["json"]["contents"][0]["parts"]
    assert parts[0]["text"].startswith("职业照")
    assert "aspect ratio: 3:4" in parts[0]["text"]
    assert "Additional requirements: 西装" in parts[0]["text"]
    assert parts[1]["inlineData"]["mimeType"] == "image/jpeg"


@pytest.mark.asyncio
async def test_generate_403_maps_invalid_key(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(403, text="bad key"))
    with pytest.raises(AiPhotoError) as ei:
        await ai_photo.generate_professional_photo(
            image="data:image/jpeg;base64,QUJD", prompt="p", api_key="bad",
        )
    assert ei.value.code == "invalid_key"
    assert ei.value.status == 400


@pytest.mark.asyncio
async def test_generate_safety_maps_safety_filtered(monkeypatch):
    payload = {"candidates": [{"finishReason": "SAFETY", "content": {"parts": []}}]}
    _patch_client(monkeypatch, response=_FakeResponse(200, payload))
    with pytest.raises(AiPhotoError) as ei:
        await ai_photo.generate_professional_photo(
            image="data:image/jpeg;base64,QUJD", prompt="p", api_key="k",
        )
    assert ei.value.code == "safety_filtered"


@pytest.mark.asyncio
async def test_generate_timeout_maps_generate_failed(monkeypatch):
    _patch_client(monkeypatch, exc=httpx.TimeoutException("timeout"))
    with pytest.raises(AiPhotoError) as ei:
        await ai_photo.generate_professional_photo(
            image="data:image/jpeg;base64,QUJD", prompt="p", api_key="k",
        )
    assert ei.value.code == "generate_failed"
    assert ei.value.status == 504


@pytest.mark.asyncio
async def test_generate_requires_api_key(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(200, _OK_PAYLOAD))
    with pytest.raises(AiPhotoError) as ei:
        await ai_photo.generate_professional_photo(
            image="data:image/jpeg;base64,QUJD", prompt="p", api_key="  ",
        )
    assert ei.value.code == "invalid_key"


# ── 每日额度（API 层，fake Redis）─────────────────────────────────


class _FakeQuotaRedis:
    """最小 async Redis 替身：仅 incr/expire/get/decr（额度测试专用）。"""

    def __init__(self):
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    async def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def expire(self, key, ttl):
        self.ttls[key] = ttl
        return True

    async def get(self, key):
        val = self.store.get(key)
        # 与 redis.asyncio 同型返回 bytes；int(bytes) 亦可正确解析
        return None if val is None else str(val).encode()

    async def decr(self, key):
        self.store[key] = self.store.get(key, 0) - 1
        return self.store[key]


@pytest.mark.asyncio
async def test_quota_first_consume_sets_ttl(monkeypatch):
    monkeypatch.setattr(ai_photo_api.settings, "AI_PHOTO_DAILY_LIMIT", 20)
    redis = _FakeQuotaRedis()
    ok, count = await ai_photo_api._check_and_consume_quota(redis, "u1")
    assert ok is True and count == 1
    # Key 按 UTC 自然日分桶（aiphoto:count:<uid>:<YYYYMMDD>），首次即设兜底 TTL
    keys = list(redis.store)
    assert len(keys) == 1
    assert keys[0].startswith("aiphoto:count:u1:")
    assert len(keys[0].rsplit(":", 1)[1]) == 8
    assert redis.ttls[keys[0]] == 86400


@pytest.mark.asyncio
async def test_quota_blocks_above_limit(monkeypatch):
    monkeypatch.setattr(ai_photo_api.settings, "AI_PHOTO_DAILY_LIMIT", 2)
    redis = _FakeQuotaRedis()
    results = [await ai_photo_api._check_and_consume_quota(redis, "u1") for _ in range(4)]
    # 计数照增（第 3、4 次仍占位），但放行标志翻负——防刷上游额度
    assert results == [(True, 1), (True, 2), (False, 3), (False, 4)]


@pytest.mark.asyncio
async def test_quota_release_decrements(monkeypatch):
    monkeypatch.setattr(ai_photo_api.settings, "AI_PHOTO_DAILY_LIMIT", 2)
    redis = _FakeQuotaRedis()
    for _ in range(2):
        await ai_photo_api._check_and_consume_quota(redis, "u1")
    await ai_photo_api._release_quota(redis, "u1")
    key = next(iter(redis.store))
    assert redis.store[key] == 1  # 退还后名额回到限内，用户可重试
    ok, count = await ai_photo_api._check_and_consume_quota(redis, "u1")
    assert ok is True and count == 2


@pytest.mark.asyncio
async def test_quota_release_on_zero_is_noop():
    redis = _FakeQuotaRedis()
    await ai_photo_api._release_quota(redis, "never-used")
    assert redis.store == {}  # 零值不递减，不产生负数 key


@pytest.mark.asyncio
async def test_quota_release_swallows_redis_error():
    class _BrokenRedis:
        async def get(self, key):
            raise RuntimeError("redis down")

        async def decr(self, key):  # pragma: no cover - get 失败后不应到达
            raise AssertionError("decr 不应在 get 失败后执行")

    # 退还失败不得影响主流程（接口仍按上游错误正常返回）
    await ai_photo_api._release_quota(_BrokenRedis(), "u1")
