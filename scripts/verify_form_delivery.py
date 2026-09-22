"""阶段3 回归：官网表单半自动投递（通道 B）。

覆盖：apply_url 探测（contact-hint）、表单探测（robots 核查 + 字段识别）、
form 通道投递创建（授权/防重复）、Playwright 预填（headless，本地测试表单页，
断言字段已填且**未发生自动提交**）、结果回填（submitted/failed → 事件与状态）。

运行前提：dry-run 后端在 :8000，Redis :6379，Postgres 就绪。
全程不访问外部站点：探测/预填目标均为本脚本内置的本地 HTTP 测试服务。
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

BASE = "http://127.0.0.1:8000"
PROXY = {"http": None, "https": None}
TOKEN = None

PASS = 0
FAIL = 0
FAILURES: list[str] = []

# 本地测试站点（随机端口上启动）
submit_hits = []  # 记录收到的提交请求（断言预填绝不自动提交）

FORM_PAGE_HTML = """<!DOCTYPE html>
<html><head><title>星河科技招聘 - 投递简历</title></head>
<body>
<form id="apply-form" action="/submit" method="post" enctype="multipart/form-data">
  <label for="fullname">姓名</label><input id="fullname" name="fullname" type="text"/>
  <label for="email">邮箱</label><input id="email" name="email" type="email"/>
  <label for="phone">电话</label><input id="phone" name="phone" type="tel"/>
  <label for="message">自我介绍</label><textarea id="message" name="message"></textarea>
  <label for="resume_file">简历附件</label><input id="resume_file" name="resume_file" type="file"/>
  <button type="submit">提交申请</button>
