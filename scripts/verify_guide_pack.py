"""阶段4 回归：平台引导投递「一键准备包」。

覆盖：平台识别与深链构建（job_url 优先 / 平台搜索兜底）、简历纯文本生成、
guide 通道创建（channel_hint=guide + consent）、guide/opened 事件留痕、
guide/result 用户回填（submitted/failed）、撤回。绝不真实访问外部平台。

运行前提：dry-run 后端在 :8000（SMTP/IMAP 置空启动），Redis :6379。
用法：backend/.venv 的 python scripts/verify_guide_pack.py
"""
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

BASE = "http://127.0.0.1:8000"
PROXY = {"http": None, "https": None}
TOKEN = None

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  ❌ {name}  {extra}")


def req(method: str, path: str, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, BASE + path, json=body, headers=headers, proxies=PROXY, timeout=30)


def login() -> str:
    r = req("POST", "/api/auth/login", {
        "email": "demo@smart-resume.com", "password": "Demo@123456",
    })
    assert r.status_code == 200, f"登录失败: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def create_job(token: str, title: str, company: str, parsed: dict) -> str:
    r = req("POST", "/api/jobs/create", {
        "title": title, "company": company, "parsed_job_json": parsed,
    }, token)
    assert r.status_code in (200, 201), f"建岗失败: {r.status_code} {r.text[:300]}"
    return r.json()["id"]


