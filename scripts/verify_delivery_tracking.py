"""阶段2 回归：回执闭环 / 批量投递 / 邮件模板 / suppression 名单 / 撤回告知。

运行前提：dry-run 后端已在 :8000 运行（SMTP 置空启动，绝不真实发信），
Redis 在 :6379，Postgres 就绪。

用法：backend/.venv 的 python scripts/verify_delivery_tracking.py
"""
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

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


def req(method: str, path: str, body=None, token=None, expect=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.request(method, BASE + path, json=body, headers=headers, proxies=PROXY, timeout=30)
    return r


def login() -> str:
    r = req("POST", "/api/auth/login", {
        "email": "demo@smart-resume.com", "password": "Demo@123456",
    })
    assert r.status_code == 200, f"登录失败: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def create_job(token: str, title: str, company: str, hr_email: str | None) -> str:
    parsed = {"title": title, "company": company, "salary": "20K-35K"}
    if hr_email:
        parsed["contact"] = f"简历投递至 {hr_email}，请注明应聘岗位。"
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

    # ── 1. 邮件模板：惰性播种 + CRUD ──
    print("== 邮件模板 ==")
    # 幂等准备：清掉历史回归遗留模板，使「首次访问播种」路径每次都能被验证
    r = req("GET", "/api/email-templates/", token=TOKEN)
    assert r.status_code == 200, f"模板列表失败: {r.status_code}"
    for t in r.json():
        req("DELETE", f"/api/email-templates/{t['id']}", token=TOKEN)

    r = req("GET", "/api/email-templates/", token=TOKEN)
    check("模板列表 200", r.status_code == 200, r.text[:200])
    tpl_list = r.json()
    check("首次访问自动播种默认模板(≥2)", len(tpl_list) >= 2, f"got {len(tpl_list)}")
    check("存在默认标记模板", any(t.get("is_default") for t in tpl_list))

    r = req("POST", "/api/email-templates/", {
        "name": "回归·自定义模板",
        "body": "您好，看到贵司 {company} 的 {job_title}，简历见附件。{applicant_name}",
        "is_default": True,
    }, TOKEN)
    check("新建自定义模板 201", r.status_code == 201, r.text[:200])
    tpl_id = r.json()["id"]

    r = req("GET", "/api/email-templates/", token=TOKEN)
    after = r.json()
    mine = [t for t in after if t["id"] == tpl_id]
    others_default = [t for t in after if t["id"] != tpl_id and t.get("is_default")]
    check("新建后成为唯一默认", len(mine) == 1 and mine[0]["is_default"] and not others_default)

    r = req("PUT", f"/api/email-templates/{tpl_id}", {"name": "回归·改名"}, TOKEN)
    check("更新模板 200", r.status_code == 200 and r.json()["name"] == "回归·改名")

    r = req("DELETE", f"/api/email-templates/{tpl_id}", token=TOKEN)
    check("删除模板 200", r.status_code == 200)

    # ── 2. 建岗位（JD 中带 HR 邮箱供探测） ──
    print("== 建岗位 ==")
    job_ids = [
        create_job(TOKEN, "后端开发A", "触达科技", "hr-a@chida-tech.cn"),
        create_job(TOKEN, "后端开发B", "回声网络", "hr-b@echo-net.com"),
        create_job(TOKEN, "后端开发C", "量子传媒", "hr-c@quantum-media.cn"),
        create_job(TOKEN, "后端开发D", "静默数据", None),
    ]
    print(f"  ✅ 已建 {len(job_ids)} 个岗位")

    # ── 3. 批量投递（3 个带邮箱 + 1 个无邮箱 manual） ──
    print("== 批量投递 ==")
    r = req("POST", "/api/applications/batch", {
        "job_image_ids": job_ids,
        "resume_id": None,
        "cover_letter": "批量投递回归附言",
        "recipient_emails": {
            job_ids[0]: "hr-a@chida-tech.cn",
            job_ids[1]: "hr-b@echo-net.com",
            job_ids[2]: "hr-c@quantum-media.cn",
        },
        "consent_given": True,
    }, TOKEN)
    check("批量投递 200", r.status_code == 200, r.text[:300])
    batch = r.json()
    check("批量全部创建成功 created=4", batch["created"] == 4, json.dumps(batch, ensure_ascii=False)[:300])
    check("批量无跳过 skipped=0", batch["skipped"] == 0)
    items = {i["job_image_id"]: i for i in batch["items"]}
    check("邮箱岗位走 email 通道",
          items[job_ids[0]]["ok"] and items[job_ids[3]]["ok"])

    # 确认通道字段
    r = req("GET", "/api/applications/", token=TOKEN)
    apps = {a["job_image_id"]: a for a in r.json()}
    check("邮箱岗位 channel=email", apps[job_ids[0]]["channel"] == "email")
    check("无邮箱岗位 channel=manual", apps[job_ids[3]]["channel"] == "manual")

    # dry-run 发送完成（后台任务），轮询 delivery_status
    import time
    delivered = False
    for _ in range(20):
        time.sleep(0.5)
        r = req("GET", "/api/applications/", token=TOKEN)
        apps = {a["job_image_id"]: a for a in r.json()}
        if apps[job_ids[0]].get("delivery_status") == "sent":
            delivered = True
            break
    check("dry-run 后台发送完成 delivery_status=sent", delivered)

    # ── 4. 批量重复投递 → 全部 409 跳过 ──
    print("== 防重复 ==")
    r = req("POST", "/api/applications/batch", {
        "job_image_ids": job_ids[:3],
        "consent_given": True,
        "recipient_emails": {job_ids[0]: "hr-a@chida-tech.cn"},
    }, TOKEN)
    batch2 = r.json()
    check("重复批量全部跳过 created=0 skipped=3",
          batch2["created"] == 0 and batch2["skipped"] == 3, json.dumps(batch2, ensure_ascii=False)[:200])
    check("重复项返回 409", all(i["code"] == 409 for i in batch2["items"]))

    # ── 5. suppression：手动加入 → 拦截 → 移除 → 恢复 ──
    print("== suppression 名单 ==")
    # 用全新岗位 E 验证（岗位 D 在批量阶段已建投递，防重复 409 会先于名单拦截触发）
    job_e = create_job(TOKEN, "后端开发E", "命名网络", "hr-e@name-net.cn")

    r = req("POST", "/api/applications/suppressions", {
        "email": "hr-b@echo-net.com", "detail": "回归：不想再投",
    }, TOKEN)
    check("手动加入名单 201", r.status_code == 201, r.text[:200])
    sup_id = r.json()["id"]

    r = req("GET", "/api/applications/suppressions", token=TOKEN)
    emails_in = [e["email"] for e in r.json()]
    check("名单查询包含新条目", "hr-b@echo-net.com" in emails_in)

    # 对全新岗位 E 用被抑制邮箱投递 → 422 拦截
    r = req("POST", "/api/applications/", {
        "job_image_id": job_e, "recipient_email": "hr-b@echo-net.com",
        "consent_given": True,
    }, TOKEN)
    check("名单内邮箱投递被 422 拦截", r.status_code == 422, f"got {r.status_code} {r.text[:200]}")

    r = req("DELETE", f"/api/applications/suppressions/{sup_id}", token=TOKEN)
    check("移除名单 200", r.status_code == 200)

    r = req("POST", "/api/applications/", {
        "job_image_id": job_e, "recipient_email": "hr-b@echo-net.com",
        "consent_given": True, "cover_letter": "移除名单后重试",
    }, TOKEN)
    check("移除后可正常投递 201", r.status_code == 201, f"got {r.status_code} {r.text[:200]}")
    app_d_id = r.json()["id"] if r.status_code == 201 else None

    # ── 6. 退信 / 回复匹配（纯函数单测，不触网） ──
    print("== 退信/回复匹配（imap_poller.match_inbox_messages） ==")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    from app.services.imap_poller import match_inbox_messages  # noqa: E402

    tracked = [
        {"application_id": "app-1", "provider_message_id": "msg-real-1", "recipient_email": "hr-a@chida-tech.cn"},
        {"application_id": "app-2", "provider_message_id": "dry-run", "recipient_email": "hr-c@quantum-media.cn"},
    ]
    now = datetime.now(timezone.utc)
    messages = [
        {   # HR 回复：引用 app-1 的真实 Message-ID
            "message_id": "<reply-1@echo>", "in_reply_to": "msg-real-1",
            "references": ["msg-real-1"], "from": "HR 张 <hr-a@chida-tech.cn>",
            "subject": "Re: 应聘申请-后端开发A-张三", "date": now,
            "is_bounce": False, "body_snippet": "收到，简历已转交用人部门，下周安排面试。",
        },
        {   # 退信：References 引用 app-1 + mailer-daemon → bounced（同邮件退信语义优先）
            "message_id": "<bounce-1@md>", "in_reply_to": "msg-real-1",
            "references": ["msg-real-1"], "from": "Mail Delivery Subsystem <mailer-daemon@chida-tech.cn>",
            "subject": "Undeliverable: 应聘申请-后端开发A-张三", "date": now,
            "is_bounce": True, "body_snippet": "The following address failed: hr-a@chida-tech.cn",
        },
        {   # 退信：无引用，但正文含收件地址 → 按 recipient 匹配（app-2 dry-run 占位不可被引用）
            "message_id": "<bounce-2@md>", "in_reply_to": "", "references": [],
            "from": "postmaster@quantum-media.cn", "subject": "Delivery Status Notification (Failure)",
            "date": now, "is_bounce": True,
            "body_snippet": "Remote server said: 550 mailbox not found for hr-c@quantum-media.cn",
        },
        {   # 无关邮件 → 不产出动作
            "message_id": "<ad-1@x>", "in_reply_to": "", "references": [],
            "from": "ad@example.com", "subject": "促销邮件", "date": now,
            "is_bounce": False, "body_snippet": "限时优惠",
        },
    ]
    actions = match_inbox_messages(messages, tracked)
    bounced = [a for a in actions if a["action"] == "bounced"]
    replied = [a for a in actions if a["action"] == "replied"]
    check("回复匹配到 app-1", len(replied) == 1 and replied[0]["application_id"] == "app-1",
          json.dumps(actions, ensure_ascii=False, default=str)[:300])
    check("退信匹配 2 条", len(bounced) == 2, json.dumps(actions, ensure_ascii=False, default=str)[:300])
    check("无关邮件不产出动作", all(a["application_id"] in ("app-1", "app-2") for a in actions))
    check("动作携带溯源 message_id", all(a.get("source_message_id") for a in actions))
    # 「退信语义优先」指同一封邮件既是退信又引用 Message-ID 时只产出 bounced：
    # 退信邮件(bounce-1)对 app-1 出 bounced，回复邮件(reply-1)对 app-1 出 replied，互不串扰
    app1_by_src = {a["source_message_id"]: a["action"]
                   for a in actions if a["application_id"] == "app-1"}
    check("同一邮件退信语义优先（退信邮件只出 bounced，回复邮件只出 replied）",
          app1_by_src.get("<bounce-1@md>") == "bounced"
          and app1_by_src.get("<reply-1@echo>") == "replied",
          json.dumps(app1_by_src, ensure_ascii=False)[:200])

    # ── 7. 撤回告知邮件（dry-run 模式 → withdrawal_email=dry-run） ──
    print("== 撤回告知 ==")
    r = req("DELETE", f"/api/applications/{app_d_id}", token=TOKEN) if app_d_id else None
    check("撤回成功且撤回告知 dry-run",
          r is not None and r.status_code == 200 and r.json().get("withdrawal_email") == "dry-run",
          r.text[:200] if r is not None else "app_d_id 缺失")

    # 清理批量投递产生的记录（保持演示库干净）：撤回 A/B/C 与 manual D
    print("== 清理 ==")
    cleaned = 0
    for jid in job_ids[:3]:
        a = apps.get(jid)
        if a:
            rr = req("DELETE", f"/api/applications/{a['id']}", token=TOKEN)
            cleaned += 1 if rr.status_code == 200 else 0
    print(f"  ✅ 清理 {cleaned} 条投递记录")

    print("\n========== 结果 ==========")
    print(f"通过 {PASS} / 失败 {FAIL}")
    if FAILURES:
        print("失败项：", "; ".join(FAILURES))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