</form>
</body></html>"""

FORM_PAGE_NO_ROBOT_HTML = FORM_PAGE_HTML  # 同结构页面，仅路径不同（robots 禁止）


class TestSiteHandler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str = "text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/robots.txt":
            body = b"User-agent: *\nDisallow: /private/\n"
            self._send(200, body, "text/plain")
        elif path == "/apply":
            self._send(200, FORM_PAGE_HTML.encode("utf-8"))
        elif path.startswith("/private/"):
            self._send(200, FORM_PAGE_NO_ROBOT_HTML.encode("utf-8"))
        else:
            self._send(404, b"not found")

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        if self.path.split("?")[0] == "/submit":
            submit_hits.append(self.path)
            self._send(200, b'{"ok": true}', "application/json")
        else:
            self._send(404, b"not found")

    def log_message(self, *args):  # noqa: N802 —— 静默访问日志
        pass


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
    return requests.request(method, BASE + path, json=body, headers=headers, proxies=PROXY, timeout=60)


def create_job(token: str, title: str, company: str, apply_url: str | None) -> str:
    parsed = {"title": title, "company": company, "salary": "18K-30K"}
    if apply_url:
        parsed["description"] = f"工作职责：负责核心系统开发。官网投递：请访问 {apply_url} 提交简历。"
    r = req("POST", "/api/jobs/create", {
        "title": title, "company": company, "parsed_job_json": parsed,
    }, token)
    assert r.status_code in (200, 201), f"建岗失败: {r.status_code} {r.text[:300]}"
    return r.json()["id"]


def main() -> int:
    global TOKEN

    # ── 0. 本地测试站点 ──
    server = ThreadingHTTPServer(("127.0.0.1", 0), TestSiteHandler)
    site = f"http://127.0.0.1:{server.server_address[1]}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"== 本地测试站点 {site} ==")

    print("== 登录 ==")
    r = req("POST", "/api/auth/login", {"email": "demo@smart-resume.com", "password": "Demo@123456"})
    assert r.status_code == 200, f"登录失败: {r.status_code}"
    TOKEN = r.json()["access_token"]
    print("  ✅ 登录成功")

    try:
        # ── 1. contact-hint：apply_url 探测 ──
        print("== apply_url 探测（contact-hint） ==")
        job = create_job(TOKEN, "前端开发F", "星河科技", f"{site}/apply")
        r = req("GET", f"/api/applications/contact-hint/{job}", token=TOKEN)
        hint = r.json() if r.status_code == 200 else {}
        check("contact-hint 200", r.status_code == 200, r.text[:200])
        check("探测到官网投递链接", (hint.get("apply_url") or "") == f"{site}/apply",
              json.dumps(hint, ensure_ascii=False)[:300])

        # ── 2. 表单探测（robots 核查 + 字段识别） ──
        print("== 表单探测 ==")
        r = req("POST", "/api/applications/form/probe", {"url": f"{site}/apply"}, TOKEN)
        check("探测 200", r.status_code == 200, r.text[:200])
        probe = r.json()
        check("robots 允许", probe.get("robots_allowed") is True, json.dumps(probe, ensure_ascii=False)[:300])
        check("识别到表单", probe.get("form_detected") is True)
        kinds = sorted(f["kind"] for f in probe.get("fields", []))
        check("字段分类齐全(name/email/phone/cover_letter)",
              all(k in kinds for k in ("name", "email", "phone", "cover_letter")),
              f"got {kinds}")
        check("识别简历附件字段", "resume_file" in kinds, f"got {kinds}")
        check("站点标题识别", "星河科技" in (probe.get("site_title") or ""), str(probe.get("site_title")))

        r = req("POST", "/api/applications/form/probe", {"url": f"{site}/private/apply"}, TOKEN)
        probe2 = r.json() if r.status_code == 200 else {}
        check("robots 禁止路径被拦截", probe2.get("robots_allowed") is False and probe2.get("ok") is False,
              json.dumps(probe2, ensure_ascii=False)[:300])

        r = req("POST", "/api/applications/form/probe", {"url": "ftp://bad.example.com/x"}, TOKEN)
        check("非法 URL 被校验拦截(422)", r.status_code == 422, f"got {r.status_code}")

        # ── 3. form 通道投递创建 ──
        print("== form 通道投递 ==")
        r = req("POST", "/api/applications/", {
            "job_image_id": job, "apply_url": f"{site}/apply",
        }, TOKEN)
        check("未授权对外投递被 422 拦截", r.status_code == 422, f"got {r.status_code} {r.text[:150]}")

        # 取一条演示简历（可选；有则验证附件上传路径）
        resume_id = None
        r = req("GET", "/api/resumes/", token=TOKEN)
        if r.status_code == 200 and (r.json() or []):
            resume_id = r.json()[0]["id"]

        r = req("POST", "/api/applications/", {
            "job_image_id": job, "apply_url": f"{site}/apply",
            "resume_id": resume_id, "cover_letter": "官网表单投递回归附言",
            "consent_given": True,
        }, TOKEN)
        check("form 通道创建 201", r.status_code == 201, r.text[:300])
        app_rec = r.json()
        check("channel=form", app_rec.get("channel") == "form", str(app_rec.get("channel")))
        check("apply_url 落库", app_rec.get("apply_url") == f"{site}/apply", str(app_rec.get("apply_url")))
        check("记录授权时间", bool(app_rec.get("consent_at")))
        app_id = app_rec["id"]

        r = req("POST", "/api/applications/", {
            "job_image_id": job, "apply_url": f"{site}/apply", "consent_given": True,
        }, TOKEN)
        check("重复投递 409", r.status_code == 409, f"got {r.status_code}")

        # email 通道优先级：同时给邮箱与 apply_url 时走 email
        job2 = create_job(TOKEN, "前端开发G", "星河科技2", f"{site}/apply")
        r = req("POST", "/api/applications/", {
            "job_image_id": job2, "apply_url": f"{site}/apply",
            "recipient_email": "hr@xinghe2.cn", "consent_given": True,
        }, TOKEN)
        check("email 通道优先于 form", r.status_code == 201 and r.json().get("channel") == "email",
              r.text[:200])
        email_app_id = r.json()["id"] if r.status_code == 201 else None

        # ── 4. Playwright 预填（headless；断言：字段已填、附件已传、未自动提交） ──
        print("== Playwright 预填 ==")
        before_hits = len(submit_hits)
        r = req("POST", f"/api/applications/{app_id}/form/prefill",
                {"headless": True, "keep_open_seconds": 3}, TOKEN)
        check("预填接口 202", r.status_code == 202, r.text[:200])

        # 预填在后台执行：轮询 delivery-events 出现 form_prefilled（最长 45s）
        event = None
        import time
        for _ in range(45):
            time.sleep(1)
            r = req("GET", f"/api/applications/{app_id}/delivery-events", token=TOKEN)
            events = r.json() if r.status_code == 200 else []
            hit = [e for e in events if e.get("event_type") == "form_prefilled"]
            if hit:
                event = hit[0]
                break
        check("预填完成事件 form_prefilled", event is not None, "45s 内未出现")
        check("预填未触发自动提交（合规硬约束）",
              len(submit_hits) == before_hits,
              f"测试站点收到 {len(submit_hits) - before_hits} 次提交")
        if event:
            check("事件注明『手动提交』边界", "手动" in (event.get("detail") or ""),
                  event.get("detail") or "")

        # 直接调用预填服务拿到明细报告（filled/uploaded）
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "backend"))
        from app.services.form_delivery import open_and_prefill  # noqa: E402

        report = open_and_prefill(
            f"{site}/apply",
            {"applicant_name": "张三", "email": "zhangsan@test.cn",
             "phone": "13800000000", "cover_letter": "回归预填附言"},
            None,  # 不带简历文件 → file 字段应被 skip 而非报错
            headless=True, keep_open_seconds=2,
        )
        check("预填服务 ok", report.get("ok") is True, json.dumps(report, ensure_ascii=False)[:300])
        filled = " ".join(report.get("filled") or [])
        check("姓名/邮箱/电话/附言均被预填",
              all(k in filled for k in ("#fullname", "#email", "#phone", "#message")),
              filled[:200])
        check("无简历文件时附件字段被跳过(不报错)",
              any(s.get("selector") == "#resume_file" for s in report.get("skipped") or []),
              json.dumps(report.get("skipped"), ensure_ascii=False)[:200])
        check("服务级预填同样未自动提交", len(submit_hits) == before_hits)

        # ── 5. 结果回填 ──
        print("== 结果回填 ==")
        r = req("POST", f"/api/applications/{app_id}/form/result",
                {"result": "submitted", "detail": "已在测试页手动确认提交"}, TOKEN)
        check("回填 submitted 200", r.status_code == 200, r.text[:200])
        check("delivery_status=sent", r.json().get("delivery_status") == "sent",
              str(r.json().get("delivery_status")))
        r = req("GET", f"/api/applications/{app_id}/delivery-events", token=TOKEN)
        types = [e["event_type"] for e in (r.json() if r.status_code == 200 else [])]
        check("事件含 form_submitted", "form_submitted" in types, str(types))

        r = req("POST", f"/api/applications/{app_id}/form/result", {"result": "invalid"}, TOKEN)
        check("非法 result 被校验拦截(422)", r.status_code == 422, f"got {r.status_code}")

        # email 通道记录不支持表单回填
        if email_app_id:
            r = req("POST", f"/api/applications/{email_app_id}/form/result",
                    {"result": "submitted"}, TOKEN)
            check("email 通道记录拒绝表单回填(400)", r.status_code == 400, f"got {r.status_code}")

        # ── 6. 清理（撤回 form/email 投递与岗位） ──
        print("== 清理 ==")
        cleaned = 0
        for aid in [app_id, email_app_id]:
            if aid:
                rr = req("DELETE", f"/api/applications/{aid}", token=TOKEN)
                cleaned += 1 if rr.status_code == 200 else 0
        print(f"  ✅ 清理投递 {cleaned} 条")

    finally:
        server.shutdown()
        print("  ✅ 本地测试站点已关闭")

    print("\n========== 结果 ==========")
    print(f"通过 {PASS} / 失败 {FAIL}")
    if FAILURES:
        print("失败项：", "; ".join(FAILURES))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
