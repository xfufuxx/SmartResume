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
import re
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
    # 与后端 LINK_WHITELIST_PREFIXES 保持同步（资源库扩充域名）
    "https://learn.microsoft.com/zh-cn/credentials",
    "https://cpaexam.cicpa.org.cn",
    "https://kzp.mof.gov.cn",
    "https://www.imachina.org.cn",
    "https://ksbm.ecctaa.cn",
    "https://ielts.neea.edu.cn",
    "https://toefl.neea.edu.cn",
    "https://jlpt.neea.edu.cn",
    "https://topik.neea.edu.cn",
    "https://bec.neea.edu.cn",
    "https://cet-bm.neea.edu.cn",
    "https://cet.neea.edu.cn",
    "https://ntce.neea.edu.cn",
    "https://www.cltt.org",
    "https://www.moj.gov.cn",
    "https://www.nmec.org.cn",
    "https://www.cpta.com.cn",
    "https://higher.smartedu.cn",
    "https://www.tensorflow.org",
    "https://www.kaggle.com",
    "https://skillbuilder.aws",
    "https://www.cncf.io",
    "https://training.linuxfoundation.org",
    "https://training.linuxfoundation.cn",
    "https://www.pdma.org",
    "https://www.peoplecert.org",
    "https://www.scrum.org",
    "https://exam.chinapmp.cn",
    "https://www.garp.org",
    "https://www.cdaglobal.com",
    "https://edu.cda.cn",
    "https://www.cda.cn",
    "https://www.tableau.com",
    "https://www.adobe.com",
    "https://www.figma.com",
    "https://www.gogoup.com",
    "https://alicert.taobao.com",
    "https://ke.qq.com",
    "https://ke.dingtalk.com",
    "https://sce.siemens.com.cn",
    "https://www.cisp.org.cn",
    "https://www.isc2.org",
    "https://www.istqb.org.cn",
    "https://www.postman.com",
    "https://www.chinascm.org.cn",
    "https://www.cqpa.org.cn",
    "https://home.pearsonvue.com/huawei",
    "https://www.autodesk.com/certification",
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
        with _opener().open(req, timeout=620) as r:
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

    # ── 3.5 内置资源库（静态目录，不耗额度）──
    status, cat = api("GET", "/api/certs/catalog", token)
    check("GET /api/certs/catalog 200", status == 200, f"status={status}")
    cat_items = (cat or {}).get("items") or []
    cat_cats = (cat or {}).get("categories") or []
    check(f"资源库条目充足（{len(cat_items)} 项 / {len(cat_cats)} 类）",
          len(cat_items) >= 60 and len(cat_cats) >= 10)
    bad_links = [i.get("name") for i in cat_items if not str(i.get("link", "")).startswith(("https://", "http://"))]
    check("资源库链接均可访问格式", not bad_links, str(bad_links[:3]))

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

        # ── 4.5 已持有证书：弹窗式选择器（分类 Tab / 搜索 / 无结果新增）──
        chips_sel = '[data-testid="certs-existing-select"] [data-testid="certs-chip"]'
        exist = page.locator('[data-testid="certs-existing-select"]')
        check("证书选择触发框就位", exist.count() == 1)
        exist.click()
        modal = page.locator(".certs-picker-inner")
        modal.wait_for(state="visible", timeout=6000)
        check("点击触发框弹出选择弹窗", modal.is_visible())

        tabs = modal.locator('[data-testid="certs-cert-tabs"] button')
        check("分类 Tab 齐全（全部 + 5 行业）", tabs.count() == 6, f"count={tabs.count()}")

        # 分类切换：财会/金融 → CPA 项可见；切回全部
        modal.locator('[data-testid="certs-cert-tabs"] button', has_text="财会").click()
        page.wait_for_timeout(300)
        cpa = modal.locator('[data-testid="certs-cert-item"]', has_text="CPA 注册会计师")
        check("分类切换生效（财会/金融 → CPA 可见）", cpa.count() == 1, f"count={cpa.count()}")
        status_txt = (modal.locator(".certs-picker-status").text_content() or "").strip()
        check("状态行明示当前分类口径", "财会" in status_txt, status_txt)
        modal.locator('[data-testid="certs-cert-tabs"] button', has_text="全部").click()

        # 搜索：关键词命中 → 勾选生成标签
        modal.get_by_placeholder("搜索证书关键词").fill("大学英语四级")
        page.wait_for_timeout(400)
        item = modal.locator('[data-testid="certs-cert-item"]', has_text="大学英语四级")
        check("关键词搜索命中证书项", item.count() == 1, f"count={item.count()}")
        item.first.click()
        page.wait_for_timeout(300)
        check("勾选后条目呈选中态", "is-selected" in (item.first.get_attribute("class") or ""))

        # 无结果 → 空态给出新增入口 → 直接新增自定义证书
        modal.get_by_placeholder("搜索证书关键词").fill("量子计算工程师执照")
        page.wait_for_timeout(400)
        empty = modal.locator('[data-testid="certs-cert-empty"]')
        empty.wait_for(state="visible", timeout=4000)
        check("搜索无结果展示空态与新增入口", empty.is_visible())
        empty.locator('[data-testid="certs-cert-add"]').click()
        page.wait_for_timeout(400)
        custom_item = modal.locator('[data-testid="certs-cert-item-custom"]', has_text="量子计算工程师执照")
        check("新增后自定义证书入列且自动勾选",
              custom_item.count() == 1 and "is-selected" in (custom_item.first.get_attribute("class") or ""))
        check("新增后搜索词已清空（衔接回列表态）",
              (modal.get_by_placeholder("搜索证书关键词").input_value() or "") == "")
        check("状态行恢复为分类浏览口径", "搜索" not in (modal.locator(".certs-picker-status").text_content() or ""))

        # 跨分类衔接：特定分类下搜索无结果 → 提供「在全部分类中查找」一键切换
        modal.locator('[data-testid="certs-cert-tabs"] button', has_text="财会").click()
        modal.get_by_placeholder("搜索证书关键词").fill("华为")
        page.wait_for_timeout(400)
        empty2 = modal.locator('[data-testid="certs-cert-empty"]')
        empty2.wait_for(state="visible", timeout=4000)
        sall = empty2.locator('[data-testid="certs-cert-search-all"]')
        check("特定分类无结果提供跨分类查找入口",
              sall.count() == 1 and "华为" in (sall.text_content() or ""),
              (sall.text_content() or "").strip())
        sall.click()
        page.wait_for_timeout(400)
        hw = modal.locator('[data-testid="certs-cert-item"]', has_text="华为")
        check("一键切回全部分类后展示跨分类结果", hw.count() >= 2, f"count={hw.count()}")

        # 关闭弹窗 → 触发框出现 2 个标签
        modal.locator("button", has_text=re.compile(r"确\s*定")).click()
        page.wait_for_timeout(400)
        chips = page.locator(chips_sel)
        check("关闭弹窗后触发框展示 2 个证书标签", chips.count() == 2, f"count={chips.count()}")

        # 重开弹窗 → 清空按钮 → 0 标签（衔接干净，不影响后续 LLM 口径）
        exist.click()
        modal.wait_for(state="visible", timeout=5000)
        modal.locator('[data-testid="certs-cert-clear"]').click()
        page.wait_for_timeout(300)
        check("弹窗内一键清空已选", page.locator(chips_sel).count() == 0)
        modal.locator("button", has_text=re.compile(r"确\s*定")).click()
        page.wait_for_timeout(300)

        # ── 4.6 简历自动带出证书（route 模拟新解析器的 certificates 字段）──
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 800})
        ctx2.add_init_script(
            "(() => { const kv = %s; localStorage.clear();"
            " for (const [k, v] of Object.entries(kv)) { if (v != null) localStorage.setItem(k, v); } })()"
            % json.dumps(kv)
        )
        ctx2.add_cookies([
            {"name": "sr-token", "value": token, "url": BASE},
            {"name": "sr-refresh", "value": refresh, "url": BASE},
        ])
        page2 = ctx2.new_page()
        mock_resume = {
            "id": "mock-r1", "user_id": "u", "title": "李雷的简历",
            "original_file_url": None, "file_type": "pdf",
            "parsed_json": {
                "personal_info": {"name": "李雷"}, "skills": [],
                "certificates": ["CET-6", "软考中级·软件设计师"],
            },
            "raw_text": None, "is_primary": True,
        }

        def fake_resumes(route):
            # 后端 /api/resumes/ 返回裸数组（非 {data: [...]} 包装）
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps([mock_resume]))

        page2.route(re.compile(r".*/api/resumes.*"), fake_resumes)
        page2.goto(f"{BASE}/certs", wait_until="domcontentloaded")
        hint = page2.locator('[data-testid="certs-auto-hint"]')
        hint.wait_for(state="visible", timeout=20000)
        check("简历自动带出证书提示（识别 2 项）",
              "自动识别 2" in (hint.text_content() or ""), (hint.text_content() or "").strip())
        auto_tags = page2.locator(chips_sel)
        check("自动勾选 2 项证书标签", auto_tags.count() == 2, f"count={auto_tags.count()}")
        ctx2.close()

        # 打开两个下拉，各选第一项（antd 多个 Select 共享 dropdown DOM，必须限定"当前未隐藏"的 dropdown）
        page.locator('[data-testid="certs-resume-select"]').click()
        page.wait_for_timeout(500)
        page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").first.click(force=True)
        page.locator(".ant-select-dropdown.ant-select-dropdown-hidden").first.wait_for(state="attached", timeout=5000)
        page.locator('[data-testid="certs-job-select"]').click()
        page.wait_for_timeout(500)
        page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").first.click(force=True)
        page.locator(".ant-select-dropdown.ant-select-dropdown-hidden").first.wait_for(state="attached", timeout=5000)
        page.locator('[data-testid="certs-generate-btn"]').click()

        # LLM 生成实测可达 2~5 分钟，放宽等待
        page.wait_for_selector('[data-testid="certs-gap-analysis"]', timeout=620000)
        check("差距分析区块渲染", True)
        rec_count = page.locator('[data-testid^="certs-rec-item-"]').count()
        check("推荐卡片渲染（1~6 张）", 1 <= rec_count <= 6, f"count={rec_count}")
        check("学习路径区块渲染", page.locator('[data-testid="certs-learning-path"]').count() == 1)

        official = page.locator("a:has-text('官方链接')")
        n_links = official.count()
        urls = [official.nth(i).get_attribute("href") or "" for i in range(n_links)]
        check(f"卡片官方链接可点且在白名单（{n_links} 个）",
              all(link_ok(u) for u in urls), "; ".join(u for u in urls if not link_ok(u))[:120])

        # ── 5. 资源库区块 ──
        page.wait_for_selector('[data-testid="certs-catalog"]', timeout=15000)
        check("行业证书资源库区块渲染", True)
        cat_sel = page.locator('[data-testid="certs-catalog-category"]')
        cat_sel.click()
        page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").first.click()
        page.wait_for_timeout(500)
        search = page.get_by_placeholder("搜索证书 / 机构 / 关键词，如：华为、会计、PMP")
        search.fill("华为")
        page.wait_for_timeout(600)
        rows = page.locator(".certs-catalog-item")
        check(f"资源库分类过滤+搜索生效（华为 → {rows.count()} 条）", rows.count() >= 1, f"count={rows.count()}")

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