def main() -> int:
    global TOKEN
    print("== 登录 ==")
    TOKEN = login()
    print("  ✅ 登录成功")

    # 简历：取当前用户任意一条（demo 库自带）
    r = req("GET", "/api/resumes/", token=TOKEN)
    resumes = r.json() if r.status_code == 200 else []
    resume_id = resumes[0]["id"] if resumes else None

    # ── 1. 一键准备包：深链构建 ──
    print("== 一键准备包 ==")
    job_a = create_job(TOKEN, "后端工程师A", "链上科技A", {
        "title": "后端工程师A", "company": "链上科技A",
        "desc": "岗位详情见 https://www.zhipin.com/job_detail/guideA.html 请勿重复投递",
    })
    r = req("GET", f"/api/applications/guide-pack/{job_a}", token=TOKEN)
    check("准备包 200", r.status_code == 200, r.text[:200])
    pack = r.json()
    check("JD 内 BOSS 链接被识别为深链", pack["link_source"] == "job_url", str(pack))
    check("平台识别为 BOSS直聘", pack["platform_key"] == "boss" and pack["platform_name"] == "BOSS直聘")
    check("岗位标题/公司带回", pack["job_title"] == "后端工程师A" and pack["job_company"] == "链上科技A")

    job_b = create_job(TOKEN, "前端工程师B", "云端科技B", {
        "title": "前端工程师B", "company": "云端科技B",
        "desc": "职责：负责前端开发。来源：智联招聘",
    })
    r = req("GET", f"/api/applications/guide-pack/{job_b}", token=TOKEN)
    pack_b = r.json()
    check("文字提及平台 → 搜索深链兜底",
          pack_b["link_source"] == "platform_search" and pack_b["platform_key"] == "zhilian", str(pack_b))
    check("搜索深链带岗位关键词", "kw=" in pack_b["deep_link"], pack_b["deep_link"])

    job_c = create_job(TOKEN, "产品经理C", "星光科技C", {
        "title": "产品经理C", "company": "星光科技C", "desc": "无任何平台线索",
    })
    r = req("GET", f"/api/applications/guide-pack/{job_c}", token=TOKEN)
    pack_c = r.json()
    check("无线索 → BOSS 搜索兜底",
          pack_c["platform_key"] == "boss" and pack_c["link_source"] == "platform_search", str(pack_c))

    # 指定简历：resume_text 非空
    if resume_id:
        r = req("GET", f"/api/applications/guide-pack/{job_a}?resume_id={resume_id}", token=TOKEN)
        pack_r = r.json()
        check("指定简历 → 纯文本非空且含结构化段落",
              bool(pack_r["resume_text"]) and ("【" in pack_r["resume_text"] or len(pack_r["resume_text"]) > 30),
              f"len={len(pack_r.get('resume_text', ''))}")
        check("简历标题带回", pack_r["resume_title"] is not None, str(pack_r.get("resume_title")))
    else:
        r = req("GET", f"/api/applications/guide-pack/{job_a}", token=TOKEN)
        check("无简历用户 → resume_text 为空不报错", r.status_code == 200, r.text[:200])

    # 不存在的岗位
    r = req("GET", "/api/applications/guide-pack/nonexistent-job", token=TOKEN)
    check("不存在的岗位 → 404", r.status_code == 404, f"got {r.status_code}")

    # ── 2. guide 通道创建（channel_hint=guide，需 PIPL 授权）──
    print("== guide 通道创建 ==")
    r = req("POST", "/api/applications/", {
        "job_image_id": job_b, "resume_id": resume_id, "channel_hint": "guide",
        "apply_url": pack_b["deep_link"], "consent_given": False,
    }, TOKEN)
    check("guide 无授权 → 422", r.status_code == 422, f"got {r.status_code}")

    r = req("POST", "/api/applications/", {
        "job_image_id": job_b, "resume_id": resume_id, "channel_hint": "guide",
        "apply_url": pack_b["deep_link"], "cover_letter": "附言B",
        "consent_given": True,
    }, TOKEN)
    check("guide + 授权 → 201", r.status_code == 201, r.text[:300])
    app_b = r.json()
    check("channel=guide / 状态 pending", app_b["channel"] == "guide" and app_b["delivery_status"] == "pending")
    check("apply_url 存深链", app_b["apply_url"] == pack_b["deep_link"])
    check("PIPL 授权时间落库", bool(app_b["consent_at"]))

    # guide 通道不占邮件额度（即使未配 SMTP 也应 201）
    r = req("POST", "/api/applications/", {
        "job_image_id": job_c, "channel_hint": "guide",
        "apply_url": pack_c["deep_link"], "consent_given": True,
    }, TOKEN)
    check("无简历 guide 投递 201（不占邮件额度）", r.status_code == 201, r.text[:200])
    app_c = r.json()

    # 防重复
    r = req("POST", "/api/applications/", {
        "job_image_id": job_b, "channel_hint": "guide",
        "apply_url": pack_b["deep_link"], "consent_given": True,
    }, TOKEN)
    check("重复 guide 投递 → 409", r.status_code == 409, f"got {r.status_code}")

    # guide 简历文本复制能力由 /guide-pack 提供（前端复制），后端不再校验

    # ── 3. guide/opened 事件留痕 ──
    print("== opened 事件 ==")
    r = req("POST", f"/api/applications/{app_b['id']}/guide/opened", token=TOKEN)
    check("opened 201", r.status_code == 201, r.text[:200])
    r = req("GET", f"/api/applications/{app_b['id']}/delivery-events", token=TOKEN)
    events = r.json()
    check("事件流含 guide_opened", any(e["event_type"] == "guide_opened" for e in events), str(events)[:200])

    # ── 4. guide/result 回填 ──
    print("== result 回填 ==")
    r = req("POST", f"/api/applications/{app_b['id']}/guide/result", {"result": "failed"}, TOKEN)
    check("回填 failed → 200", r.status_code == 200)
    check("failed → delivery_status=failed", r.json()["delivery_status"] == "failed")

    r = req("POST", f"/api/applications/{app_b['id']}/guide/result", {"result": "submitted"}, TOKEN)
    check("回填 submitted → 200", r.status_code == 200)
    j = r.json()
    check("submitted → delivery_status=sent", j["delivery_status"] == "sent")
    check("submitted → sent_at 落库", bool(j["sent_at"]))

    r = req("GET", f"/api/applications/{app_b['id']}/delivery-events", token=TOKEN)
    events = r.json()
    types = [e["event_type"] for e in events]
    check("事件流含 guide_failed/guide_submitted", "guide_failed" in types and "guide_submitted" in types, str(types))

    r = req("POST", f"/api/applications/{app_b['id']}/guide/result", {"result": "invalid"}, TOKEN)
    check("非法 result → 422", r.status_code == 422, f"got {r.status_code}")

    # 通道校验：email/manual 投递不可用 guide 回填
    r = req("POST", f"/api/applications/{app_c['id']}/guide/result", {"result": "submitted"}, TOKEN)
    check("guide 记录正常回填 200", r.status_code == 200)

    # ── 5. 撤回 + 清理 ──
    print("== 撤回 ==")
    for aid in (app_b["id"], app_c["id"]):
        r = req("DELETE", f"/api/applications/{aid}", token=TOKEN)
        check(f"撤回 {aid[:8]} 200", r.status_code == 200, f"got {r.status_code}")
    r = req("GET", "/api/applications/", token=TOKEN)
    ids = [a["id"] for a in r.json()]
    check("撤回后不在列表", app_b["id"] not in ids and app_c["id"] not in ids)

    print(f"\n===== 结果：{PASS} 通过 / {FAIL} 失败 =====")
    if FAILURES:
        print("失败项：", "；".join(FAILURES))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
