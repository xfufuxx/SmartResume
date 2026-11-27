"""AI 岗位检索单元测试（纯函数，无 IO / 无网络）。

覆盖：
- 简历画像：年限解析、最高学历、目标岗位扩展、成果摘取、城市兜底
- 五维加权：权重合成、缺维度归一、边界裁剪
- 清洗：脏字段兜底、链接校验、同岗位去重排序、空结果显式报错
- 通道选择：auto/ai/tavily/serper 的优先级与无 Key 回退
- JSON 解析：fenced / 前后闲聊 / 非法内容
"""
import pytest

from app.config import settings
from app.services import job_discovery as jd


# ── 画像提取 ─────────────────────────────────────────────────────
@pytest.mark.parametrize("raw,expected", [
    ("2021.03", (2021, 3)),
    ("2021-3", (2021, 3)),
    ("2021年7月", (2021, 7)),
    ("2021/11", (2021, 11)),
    ("2021", (2021, 1)),
    ("2021.13", (2021, 1)),   # 非法月份收敛到 1 月，不抛错
    ("", None),
    (None, None),
    ("至今", None),
    ("Present", None),
])
def test_parse_year_month(raw, expected):
    assert jd.parse_year_month(raw) == expected


def test_compute_years_uses_earliest_start_and_present():
    from datetime import datetime, timezone, timedelta
    now = datetime(2026, 6, 15, tzinfo=timezone(timedelta(hours=8)))
    exp = [
        {"start": "2023.06", "end": "至今"},
        {"start": "2021.06", "end": "2023.05"},
    ]
    assert jd.compute_years_experience(exp, now=now) == 5.0


def test_compute_years_without_dates_is_zero():
    assert jd.compute_years_experience([{"company": "A"}]) == 0.0
    assert jd.compute_years_experience([]) == 0.0


def test_highest_education_picks_rank_not_order():
    edu = [
        {"degree": "本科", "school": "A 大学", "major": "CS"},
        {"degree": "硕士", "school": "B 大学", "major": "SE"},
        {"degree": "大专", "school": "C 学院", "major": "网络"},
    ]
    assert jd.highest_education(edu)["degree"] == "硕士"
    assert jd.highest_education(edu)["school"] == "B 大学"
    assert jd.highest_education([])["degree"] == ""


def _resume():
    return {
        "personal_info": {"name": "张三", "email": "z@example.com", "city": "杭州"},
        "summary": "6 年后端开发，熟悉高并发",
        "skills": ["Python", "python", "MySQL", "Redis", ""],
        "experience": [{
            "company": "某公司", "title": "高级后端工程师", "start": "2021.03", "end": "至今",
            "points": ["QPS 提升 3 倍", "负责日常需求"],
        }],
        "projects": [{"name": "订单系统", "role": "负责人", "points": ["支撑 1200 万单/日"]}],
        "education": [{"degree": "本科", "school": "X 大学", "major": "计算机"}],
        "certificates": ["PMP"],
    }


def test_build_profile_extracts_fields_and_dedupes_skills():
    p = jd.build_candidate_profile(_resume(), city="上海", direction="后端架构师", salary="40-60K")
    assert p["target_titles"][0] == "后端架构师"
    assert "高级后端工程师" in p["target_titles"]
    assert "后端工程师" in p["target_titles"]  # 去掉「高级」的基本名
    assert p["skills"] == ["Python", "MySQL", "Redis"]  # 去重 + 去空
    assert p["education"]["degree"] == "本科"
    assert p["cities"][0] == "上海"
    assert p["salary_expectation"] == "40-60K"
    assert p["years_experience"] > 0


def test_build_profile_keeps_only_quantified_achievements():
    p = jd.build_candidate_profile(_resume())
    assert "QPS 提升 3 倍" in p["achievements"]
    assert "支撑 1200 万单/日" in p["achievements"]
    assert "负责日常需求" not in p["achievements"]


def test_build_profile_falls_back_to_resume_city():
    p = jd.build_candidate_profile(_resume())
    assert p["cities"] == ["杭州"]


def test_profile_payload_excludes_pii():
    payload = jd.profile_prompt_payload(jd.build_candidate_profile(_resume()))
    assert "张三" not in str(payload)
    assert "z@example.com" not in str(payload)
    assert payload["核心技能"]


# ── 评分 ─────────────────────────────────────────────────────────
def test_overall_score_uses_fixed_weights():
    # 技能 100×0.30 + 经验 80×0.25 + 学历 60×0.10 + 地点 90×0.15 + 薪资 70×0.20 = 83.5 → 84
    dims = {
        "skills": {"score": 100}, "experience": {"score": 80}, "education": {"score": 60},
        "location": {"score": 90}, "salary": {"score": 70},
    }
    assert jd.overall_score(dims) == 84


def test_overall_score_renormalizes_when_dimension_missing():
    dims = {"skills": {"score": 90}, "experience": {"score": 70}}
    # (90*0.30 + 70*0.25) / 0.55 = 80.9 → 81
    assert jd.overall_score(dims) == 81
    assert jd.overall_score({}) == 0


def test_clamp_score_handles_garbage():
    assert jd._clamp_score("88") == 88
    assert jd._clamp_score(120) == 100
    assert jd._clamp_score(-3) == 0
    assert jd._clamp_score(None, default=42) == 42
    assert jd._clamp_score("abc", default=55) == 55


# ── 清洗 ─────────────────────────────────────────────────────────
def test_sanitize_job_rejects_missing_title():
    assert jd.sanitize_job({"company": "某公司"}, 0) is None
    assert jd.sanitize_job("not-a-dict", 0) is None


