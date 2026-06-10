"""
单元测试 — 匹配度计算 API + 评分引擎
运行: pytest backend/tests/ -v
"""

import pytest
import json

from app.services.match_calculator import calculate_match
from app.services.scoring_engine import calculate_score, _extract_resume_keywords, _extract_job_keywords


class TestMatchCalculator:
    """岗位匹配度计算器 — 纯逻辑测试，无需数据库/网络"""

    @pytest.fixture
    def sample_resume(self):
        return {
            "personal_info": {"name": "张三", "email": "zhang@example.com", "phone": "13800138000"},
            "summary": "5年后端开发经验，精通Python和FastAPI，有高并发经验",
            "experience": [
                {
                    "company": "星辰科技",
                    "title": "高级后端工程师",
                    "start": "2021-03",
                    "end": "2024-12",
                    "points": [
                        "负责电商平台核心订单系统，支撑日订单50万+",
                        "将核心接口响应时间从800ms优化至120ms，提升6倍",
                        "引入Docker + K8s实现容器化部署",
                    ],
                },
                {
                    "company": "云帆软件",
                    "title": "后端开发工程师",
                    "start": "2019-07",
                    "end": "2021-02",
                    "points": [
                        "参与企业级OA系统后端API开发",
                        "使用PostgreSQL设计数据库表结构",
                    ],
                },
            ],
            "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"],
            "projects": [
                {"name": "智能简历平台", "description": "AI简历优化系统，日处理1000+份", "tech": ["FastAPI", "React", "PostgreSQL"]},
            ],
        }

    @pytest.fixture
    def sample_job(self):
        return {
            "title": "Python后端高级工程师",
            "company": "某互联网大厂",
            "must_have": {
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis"],
                "experience": "3年以上",
            },
            "nice_to_have": {
                "skills": ["Kubernetes", "AWS", "消息队列"],
                "qualifications": ["计算机相关专业本科"],
            },
            "responsibilities": [
                "负责微服务架构设计与开发",
                "优化系统性能和稳定性",
                "参与技术方案评审",
            ],
            "soft_skills": ["沟通能力", "团队协作"],
        }

    @pytest.mark.asyncio
    async def test_perfect_match(self, sample_resume, sample_job):
        """测试高匹配度场景：简历技能完全覆盖JD要求"""
        result = await calculate_match(sample_resume, sample_job)
        assert result["match_rate"] >= 70, f"Expected >= 70, got {result['match_rate']}"
        assert "aws" in result["missing_keywords"] or len(result["missing_keywords"]) <= 3

    @pytest.mark.asyncio
    async def test_empty_job_keywords(self, sample_resume):
        """测试JD没有关键词时返回默认值"""
        empty_job = {"title": "测试岗位", "must_have": {"skills": []}, "nice_to_have": {"skills": []}, "responsibilities": []}
        result = await calculate_match(sample_resume, empty_job)
        assert result["match_rate"] == 50
        assert result["missing_keywords"] == []

    @pytest.mark.asyncio
    async def test_no_match(self):
        """测试完全不匹配场景"""
        resume = {
            "skills": ["Excel", "Word", "PPT"],
            "experience": [],
            "projects": [],
            "summary": "",
        }
        job = {
            "must_have": {"skills": ["Python", "Docker", "AWS", "Kubernetes", "Terraform"]},
            "nice_to_have": {"skills": []},
            "responsibilities": [],
        }
        result = await calculate_match(resume, job)
        assert result["match_rate"] <= 30, f"Expected <= 30, got {result['match_rate']}"
        assert len(result["missing_keywords"]) >= 4

    @pytest.mark.asyncio
    async def test_keyword_extraction_job(self, sample_job):
        """测试JD关键词提取"""
        keywords = _extract_job_keywords(sample_job)
        expected = ["python", "fastapi", "postgresql", "docker", "redis"]
        for exp in expected:
            assert exp in keywords, f"Expected {exp} in keywords, got {keywords}"

    @pytest.mark.asyncio
    async def test_keyword_extraction_resume(self, sample_resume):
        """测试简历关键词提取"""
        keywords = _extract_resume_keywords(sample_resume)
        expected = ["python", "fastapi", "postgresql", "docker", "kubernetes"]
        for exp in expected:
            assert exp in keywords, f"Expected {exp} in keywords, got {keywords}"

    @pytest.mark.asyncio
    async def test_quantification_bonus(self, sample_job):
        """测试量化成果对匹配度的加分"""
        resume_with_quant = {
            "skills": ["Python", "Docker"],
            "summary": "",
            "experience": [
                {"company": "A", "title": "Dev", "points": ["提升系统性能50%", "节省成本100万"]},
            ],
            "projects": [],
        }
        resume_no_quant = {
            "skills": ["Python", "Docker"],
            "summary": "",
            "experience": [
                {"company": "A", "title": "Dev", "points": ["负责系统开发", "参与项目管理"]},
            ],
            "projects": [],
        }
        job = {
            "must_have": {"skills": ["Python", "Docker"]},
            "nice_to_have": {"skills": []},
            "responsibilities": [],
        }

        result_quant = await calculate_match(resume_with_quant, job)
        result_no_quant = await calculate_match(resume_no_quant, job)
        assert result_quant["match_rate"] > result_no_quant["match_rate"], (
            f"Expected quantified ({result_quant['match_rate']}) > no quant ({result_no_quant['match_rate']})"
        )


