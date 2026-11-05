"""证书与学习方向推荐服务：人岗差距 → LLM 生成证书/课程推荐（严格 JSON + 链接白名单校验）。"""

import json
import logging
from urllib.parse import urlparse

from app.config import settings
from app.prompts.cert_recommend import (
    CERT_RECOMMEND_SYSTEM_PROMPT,
    CERT_RECOMMEND_USER_PROMPT,
)
from app.services import ensure_mock_allowed, has_valid_api_key
from app.services.agent_optimizer import _call_with_retry, _get_client, _require_content

logger = logging.getLogger(__name__)

MAX_RECOMMENDATIONS = 6

# 官方/权威链接白名单（与 prompt 中的规则一致；前缀匹配）
LINK_WHITELIST_PREFIXES = (
    "https://e.huawei.com/cn/talent",
    "https://edu.huaweicloud.com",
    "https://edu.aliyun.com",
    "https://cloud.tencent.com/edu",
    "https://www.ruankao.org.cn",
    "https://www.pmi.org",
    "https://www.pmichina.org",
    "https://aws.amazon.com/certification",
    "https://learn.microsoft.com/credentials",
    "https://www.cloudskillsboost.google",
    "https://learningnetwork.cisco.com",
    "https://education.oracle.com",
    "https://www.redhat.com/en/services/training",
    "https://www.cfainstitute.org",
    "https://www.accaglobal.com",
    "https://www.cicpa.org.cn",
    "https://www.china-cba.net",
    "https://www.amac.org.cn",
    "https://www.sac.net.cn",
    "https://www.catticenter.com",
    "https://www.neea.edu.cn",
    "https://www.mohrss.gov.cn",
    "https://www.icourse163.org",
    "https://www.coursera.org",
    "https://www.edx.org",
    "https://www.udacity.com",
    "https://time.geekbang.org",
    "https://edu.lagou.com",
    "https://leetcode.cn",
)

_VALID_CATEGORIES = {"证书", "课程", "竞赛", "其他"}
_VALID_LEVELS = {"入门级", "中级", "高级"}


def _strip_json_fences(text: str) -> str:
    """剥离 ```json ... ``` 围栏（部分模型不遵守 response_format 时的兜底）。"""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


def _safe_link(link) -> str | None:
    """链接白名单校验：非 https、域名不在白名单 → 置 null（不信任 LLM 拼的 URL）。"""
    if not isinstance(link, str) or not link.strip():
        return None
    link = link.strip()
    try:
        parsed = urlparse(link)
    except ValueError:
        return None
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    normalized = f"https://{parsed.netloc}{parsed.path}"
    for prefix in LINK_WHITELIST_PREFIXES:
        if normalized.startswith(prefix) or link.startswith(prefix):
            return link
    return None


def _normalize_result(data: dict) -> dict:
    """清洗 LLM 输出：结构缺省补齐、链接白名单过滤、推荐数量钳制 3~6 并按 priority 排序。"""
    gap = data.get("gap_analysis") or {}
    gap_analysis = {
        "resume_skills": [str(s) for s in (gap.get("resume_skills") or []) if str(s).strip()],
        "jd_requirements": [str(s) for s in (gap.get("jd_requirements") or []) if str(s).strip()],
        "gaps": [str(s) for s in (gap.get("gaps") or []) if str(s).strip()],
    }

    raw_items = data.get("recommendations") or []
    items = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title") or "").strip()
        if not title:
            continue
        category = str(it.get("category") or "其他").strip()
        if category not in _VALID_CATEGORIES:
            category = "其他"
        level = str(it.get("level") or "入门级").strip()
        if level not in _VALID_LEVELS:
            level = "入门级"
        try:
            priority = int(it.get("priority") or len(items) + 1)
        except (TypeError, ValueError):
            priority = len(items) + 1
        items.append(
            {
                "title": title,
                "category": category,
                "issuer": str(it.get("issuer") or "").strip(),
                "link": _safe_link(it.get("link")),
                "level": level,
                "estimated_cost": str(it.get("estimated_cost") or "").strip(),
                "estimated_duration": str(it.get("estimated_duration") or "").strip(),
                "why": str(it.get("why") or "").strip(),
                "priority": priority,
            }
        )
    items.sort(key=lambda x: x["priority"])
    items = items[:MAX_RECOMMENDATIONS]

    learning_path = [str(s) for s in (data.get("learning_path") or []) if str(s).strip()]

    return {
        "gap_analysis": gap_analysis,
        "recommendations": items,
        "learning_path": learning_path,
    }