def test_sanitize_job_accepts_flat_dimension_scores():
    job = jd.sanitize_job({
        "title": "后端工程师",
        "company": "某公司",
        "dimensions": {"skills": 90, "experience": 80, "education": 70, "location": 60, "salary": 50},
    }, 0)
    assert job["dimensions"]["skills"] == {"score": 90, "reason": ""}
    assert job["match_rate"] == jd.overall_score(job["dimensions"])


def test_sanitize_job_drops_non_http_url_and_defaults():
    job = jd.sanitize_job({"title": "岗位", "url": "javascript:alert(1)"}, 0)
    assert job["url"] is None
    assert job["salary"] == "面议"
    assert job["company"] == "某公司"
    assert job["job_type"] == "全职"


def test_sanitize_job_keeps_http_url_and_truncates():
    job = jd.sanitize_job({
        "title": "岗位", "url": "https://example.com/job/1",
        "summary": "x" * 500, "jd_text": "y" * 3000,
    }, 0)
    assert job["url"] == "https://example.com/job/1"
    assert len(job["summary"]) <= 300
    assert len(job["jd_text"]) <= 1500


def test_sanitize_result_dedupes_and_sorts():
    raw = {"jobs": [
        {"title": "前端工程师", "company": "某公司", "dimensions": dict.fromkeys(
            ("skills", "experience", "education", "location", "salary"), 60)},
        {"title": "前端工程师", "company": "某公司", "dimensions": dict.fromkeys(
            ("skills", "experience", "education", "location", "salary"), 95)},
        {"title": "后端工程师", "company": "某公司", "dimensions": dict.fromkeys(
            ("skills", "experience", "education", "location", "salary"), 80)},
    ]}
    out = jd.sanitize_result(raw, {"target_titles": []}, mode="ai", job_count=6)
    assert out["total"] == 2
    assert out["items"][0]["title"] == "前端工程师"
    assert out["items"][0]["match_rate"] == 95
    assert out["items"][1]["title"] == "后端工程师"
    assert out["best_rate"] == 95
    assert out["strong_count"] == 2  # 95 与 80 均 ≥80


def test_sanitize_result_raises_when_model_returns_nothing():
    with pytest.raises(ValueError):
        jd.sanitize_result({"jobs": []}, {}, mode="ai")


def test_sanitize_result_mode_notice_differs():
    raw = {"jobs": [{"title": "岗位", "dimensions": {"skills": 70}}]}
    ai = jd.sanitize_result(raw, {}, mode="ai")
    web = jd.sanitize_result(raw, {}, mode="web")
    assert ai["mode_label"] == "AI 岗位画像"
    assert web["mode_label"] == "公开网络检索"
    assert "匿名化" in ai["notice"]
    assert "链接原样保留" in web["notice"]
    assert ai["items"][0]["source_type"] == "ai"
    assert web["items"][0]["source_type"] == "web"


def test_sanitize_result_caps_item_count():
    raw = {"jobs": [{"title": f"岗位{i}", "dimensions": {"skills": 70}} for i in range(20)]}
    out = jd.sanitize_result(raw, {}, mode="ai", job_count=5)
    assert out["total"] == 5


# ── 通道选择 ─────────────────────────────────────────────────────
def test_provider_auto_without_keys_is_ai(monkeypatch):
    monkeypatch.setattr(settings, "JOB_SEARCH_PROVIDER", "auto")
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    monkeypatch.setattr(settings, "SERPER_API_KEY", "")
    assert jd.resolve_search_provider() == "ai"


@pytest.mark.parametrize("pref,key_name,expected", [
    ("auto", "TAVILY_API_KEY", "tavily"),
    ("auto", "SERPER_API_KEY", "serper"),
    ("tavily", "TAVILY_API_KEY", "tavily"),
    ("serper", "SERPER_API_KEY", "serper"),
    ("ai", "TAVILY_API_KEY", "ai"),
])
def test_provider_selection(monkeypatch, pref, key_name, expected):
    monkeypatch.setattr(settings, "JOB_SEARCH_PROVIDER", pref)
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "t" if key_name == "TAVILY_API_KEY" else "")
    monkeypatch.setattr(settings, "SERPER_API_KEY", "s" if key_name == "SERPER_API_KEY" else "")
    assert jd.resolve_search_provider() == expected


def test_provider_explicit_vendor_without_key_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "JOB_SEARCH_PROVIDER", "serper")
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    monkeypatch.setattr(settings, "SERPER_API_KEY", "")
    assert jd.resolve_search_provider() == "ai"


def test_build_search_query_contains_city_title_and_skill():
    profile = {"cities": ["上海"], "target_titles": ["后端工程师"], "skills": ["Python", "Redis"]}
    q = jd.build_search_query(profile)
    assert q.startswith("上海 后端工程师 招聘")
    assert "Python" in q


# ── JSON 解析 ────────────────────────────────────────────────────
def test_loads_json_plain():
    assert jd._loads_json('{"a": 1}') == {"a": 1}


def test_loads_json_fenced():
    assert jd._loads_json('```json\n{"a": 2}\n```') == {"a": 2}


def test_loads_json_with_chatter():
    assert jd._loads_json('好的，结果如下：{"a": 3} 希望有帮助') == {"a": 3}


def test_loads_json_invalid_raises():
    with pytest.raises(ValueError):
        jd._loads_json("完全不是 JSON")
