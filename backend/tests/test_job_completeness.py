"""岗位上传完整性校验测试：合并/校验单元 + parse-images 端点冒烟（全部 mock，不依赖 LLM/存储）。"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.job_completeness import (
    JOB_REQUIRED_MODULES,
    MODULE_LABELS,
    check_completeness,
    merge_parsed_jobs,
    module_filled,
)


def _full_job(**overrides) -> dict:
    base = {
        "title": "高级 Python 后端工程师",
        "company": "某科技公司",
        "salary_range": "30K-50K",
        "location": "北京",
        "must_have": {
            "skills": ["Python", "FastAPI"],
            "experience": "3-5年",
            "education": "本科及以上",
        },
        "nice_to_have": {"skills": ["Kubernetes"], "qualifications": ["高并发经验"]},
        "responsibilities": ["负责后端核心系统设计与开发", "参与架构优化"],
        "soft_skills": ["沟通能力"],
        "industry": "互联网",
        "original_text": "完整 JD 文本",
    }
    base.update(overrides)
    return base


# ── 完整性校验 ──────────────────────────────────────────────

class TestCheckCompleteness:
    def test_full_job_passes(self):
        report = check_completeness(_full_job())
        assert report["passed"] is True
        assert report["missing_modules"] == []
        assert report["filled_count"] == report["total"] == len(JOB_REQUIRED_MODULES)

    def test_missing_modules_listed_in_chinese(self):
        job = _full_job()
        del job["salary_range"]
        job["location"] = ""
        report = check_completeness(job)
        assert report["passed"] is False
        assert report["missing_modules"] == ["薪资范围", "工作地点"]
        assert "职位名称" in report["recognized_modules"]

    def test_requirements_via_skills(self):
        job = {"title": "x", "company": "y", "salary_range": "1", "location": "z",
               "responsibilities": ["a"], "must_have": {"skills": ["Python"]}}
        assert check_completeness(job)["passed"] is True
        assert module_filled(job, "requirements") is True

    def test_requirements_via_experience_or_education(self):
        job = {"must_have": {"experience": "3年"}}
        assert module_filled(job, "requirements") is True
        job2 = {"must_have": {"education": "本科"}}
        assert module_filled(job2, "requirements") is True
        assert module_filled({"must_have": {}}, "requirements") is False

    def test_empty_and_malformed_values_count_as_missing(self):
        job = _full_job(responsibilities=[], must_have={"skills": []}, company=None)
        report = check_completeness(job)
        assert set(report["missing_modules"]) == {"公司名称", "岗位职责", "任职要求"}

    def test_empty_dict_all_missing(self):
        report = check_completeness({})
        assert report["passed"] is False
        assert report["filled_count"] == 0
        assert len(report["missing_modules"]) == len(JOB_REQUIRED_MODULES)


# ── 多图信息合并 ────────────────────────────────────────────

class TestMergeParsedJobs:
    def test_scalar_fields_take_first_nonempty(self):
        parts = [
            {"title": "", "company": "A 公司", "salary_range": "", "location": "上海"},
            {"title": "后端工程师", "company": "", "salary_range": "20K-30K", "location": ""},
            {"title": "", "salary_range": "", "location": ""},
        ]
        merged = merge_parsed_jobs(parts)
        assert merged["title"] == "后端工程师"
        assert merged["company"] == "A 公司"
        assert merged["salary_range"] == "20K-30K"
        assert merged["location"] == "上海"

    def test_list_fields_union_dedupe_case_insensitive(self):
        parts = [
            {"responsibilities": ["写代码", "Review 代码"], "must_have": {"skills": ["Python"]}},
            {"responsibilities": ["写代码", "部署上线"], "must_have": {"skills": ["python", "Redis"]}},
        ]
        merged = merge_parsed_jobs(parts)
        assert merged["responsibilities"] == ["写代码", "Review 代码", "部署上线"]
        assert merged["must_have"]["skills"] == ["Python", "Redis"]

    def test_scalars_and_nice_to_have_merge(self):
        parts = [
            {"must_have": {"experience": "3年", "education": ""}, "nice_to_have": {"skills": ["K8s"]}},
            {"must_have": {"experience": "", "education": "本科"}, "nice_to_have": {"qualifications": ["开源"]}},
        ]
        merged = merge_parsed_jobs(parts)
        assert merged["must_have"]["experience"] == "3年"
        assert merged["must_have"]["education"] == "本科"
        assert merged["nice_to_have"]["skills"] == ["K8s"]
        assert merged["nice_to_have"]["qualifications"] == ["开源"]

    def test_original_text_joined_with_separator(self):
        parts = [
            {"original_text": "第一段 JD", "title": "A"},
            {"original_text": "  第二段 JD  ", "title": "A"},
        ]
        merged = merge_parsed_jobs(parts)
        assert "第一段 JD" in merged["original_text"]
        assert "第二段 JD" in merged["original_text"]
        assert "─────" in merged["original_text"]

    def test_extra_fields_passthrough(self):
        parts = [{"title": "A", "custom_field": "扩展值"}, {"title": "A", "custom_field": "扩展值", "other": "x"}]
        merged = merge_parsed_jobs(parts)
        assert merged.get("custom_field") == "扩展值"

    def test_malformed_sub_dicts_tolerated(self):
        merged = merge_parsed_jobs([
            {"must_have": "不是字典", "responsibilities": None, "title": "A"},
            {"must_have": {"skills": ["Go"]}, "nice_to_have": 42},
        ])
        assert merged["title"] == "A"
        assert merged["must_have"]["skills"] == ["Go"]

    def test_empty_parts(self):
        assert merge_parsed_jobs([]) == {}

    def test_merged_multi_image_result_passes_check(self):
        """两张部分截图合并后应能补全信息并通过校验"""
        p1 = {"title": "数据分析师", "company": "B 公司", "responsibilities": ["数据分析"], "salary_range": ""}
        p2 = {"salary_range": "15K-25K", "location": "杭州", "must_have": {"skills": ["SQL"]}, "responsibilities": ["报表"]}
        merged = merge_parsed_jobs([p1, p2])
        report = check_completeness(merged)
        assert report["passed"] is True
        assert merged["title"] == "数据分析师" and merged["salary_range"] == "15K-25K"


# ── parse-images 端点冒烟（mock 解析/存储/校验） ──────────────

@pytest.fixture()
def job_client(monkeypatch):
    """构建仅挂 jobs 路由的测试应用，覆盖鉴权并 mock 外部副作用"""
    from app.api import jobs as jobs_module
    from app.core.deps import get_current_user

    fake_user = type("U", (), {"id": "u-test-1"})()

    uploaded, deleted = [], []

    async def fake_upload(content: bytes, key: str) -> str:
        uploaded.append(key)
        return f"http://local/{key}"

    async def fake_delete(url: str):
        deleted.append(url)

    monkeypatch.setattr(jobs_module.storage, "upload_bytes", fake_upload)
    monkeypatch.setattr(jobs_module.storage, "delete", fake_delete)
    monkeypatch.setattr(jobs_module, "validate_file_magic", lambda c, e: None)

    app = FastAPI()
    app.include_router(jobs_module.router)
    app.dependency_overrides[get_current_user] = lambda: fake_user
    client = TestClient(app)
    yield client, jobs_module, uploaded, deleted


def _png(name: str) -> tuple:
    return ("files", (name, b"fake-png-bytes", "image/png"))


class TestParseImagesEndpoint:
    def test_complete_merged_upload_passes(self, job_client, monkeypatch):
        client, jobs_module, uploaded, deleted = job_client

        async def fake_parse(content, filename, use_ocr_fallback=False):
            if filename == "1.png":
                return {"parsed_job_json": {
                    "title": "前端工程师", "company": "C 公司",
                    "responsibilities": ["页面开发"], "salary_range": "",
                }, "ocr_text": "第一页"}
            return {"parsed_job_json": {
                "salary_range": "18K-28K", "location": "深圳",
                "must_have": {"skills": ["React"]},
                "responsibilities": ["组件封装"],
            }, "ocr_text": "第二页"}

        monkeypatch.setattr(jobs_module, "parse_job_from_bytes", fake_parse)
        resp = client.post("/parse-images", files=[_png("1.png"), _png("2.png")])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["completeness"]["passed"] is True
        assert data["parsed_job_json"]["salary_range"] == "18K-28K"
        assert data["parsed_job_json"]["title"] == "前端工程师"
        assert "React" in data["parsed_job_json"]["must_have"]["skills"]
        assert data["completeness"]["missing_modules"] == []
        assert len(data["image_urls"]) == 2
        assert deleted == []  # 校验通过，文件保留

    def test_incomplete_merged_upload_rejected_with_missing_modules(self, job_client, monkeypatch):
        client, jobs_module, uploaded, deleted = job_client

        async def fake_parse(content, filename, use_ocr_fallback=False):
            return {"parsed_job_json": {
                "title": "测试工程师", "company": "D 公司",
            }, "ocr_text": None}

        monkeypatch.setattr(jobs_module, "parse_job_from_bytes", fake_parse)
        resp = client.post("/parse-images", files=[_png("a.png")])
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["message"] == "岗位信息不完整，本次上传未通过完整性校验"
        assert set(detail["missing_modules"]) == {"薪资范围", "工作地点", "岗位职责", "任职要求"}
        assert len(detail["recognized_modules"]) == 2
        assert deleted  # 上传失败，已清理存储对象
        assert len(deleted) == len(uploaded)

    def test_multi_image_merge_fills_gap_and_passes(self, job_client, monkeypatch):
        """第一张缺薪资、第二张补上薪资 → 合并后通过"""
        client, jobs_module, _, deleted = job_client

        async def fake_parse(content, filename, use_ocr_fallback=False):
            if filename == "p1.png":
                return {"parsed_job_json": {
                    "title": "产品经理", "company": "E 公司", "location": "广州",
                    "responsibilities": ["需求分析"], "must_have": {"experience": "3年"},
                }}
            return {"parsed_job_json": {"salary_range": "25K-35K", "responsibilities": ["竞品分析"]}}

        monkeypatch.setattr(jobs_module, "parse_job_from_bytes", fake_parse)
        resp = client.post("/parse-images", files=[_png("p1.png"), _png("p2.png")])
        assert resp.status_code == 200, resp.text
        assert resp.json()["completeness"]["passed"] is True
        assert deleted == []

    def test_all_files_invalid_rejected(self, job_client, monkeypatch):
        client, jobs_module, _, _ = job_client
        resp = client.post("/parse-images", files=[("files", ("bad.txt", b"x", "text/plain"))])
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "没有有效的图片文件" in detail["message"]
        assert any("不支持的图片格式" in e for e in detail["per_image_errors"])

    def test_too_many_files_rejected(self, job_client):
        client, _, _, _ = job_client
        resp = client.post("/parse-images", files=[_png(f"{i}.png") for i in range(7)])
        assert resp.status_code == 400
        assert "最多上传" in resp.json()["detail"]

    def test_all_parse_failures_rejected(self, job_client, monkeypatch):
        client, jobs_module, uploaded, deleted = job_client

        async def fake_parse(content, filename, use_ocr_fallback=False):
            raise ValueError("LLM 不可用")

        monkeypatch.setattr(jobs_module, "parse_job_from_bytes", fake_parse)
        resp = client.post("/parse-images", files=[_png("x.png")])
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "未识别到有效岗位信息" in detail["message"]
        assert any("识别失败" in e for e in detail["per_image_errors"])
        assert len(deleted) == len(uploaded)  # 存储已清理

    def test_partial_parse_failure_still_succeeds(self, job_client, monkeypatch):
        """一张解析失败、另一张信息完整 → 仍成功并在 per_image_errors 记录"""
        client, jobs_module, _, deleted = job_client

        async def fake_parse(content, filename, use_ocr_fallback=False):
            if filename == "ok.png":
                return {"parsed_job_json": _full_job()}
            raise RuntimeError("vision 失败且 OCR 未启用")

        monkeypatch.setattr(jobs_module, "parse_job_from_bytes", fake_parse)
        resp = client.post("/parse-images", files=[_png("ok.png"), _png("broken.png")])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["completeness"]["passed"] is True
        assert any("broken.png" in e for e in data["per_image_errors"])
        assert deleted == []