def _mock_cert_recommend() -> dict:
    return {
        "gap_analysis": {
            "resume_skills": ["Python", "FastAPI", "SQL"],
            "jd_requirements": ["云平台部署经验", "容器化运维", "项目管理"],
            "gaps": ["云平台实战与认证", "容器化运维能力"],
        },
        "recommendations": [
            {
                "title": "阿里云云计算工程师 ACA 认证",
                "category": "证书",
                "issuer": "阿里云",
                "link": "https://edu.aliyun.com/certification",
                "level": "入门级",
                "estimated_cost": "约 600 元（考试费）",
                "estimated_duration": "1~2 个月（每天 1~2 小时）",
                "why": "JD 要求云平台部署经验，你具备 Python/SQL 基础，ACA 是上云方向门槛最低的体系化认证，可快速补齐云平台认知差距。",
                "priority": 1,
            },
            {
                "title": "华为云openEuler / 容器化运维课程",
                "category": "课程",
                "issuer": "华为人才在线",
                "link": "https://e.huawei.com/cn/talent",
                "level": "中级",
                "estimated_cost": "免费（部分实验收费）",
                "estimated_duration": "2~4 周",
                "why": "JD 明确提到容器化运维；该课程提供免费实验环境，配合你已有的后端开发经验可直接上手 Docker/K8s 实操。",
                "priority": 2,
            },
            {
                "title": "PMI Project Management Ready（项目管理基础）",
                "category": "证书",
                "issuer": "PMI",
                "link": "https://www.pmi.org/certifications",
                "level": "入门级",
                "estimated_cost": "约 800~1200 元",
                "estimated_duration": "1~3 个月",
                "why": "作为长期增值备选：若目标岗位涉及跨团队协作，项目管理基础证书比 PMP 门槛低，适合作为后续进阶跳板。官网入口请以 PMI 官方为准。",
                "priority": 3,
            },
        ],
        "learning_path": [
            "第一步：先完成阿里云 ACA 官方课程与实验，1 个月内拿下首个云认证",
            "第二步：用项目实战（把现有简历项目容器化上云）巩固运维能力，同步刷华为云实验",
            "第三步：视岗位反馈决定是否投入项目管理方向证书",
        ],
    }


async def recommend_certs(
    resume_json: dict,
    job_json: dict,
    existing_certifications: str | None = None,
    time_budget: str | None = None,
    budget: str | None = None,
) -> dict:
    """基于简历与 JD 调用 LLM 生成证书/学习方向推荐（返回已清洗的结构化 JSON）。"""
    if not has_valid_api_key():
        ensure_mock_allowed("证书推荐")
        return _mock_cert_recommend()

    resume_str = json.dumps(resume_json, ensure_ascii=False, indent=2)
    jd_str = json.dumps(job_json, ensure_ascii=False, indent=2)

    system = CERT_RECOMMEND_SYSTEM_PROMPT.format(
        existing_certifications=(existing_certifications or "未提供").strip() or "未提供",
        time_budget=(time_budget or "未提供").strip() or "未提供",
        budget=(budget or "未提供").strip() or "未提供",
    )
    user = CERT_RECOMMEND_USER_PROMPT.format(resume_text=resume_str, jd_text=jd_str)

    resp = await _call_with_retry(
        _get_client(),
        task="证书推荐",
        # 单次最长 300s（实测生成 2~5 分钟），最多 2 次（含重试）→ 上界约 600s，
        # 与前端 10.5 分钟等待对齐；默认 3 次重试会到 900s，用户先看到超时后端还在跑
        max_attempts=2,
        model=settings.LLM_MODEL_TEXT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        max_tokens=3200,
        timeout=300.0,
    )

    content = _require_content(resp, "证书推荐")
    try:
        data = json.loads(_strip_json_fences(content))
    except json.JSONDecodeError as e:
        logger.warning("证书推荐输出解析失败: %s... (%s)", content[:200], e)
        raise ValueError("AI 返回格式异常，请重试") from e
    if not isinstance(data, dict):
        raise ValueError("AI 返回格式异常，请重试")
    return _normalize_result(data)
