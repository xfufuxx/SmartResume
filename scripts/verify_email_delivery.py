"""阶段1 邮件直投回归：HR 邮箱探测 / 授权闸门 / 限频 / dry-run 发送 / 事件流水 / 重发。

前置：后端已启动（建议以 SMTP_USER/SMTP_PASSWORD 置空方式启动 → 发送自动 dry-run，
不会真正出网），Redis 在线，PostgreSQL 在线。

验证要点：
1. options 暴露投递通道/状态枚举与 smtp_configured。
2. contact-hint：从 JD 文本探测 HR 邮箱 + 额度信息。
3. 邮件直投：recipient_email + consent_given → channel=email，后台发送后
   delivery_status=sent（dry-run），delivery_events 含 queued/sent 事件。
4. 授权闸门：给邮箱不给 consent → 422；非法邮箱 → 422。
5. 防重复投递 409 仍有效。
6. manual 记录模式：不带邮箱 → channel=manual / not_applicable。
7. 重发：已 sent 的记录重发 → 400。
8. 投递轨迹接口返回事件流水。
"""
import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
DEMO = {"email": "demo@smart-resume.com", "password": "Demo@123456"}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

PASSED = 0
FAILED = 0


def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(name, ok, detail=""):
    global PASSED, FAILED
    if ok:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name} | {detail}")


def main():
    print("=" * 66)
    print("阶段1 邮件直投回归（dry-run 模式）")
    print("=" * 66)

    st, data = req("POST", "/api/auth/login", DEMO)
    check("登录演示账号", st == 200 and bool(data.get("access_token")), f"status={st}")
    if st != 200:
        return
    token = data["access_token"]

    # 1) options 暴露通道枚举
    st, opts = req("GET", "/api/applications/options", token=token)
    check("options 返回投递通道/状态枚举",
          st == 200 and "delivery_channels" in opts and "delivery_statuses" in opts,
          f"status={st} keys={list((opts or {}).keys())[:6]}")
    check("options 返回 smtp_configured", "smtp_configured" in (opts or {}), f"{opts}")

    # 2) 创建含 HR 邮箱的测试岗位 → contact-hint 探测
    print("\n[探测] HR 邮箱识别")
    st, job = req("POST", "/api/jobs/create", {
        "title": "邮件直投回归岗", "company": "触达科技",
        # 手动建岗仅持久化 parsed_job_json / ocr_text 不涉及——邮箱须放进 parsed_job_json
        "parsed_job_json": {
            "title": "邮件直投回归岗",
            "company": "触达科技",
            "description": "负责后端开发；简历投递至 hr@chida-tech.cn，标题注明应聘岗位。",
        },
    }, token)
    check("创建含 HR 邮箱的测试岗位", st in (200, 201) and bool(job), f"status={st}")
    job_id = (job or {}).get("id")

    st, hint = req("GET", f"/api/applications/contact-hint/{job_id}", token=token)
    check("contact-hint 返回结构完整",
          st == 200 and all(k in hint for k in ("email", "smtp_configured", "daily_limit", "sent_today")),
          f"status={st} hint={hint}")
    check("从 JD 探测出 HR 邮箱", (hint or {}).get("email") == "hr@chida-tech.cn",
          f"email={(hint or {}).get('email')}")

    # 3) 邮件直投（授权 + dry-run 发送）
    print("\n[直投] 邮件通道 + 授权闸门")
    st, resp = req("POST", "/api/applications/", {
        "job_image_id": job_id,
        "recipient_email": "hr@chida-tech.cn",
        "consent_given": True,
        "cover_letter": "回归测试附言",
    }, token)
    check("邮件直投创建成功(201)", st == 201, f"status={st} body={resp}")
    app_id = (resp or {}).get("id")
    check("channel=email", (resp or {}).get("channel") == "email", f"{(resp or {}).get('channel')}")
    check("delivery_status 初始 pending", (resp or {}).get("delivery_status") == "pending",
          f"{(resp or {}).get('delivery_status')}")
    check("consent_at 已记录", bool((resp or {}).get("consent_at")), f"{(resp or {}).get('consent_at')}")

    # 等待后台任务完成（dry-run 同步链路通常 <1s，放宽到 5s）
    delivered = None
    for _ in range(10):
        time.sleep(0.5)
        st, cur = req("GET", f"/api/applications/{app_id}", token=token)
        if (cur or {}).get("delivery_status") in ("sent", "failed"):
            delivered = cur
            break
    check("后台发送完成 delivery_status=sent(dry-run)",
          (delivered or {}).get("delivery_status") == "sent",
          f"delivery_status={(delivered or {}).get('delivery_status')}")
    check("sent_at 已回写", bool((delivered or {}).get("sent_at")), f"{(delivered or {}).get('sent_at')}")

    # 4) 授权闸门与校验
    st, job2 = req("POST", "/api/jobs/create", {
        "title": "邮件直投回归岗B", "company": "触达科技",
        "responsibilities": "无邮箱岗位",
    }, token)
    job2_id = (job2 or {}).get("id")
    st, resp = req("POST", "/api/applications/", {
        "job_image_id": job2_id, "recipient_email": "hr@chida-tech.cn", "consent_given": False,
    }, token)
    check("未授权(consent=false)→422", st == 422, f"status={st} body={resp}")

    st, resp = req("POST", "/api/applications/", {
        "job_image_id": job2_id, "recipient_email": "bad-email", "consent_given": True,
    }, token)
    check("非法邮箱→422", st == 422, f"status={st} body={resp}")

    st, resp = req("POST", "/api/applications/", {"job_image_id": job_id}, token)
    check("重复投递→409", st == 409, f"status={st}")

    # 5) manual 记录模式
    st, resp = req("POST", "/api/applications/", {"job_image_id": job2_id}, token)
    check("无邮箱→manual 记录模式(201)",
          st == 201 and (resp or {}).get("channel") == "manual"
          and (resp or {}).get("delivery_status") == "not_applicable",
          f"status={st} channel={(resp or {}).get('channel')} ds={(resp or {}).get('delivery_status')}")
    manual_id = (resp or {}).get("id")

    # 6) 投递轨迹
    print("\n[轨迹] 事件流水与重发")
    st, events = req("GET", f"/api/applications/{app_id}/delivery-events", token=token)
    types = {e.get("event_type") for e in (events or [])}
    check("事件流水含 queued+sent", st == 200 and {"queued", "sent"} <= types,
          f"status={st} types={types}")

    st, resp = req("POST", f"/api/applications/{app_id}/resend", token=token)
    check("已送达记录重发→400", st == 400, f"status={st} body={resp}")

    st, resp = req("POST", f"/api/applications/{manual_id}/resend", token=token)
    check("manual 记录重发→400", st == 400, f"status={st} body={resp}")

    # 7) 清理测试数据
    print("\n[清理]")
    for aid in (app_id, manual_id):
        st, _ = req("DELETE", f"/api/applications/{aid}", token=token)
        check(f"撤回测试投递 {aid[:8]}", st == 200, f"status={st}")
    for jid in (job_id, job2_id):
        st, _ = req("DELETE", f"/api/jobs/{jid}", token=token)
        check(f"删除测试岗位 {jid[:8]}", st in (200, 204), f"status={st}")

    print("\n" + "=" * 66)
    print(f"结果: {PASSED} 通过 / {FAILED} 失败")
    print("=" * 66)
    raise SystemExit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
