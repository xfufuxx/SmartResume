"""投递申请（applications）功能回归脚本（招聘软件式一键投递版）。

用演示账号走完整流程：登录 → 创建岗位 → 一键投递（仅岗位+附言）→
校验联系方式自动取自个人资料 → 防重复(409) → 缺岗位(422) → 列表 → 统计 →
check → applied-job-ids → 更新状态 → 撤回(删除)。全部断言通过后清理测试数据。

运行：backend/.venv/Scripts/python.exe scripts/verify_applications_flow.py
"""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
DEMO_EMAIL = "demo@smart-resume.com"
DEMO_PASSWORD = "Demo@123456"

_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 绕过本机 http_proxy


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with _opener.open(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode() or "{}")
        except Exception:
            payload = {}
        return e.code, payload


results = []


def check(name, cond, extra=""):
    results.append((name, cond, extra))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f"  -> {extra}" if extra and not cond else ""))


def main():
    # 1) 登录
    st, login = call("POST", "/api/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    check("登录成功(200)", st == 200, f"status={st}")
    if st != 200:
        print("登录失败，无法继续"); sys.exit(1)
    token = login["access_token"]

    # 清理：删除演示账号既有投递，保证计数确定
    st, lst = call("GET", "/api/applications/", token=token)
    for a in (lst or []):
        call("DELETE", f"/api/applications/{a['id']}", token=token)

    # 2) 创建一个临时岗位用于投递
    st, job = call("POST", "/api/jobs/create", token=token,
                   body={"title": "【回归测试】后端工程师", "company": "回归科技公司", "category": "开发"})
    check("创建测试岗位(200/201)", st in (200, 201), f"status={st}")
    job_id = job["id"]

    try:
        # 3) 一键投递（仅岗位 + 选填附言，联系方式由后端从资料带出）
        payload = {
            "job_image_id": job_id,
            "resume_id": None,
            "cover_letter": "请考虑我的申请",
        }
        st, created = call("POST", "/api/applications/", token=token, body=payload)
        check("一键投递创建(201)", st == 201, f"status={st} detail={created.get('detail') if isinstance(created, dict) else ''}")
        check("返回含岗位标题快照", created.get("job_title") == "【回归测试】后端工程师", str(created.get("job_title")))
        # 联系方式应自动取自演示账号个人资料
        check("邮箱自动取自个人资料", created.get("email") == DEMO_EMAIL, str(created.get("email")))
        app_id = created.get("id")

        # 4) 防重复投递（409）
        st2, dup = call("POST", "/api/applications/", token=token, body=payload)
        check("重复投递拦截(409)", st2 == 409, f"status={st2}")

        # 5) 缺岗位 ID（422）
        st3, _ = call("POST", "/api/applications/", token=token, body={"cover_letter": "x"})
        check("缺岗位ID(422)", st3 == 422, f"status={st3}")

        # 6) 列表
        st, lst = call("GET", "/api/applications/", token=token)
        check("列表返回1条", st == 200 and len(lst or []) == 1, f"count={len(lst or [])}")

        # 7) 统计
        st, stats = call("GET", "/api/applications/stats", token=token)
        check("统计 total=1", stats.get("total") == 1, str(stats))
        check("统计 submitted=1", stats.get("by_status", {}).get("submitted") == 1, str(stats.get("by_status")))

        # 8) check 接口
        st, chk = call("GET", f"/api/applications/check/{job_id}", token=token)
        check("check 已投递=true", chk.get("applied") is True, str(chk))

        # 9) applied-job-ids
        st, ids = call("GET", "/api/applications/applied-job-ids", token=token)
        check("applied-job-ids 含该岗位", job_id in (ids or []), str(ids))

        # 10) 更新状态（邀面试）
        upd = {"status": "interview", "cover_letter": "已约面试"}
        st, upd_res = call("PUT", f"/api/applications/{app_id}", token=token, body=upd)
        check("更新状态(200)", st == 200 and upd_res.get("status") == "interview", f"status={st} -> {upd_res.get('status')}")
        st, stats = call("GET", "/api/applications/stats", token=token)
        check("统计 interview=1", stats.get("by_status", {}).get("interview") == 1, str(stats.get("by_status")))

        # 11) 撤回投递（删除）
        st, _ = call("DELETE", f"/api/applications/{app_id}", token=token)
        check("撤回投递(200)", st == 200, f"status={st}")
        st, lst = call("GET", "/api/applications/", token=token)
        check("撤回后列表为空", len(lst or []) == 0, f"count={len(lst or [])}")

    finally:
        # 清理测试岗位（级联清除其投递）
        call("DELETE", f"/api/jobs/{job_id}", token=token)
        print("已清理测试岗位")

    failed = [r for r in results if not r[1]]
    print(f"\n==== 结果：{len(results)-len(failed)}/{len(results)} 通过 ====")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
