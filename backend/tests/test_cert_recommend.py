"""证书与学习方向推荐：单元测试（清洗/白名单）+ 端点冒烟。"""

import pytest

from app.services.cert_recommend import (
    _mock_cert_recommend,
    _normalize_result,
    _safe_link,
    _strip_json_fences,
    recommend_certs,
)


class TestStripJsonFences:
    def test_plain_json_untouched(self):
        assert _strip_json_fences('{"a": 1}') == '{"a": 1}'

    def test_fenced_json_stripped(self):
        text = "```json\n{\"a\": 1}\n```"
        assert _strip_json_fences(text) == '{"a": 1}'

    def test_fenced_without_language(self):
        text = "```\n{\"a\": 1}\n```"
        assert _strip_json_fences(text) == '{"a": 1}'


class TestSafeLink:
    @pytest.mark.parametrize(
        "url",
        [
            "https://edu.aliyun.com/certification/aca",
            "https://e.huawei.com/cn/talent/",
            "https://leetcode.cn/studyplan/",
            "https://www.ruankao.org.cn",
        ],
    )
    def test_whitelist_domains_pass(self, url):
        assert _safe_link(url) == url

    @pytest.mark.parametrize(
        "url",
        [
            None,
            "",
            "   ",
            "http://edu.aliyun.com/certification",  # 非 https
            "https://evil.example.com/fake-cert",  # 白名单外域名
            "ftp://www.pmi.org/x",
            "not a url",
        ],
    )
    def test_invalid_or_off_whitelist_become_null(self, url):
        assert _safe_link(url) is None

    def test_root_domain_prefix_match(self):
        # 白名单项是路径前缀（如 /certification），域名相同但路径不同 → 放行整域前缀
        assert _safe_link("https://edu.huaweicloud.com/anything") == "https://edu.huaweicloud.com/anything"


class TestNormalizeResult:
    def test_full_pipeline(self):
        data = {
            "gap_analysis": {
                "resume_skills": ["Python", "", "SQL"],
                "jd_requirements": ["云平台"],
                "gaps": ["容器化"],
            },
            "recommendations": [
                {
                    "title": "证书A",
                    "category": "乱写的分类",
                    "level": "不存在的级别",
                    "priority": "2",
                    "link": "https://evil.com/x",
                    "issuer": "X",
                },
                {"title": "证书B", "priority": 1, "link": "https://edu.aliyun.com/x"},
            ],
            "learning_path": ["第一步", "", "第二步"],
        }
        out = _normalize_result(data)
        assert out["gap_analysis"]["resume_skills"] == ["Python", "SQL"]
        assert [r["title"] for r in out["recommendations"]] == ["证书B", "证书A"]  # 按 priority 排序
        assert out["recommendations"][0]["link"] == "https://edu.aliyun.com/x"
        assert out["recommendations"][1]["link"] is None  # 白名单外置 null
        assert out["recommendations"][1]["category"] == "其他"  # 非法分类归为其他
        assert out["recommendations"][1]["level"] == "入门级"  # 非法级别归为入门级
        assert out["learning_path"] == ["第一步", "第二步"]

    def test_clamped_to_six(self):
        data = {
            "recommendations": [
                {"title": f"c{i}", "priority": i} for i in range(10)
            ]
        }
        out = _normalize_result(data)
        assert len(out["recommendations"]) == 6

    def test_empty_and_dirty_input(self):
        out = _normalize_result({"recommendations": ["bad", 123, {"no_title": 1}, None]})
        assert out["recommendations"] == []
        assert out["gap_analysis"]["gaps"] == []
        assert out["learning_path"] == []


class TestMockFallback:
    def test_mock_shape_valid_and_links_whitelisted(self):
        from app.services.cert_recommend import _safe_link

        out = _mock_cert_recommend()
        assert 3 <= len(out["recommendations"]) <= 6
        assert out["learning_path"]
        for r in out["recommendations"]:
            assert r["title"] and r["why"]
            if r["link"]:
                assert _safe_link(r["link"]) == r["link"]
        priorities = [r["priority"] for r in out["recommendations"]]
        assert priorities == sorted(priorities)

    @pytest.mark.asyncio
    async def test_recommend_certs_mock_path(self, monkeypatch):
        import app.services.cert_recommend as mod

        monkeypatch.setattr(mod, "has_valid_api_key", lambda: False)
        out = await recommend_certs({"a": 1}, {"b": 2})
        assert out["recommendations"]


@pytest.mark.asyncio
async def test_recommend_certs_llm_path_normalizes(monkeypatch):
    """LLM 正常路径：_call_with_retry 返回带围栏 JSON → 解析 + 清洗生效。"""
    import app.services.cert_recommend as mod

    class FakeResp:
        class choices:
            class message:
                content = '```json\n{"gap_analysis": {"gaps": ["云"]}, "recommendations": [{"title": "T", "link": "https://x.com"}], "learning_path": ["s"]}\n```'

    async def fake_call(*args, **kwargs):
        return FakeResp()

    monkeypatch.setattr(mod, "has_valid_api_key", lambda: True)
    monkeypatch.setattr(mod, "_call_with_retry", fake_call)
    monkeypatch.setattr(mod, "_get_client", lambda: object())
    monkeypatch.setattr(mod, "_require_content", lambda resp, task: resp.choices.message.content)

    out = await recommend_certs({"r": 1}, {"j": 1})
    assert out["recommendations"][0]["title"] == "T"
    assert out["recommendations"][0]["link"] is None  # 非白名单域名被拦
    assert out["gap_analysis"]["gaps"] == ["云"]


@pytest.mark.asyncio
async def test_recommend_certs_invalid_json_raises(monkeypatch):
    import app.services.cert_recommend as mod

    class FakeResp:
        class choices:
            class message:
                content = "这不是 JSON"

    async def fake_call(*args, **kwargs):
        return FakeResp()

    monkeypatch.setattr(mod, "has_valid_api_key", lambda: True)
    monkeypatch.setattr(mod, "_call_with_retry", fake_call)
    monkeypatch.setattr(mod, "_get_client", lambda: object())
    monkeypatch.setattr(mod, "_require_content", lambda resp, task: resp.choices.message.content)

    with pytest.raises(ValueError, match="AI 返回格式异常"):
        await recommend_certs({"r": 1}, {"j": 1})


class TestEndpointSmoke:
    """ASGI 冒烟：未登录 / 不存在资源 → 4xx（不真正调 LLM）。"""

    @pytest.mark.asyncio
    async def test_unauthorized(self):
        from httpx import ASGITransport, AsyncClient

        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/certs/recommend", json={"resume_id": "x", "job_id": "y"}
            )
            assert resp.status_code in (401, 403)
