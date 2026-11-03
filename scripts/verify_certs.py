"""证书与学习方向推荐 E2E（需 :8000 + :3000 在线）。

覆盖：
1. 登录态下选取演示简历 + 岗位，真实调用 POST /api/certs/recommend（LLM）：
   - 响应结构完整（gap_analysis 三数组 / recommendations 1~6 / learning_path）
   - 推荐项按 priority 升序、必填字段齐全
   - 所有 link 均为 https 且域名在白名单内，或为 null
2. 未登录调用 → 401/403
3. Playwright UI：/certs 页面渲染、选择器、点击生成 → 差距分析 + 推荐卡片 + 学习路径出现

运行：.venv/Scripts/python.exe scripts/verify_certs.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

WHITELIST_PREFIXES = (
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

passed, failed = 0, 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with _opener().open(req, timeout=400) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def link_ok(url: str | None) -> bool:
    if url is None:
        return True
    return url.startswith("https://") and any(url.startswith(p) for p in WHITELIST_PREFIXES)


def main() -> int:
    token, refresh, user = login()

    # ── 1. 未登录 → 401/403 ──
    status, _ = api("POST", "/api/certs/recommend", None, {"resume_id": "x", "job_id": "y"})
    check("未登录调用被拒（401/403）", status in (401, 403), f"status={status}")

    # ── 2. 准备数据：找一条已解析简历 + 已解析岗位 ──
    _, rbody = api("GET", "/api/resumes/", token)
    resumes_items = rbody.get("data") if isinstance(rbody, dict) else rbody
    if isinstance(resumes_items, dict):
        resumes_items = resumes_items.get("items") or []
    parsed_resumes = [r for r in (resumes_items or []) if r.get("parsed_json")]
    _, jbody = api("GET", "/api/jobs/", token)
    jobs_items = jbody.get("data") if isinstance(jbody, dict) else jbody
    if isinstance(jobs_items, dict):
        jobs_items = jobs_items.get("items") or []
    parsed_jobs = [j for j in (jobs_items or []) if j.get("parsed_job_json")]
    check("演示数据：存在已解析简历与岗位", bool(parsed_resumes) and bool(parsed_jobs),
          f"resumes={len(parsed_resumes)} jobs={len(parsed_jobs)}")
    if not parsed_resumes or not parsed_jobs:
        print(f"passed={passed} failed={failed}")
        return 1

    resume_id, job_id = parsed_resumes[0]["id"], parsed_jobs[0]["id"]

    # ── 3. 真实 LLM 调用 + 结构与白名单校验 ──
    status, data = api("POST", "/api/certs/recommend", token, {
        "resume_id": resume_id,
        "job_id": job_id,
        "existing_certifications": "",
        "time_budget": "半年",
        "budget": "低费用",
    })
    if status != 200:
        print(f"  FAIL LLM 调用失败 status={status} detail={data.get('detail') if isinstance(data, dict) else data}")
        print(f"passed={passed} failed={failed + 1}")
        return 1
    check("POST /api/certs/recommend 200", True)

    gap = (data or {}).get("gap_analysis") or {}
    recs = (data or {}).get("recommendations") or []
    path = (data or {}).get("learning_path") or []
    check("gap_analysis 三数组齐全",
          all(isinstance(gap.get(k), list) for k in ("resume_skills", "jd_requirements", "gaps")),
          str({k: len(gap.get(k) or []) for k in ("resume_skills", "jd_requirements", "gaps")}))
    check("推荐数量 1~6", 1 <= len(recs) <= 6, f"count={len(recs)}")
    check("learning_path 非空数组", isinstance(path, list) and len(path) >= 1, f"count={len(path)}")

    priorities = [r.get("priority") for r in recs]
    check("priority 升序", priorities == sorted(priorities), str(priorities))

    bad_fields = []
    for i, r in enumerate(recs):
        if not r.get("title"):
            bad_fields.append(f"#{i} title 空")
        if r.get("category") not in ("证书", "课程", "竞赛", "其他"):
            bad_fields.append(f"#{i} category={r.get('category')}")
        if r.get("level") not in ("入门级", "中级", "高级"):
            bad_fields.append(f"#{i} level={r.get('level')}")
        if not link_ok(r.get("link")):
            bad_fields.append(f"#{i} 链接越白名单: {r.get('link')}")
    check("推荐项字段齐全 + 链接全在白名单", not bad_fields, "; ".join(bad_fields[:3]))

    # ── 4. UI 链路 ──
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 800}).new_page()
        kv = {"token": token, "refreshToken": refresh, "user": json.dumps(user) if user else None}
        page.add_init_script(
            "(() => { const kv = %s; localStorage.clear();"
            " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
            % json.dumps(kv)
        )
        page.context.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": refresh, "url": BASE},
        ])

        page.goto(f"{BASE}/certs", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="certs-resume-select"]', timeout=20000)
        check("/certs 页面渲染（简历/岗位选择器就位）",
              page.locator('[data-testid="certs-job-select"]').count() == 1)
        active = (page.locator(".wb-navitem.active").first.text_content() or "").strip()
        check("侧边栏高亮「证书推荐」", "证书推荐" in active, f"actual={active}")

        # 打开两个下拉，各选第一项（antd 多个 Select 共享 dropdown DOM，必须限定"当前未隐藏"的 dropdown）
        page.locator('[data-testid="certs-resume-select"]').click()
        page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").first.click()
        page.locator(".ant-select-dropdown.ant-select-dropdown-hidden").first.wait_for(state="attached", timeout=5000)
        page.locator('[data-testid="certs-job-select"]').click()
        page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").first.click()
        page.locator(".ant-select-dropdown.ant-select-dropdown-hidden").first.wait_for(state="attached", timeout=5000)
        page.locator('[data-testid="certs-generate-btn"]').click()

        # LLM 生成实测可达 2~5 分钟，放宽等待
        page.wait_for_selector('[data-testid="certs-gap-analysis"]', timeout=400000)
        check("差距分析区块渲染", True)
        rec_count = page.locator('[data-testid^="certs-rec-item-"]').count()
        check("推荐卡片渲染（1~6 张）", 1 <= rec_count <= 6, f"count={rec_count}")
        check("学习路径区块渲染", page.locator('[data-testid="certs-learning-path"]').count() == 1)

        official = page.locator("a:has-text('官方链接')")
        n_links = official.count()
        urls = [official.nth(i).get_attribute("href") or "" for i in range(n_links)]
        check(f"卡片官方链接可点且在白名单（{n_links} 个）",
              all(link_ok(u) for u in urls), "; ".join(u for u in urls if not link_ok(u))[:120])

        browser.close()

    print(f"\npassed={passed} failed={failed}")
    return 0 if failed == 0 else 1


def login() -> tuple[str, str, dict]:
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with _opener().open(req, timeout=30) as r:
        body = json.loads(r.read())
    return body["access_token"], body["refresh_token"], body.get("user", {})


if __name__ == "__main__":
    sys.exit(main())