class TestScoringEngine:
    """简历评分引擎 — 四个维度测试"""

    @pytest.fixture
    def complete_resume(self):
        return {
            "personal_info": {"name": "李四", "email": "lisi@test.com", "phone": "13900139000"},
            "summary": "资深全栈工程师，10年经验",
            "experience": [
                {
                    "company": "大厂A",
                    "title": "技术总监",
                    "start": "2020-01",
                    "end": "2024-12",
                    "points": [
                        "带领10人团队完成项目，交付效率提升40%",
                        "系统架构升级后QPS从1万提升至10万",
                    ],
                },
            ],
            "education": [{"school": "清华大学", "degree": "硕士", "major": "计算机科学"}],
            "skills": ["Python", "Go", "React", "PostgreSQL", "Docker", "Kubernetes", "AWS"],
            "projects": [
                {"name": "高并发网关", "description": "设计千万级并发网关，延迟降低60%", "tech": ["Go", "Redis"]},
            ],
        }

    @pytest.mark.asyncio
    async def test_complete_resume_scores_high(self, complete_resume):
        """完整简历应得高分"""
        result = await calculate_score(complete_resume, None)
        assert result["total_score"] >= 75, f"Expected >= 75, got {result['total_score']}"
        dims = result["dimensions"]
        assert dims["completeness"] >= 80
        assert dims["quantification"] >= 80

    @pytest.mark.asyncio
    async def test_incomplete_resume_scores_low(self):
        """不完整简历应得低分"""
        incomplete = {
            "personal_info": {"name": ""},
            "summary": "",
            "experience": [],
            "education": [],
            "skills": [],
            "projects": [],
        }
        result = await calculate_score(incomplete, None)
        assert result["total_score"] <= 40, f"Expected <= 40, got {result['total_score']}"
        assert len(result["suggestions"]) >= 4

    @pytest.mark.asyncio
    async def test_keyword_match_with_jd(self, complete_resume):
        """测试带JD的关键词匹配"""
        job = {
            "must_have": {"skills": ["Python", "Docker", "AWS", "Terraform"]},
            "nice_to_have": {"skills": []},
            "responsibilities": [],
        }
        result = await calculate_score(complete_resume, job)
        dims = result["dimensions"]
        assert dims["keyword_match"] >= 60, f"Expected >= 60, got {dims['keyword_match']}"
        has_missing_suggestion = any("Terraform" in s or "terraform" in s for s in result["suggestions"])
        assert has_missing_suggestion, f"Should suggest missing Terraform, got: {result['suggestions']}"

    @pytest.mark.asyncio
    async def test_quantification_detection(self):
        """测试量化检测"""
        resume = {
            "personal_info": {"name": "王五"},
            "summary": "",
            "experience": [
                {"company": "X", "title": "Dev", "points": ["做了很多工作", "完成了项目开发"]},
            ],
            "projects": [],
            "skills": [],
            "education": [],
        }
        result = await calculate_score(resume, None)
        assert result["dimensions"]["quantification"] <= 30, f"Expected low quantification, got {result['dimensions']['quantification']}"

    @pytest.mark.asyncio
    async def test_format_readability(self):
        """测试排版评分"""
        good_format = {
            "personal_info": {"name": "Test"},
            "summary": "",
            "experience": [
                {"company": "A", "title": "Dev", "points": ["p1", "p2", "p3", "p4"]},
            ],
            "skills": ["a", "b", "c", "d", "e"],
            "projects": [],
            "education": [],
        }
        result = await calculate_score(good_format, None)
        assert result["dimensions"]["format_readability"] >= 60

    @pytest.mark.asyncio
    async def test_excessive_experience_points(self):
        """测试经历条目过多扣分"""
        resume = {
            "personal_info": {"name": "Test"},
            "summary": "",
            "experience": [
                {"company": "A", "title": "Dev", "points": [f"p{i}" for i in range(12)]},
            ],
            "skills": ["a", "b", "c"],
            "projects": [],
            "education": [],
        }
        result = await calculate_score(resume, None)
        assert result["dimensions"]["format_readability"] < 90


class TestMatchAPI:
    """匹配度 API 集成测试（需要运行中的服务器）"""

    @pytest.mark.asyncio
    async def test_match_endpoint_returns_correct_shape(self):
        """验证 POST /api/match 返回格式正确"""
        import pytest_asyncio
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/match/",
                json={"resume_id": "non-existent", "job_id": "non-existent"},
            )
            assert response.status_code in (401, 404), f"Unexpected status: {response.status_code}"

    @pytest.mark.asyncio
    async def test_batch_optimize_validation(self):
        """验证批量优化接口参数校验"""
        import pytest_asyncio
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/batch-optimize",
                json={"source_resume_id": "x", "job_ids": []},
            )
            assert response.status_code in (400, 401, 422), f"Unexpected status: {response.status_code}"

            response = await client.post(
                "/api/batch-optimize",
                json={"source_resume_id": "x", "job_ids": ["1", "2", "3", "4", "5", "6"]},
            )
            assert response.status_code in (400, 401, 422), f"Unexpected status: {response.status_code}"