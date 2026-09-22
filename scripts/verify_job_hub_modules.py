"""求职管理三模块回归：岗位库 / 投递 / 面试追踪枢纽（投递记录 + 面试进度 + 沟通消息）。

验证要点：
1. 岗位库保持纯净：岗位数据不再携带任何投递流程状态字段。
2. 一键投递：创建、防重复(409)、联系方式自动取自个人资料。
3. 面试追踪枢纽：
   - 投递记录：列表 / 统计 / 状态推进 / 撤回
   - 面试进度：手动录入 / 列表 / 统计
   - 沟通消息：可关联投递并自动快照公司职位 / 方向渠道 / 列表 / 统计 / 删除
4. 模块边界：岗位库与过程性数据互不干扰。
"""
import json
import urllib.error
import urllib.parse
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
    print("求职管理三模块回归：岗位库 / 投递 / 面试追踪枢纽")
    print("=" * 66)

    # 登录
    st, data = req("POST", "/api/auth/login", DEMO)
    check("登录演示账号", st == 200 and bool(data.get("access_token")), f"status={st}")
    if st != 200:
        print("登录失败，终止")
        return
    token = data["access_token"]

    # ── 模块一：岗位库（纯仓库） ──
    print("\n[模块1] 岗位库 = 纯仓库")
    st, created = req("POST", "/api/jobs/create", {
        "title": "前端工程师(回归测试)", "company": "回归科技",
        "salary_range": "25K-40K", "location": "深圳", "industry": "互联网",
        "responsibilities": "负责前端开发", "must_have": {"skills": ["React"]},
    }, token)
    check("创建测试岗位", st in (200, 201) and bool(created), f"status={st}")
    job_id = (created or {}).get("id")

    st, job_list = req("GET", "/api/jobs/", token=token)
    check("岗位库列表可拉取", st == 200 and isinstance(job_list, list), f"status={st}")

    # 纯净性：岗位数据不应出现投递/面试流程状态字段
    sample = {}
    if isinstance(job_list, list):
        for j in job_list:
            if isinstance(j, dict):
                sample = j.get("parsed_job_json") or {}
                break
    forbidden = [k for k in ("status", "application_status", "interview_stage", "apply_status")
                 if k in sample]
    check("岗位库数据无投递/面试流程状态字段", not forbidden, f"出现字段={forbidden}")

    # ── 模块二：一键投递 ──
    print("\n[模块2] 一键投递")
    st, app1 = req("POST", "/api/applications/", {"job_image_id": job_id}, token)
    check("一键投递（仅传岗位即可）", st in (200, 201) and bool(app1), f"status={st}")
    app_id = (app1 or {}).get("id")

    check("投递状态默认 submitted", (app1 or {}).get("status") == "submitted",
          f"status={(app1 or {}).get('status')}")

    # 联系方式自动从个人资料带出（不要求前端提交）
    st, me = req("GET", "/api/user/profile", token=token)
    profile_email = (me or {}).get("email", "") if isinstance(me, dict) else ""
    check("投递邮箱自动取自个人资料",
          bool((app1 or {}).get("email")) and (app1 or {}).get("email") == profile_email,
          f"app={(app1 or {}).get('email')} profile={profile_email}")

    # 防重复投递
    st, dup = req("POST", "/api/applications/", {"job_image_id": job_id}, token)
    check("重复投递被拦截(409)", st == 409, f"status={st} detail={dup}")

    st, applied_ids = req("GET", "/api/applications/applied-job-ids", token=token)
    check("已投递岗位集合含该岗位", job_id in (applied_ids or []), f"ids={applied_ids}")

    # ── 模块三：面试追踪枢纽 ──
    print("\n[模块3] 面试追踪枢纽")

    # 3.1 投递记录
    st, app_list = req("GET", "/api/applications/", token=token)
    check("投递记录列表", st == 200 and isinstance(app_list, list), f"status={st}")

    st, app_stats = req("GET", "/api/applications/stats", token=token)
    check("投递统计", st == 200 and (app_stats or {}).get("total", 0) >= 1,
          f"status={st} stats={app_stats}")

    st, updated = req("PUT", f"/api/applications/{app_id}",
                      {"job_image_id": job_id, "status": "interview"}, token)
    check("推进投递状态为面试中", st == 200 and (updated or {}).get("status") == "interview",
          f"status={st}")

    # 3.2 面试进度（手动录入）
    st, track = req("POST", "/api/interview-tracks/", {
        "company": "回归科技", "position": "前端工程师(回归测试)",
        "stage": "一面", "mode": "线上", "status": "scheduled",
        "interview_time": "2026-09-25T10:00:00", "job_image_id": job_id,
    }, token)
    check("手动录入面试记录", st in (200, 201) and bool(track), f"status={st}")
    track_id = (track or {}).get("id")

    st, track_stats = req("GET", "/api/interview-tracks/stats", token=token)
    check("面试统计", st == 200 and (track_stats or {}).get("total", 0) >= 1,
          f"status={st} stats={track_stats}")

    # 3.3 沟通消息（关联投递，自动快照公司/职位）
    st, comm = req("POST", "/api/communications/", {
        "application_id": app_id, "direction": "in", "channel": "phone",
        "content": "HR 来电，确认下周五上午线上面试",
    }, token)
    check("新增沟通消息（关联投递）", st in (200, 201) and bool(comm), f"status={st}")
    comm_id = (comm or {}).get("id")

    check("公司自动从关联投递快照", (comm or {}).get("company") == "回归科技",
          f"company={(comm or {}).get('company')}")
    check("沟通方向正确", (comm or {}).get("direction") == "in", f"dir={(comm or {}).get('direction')}")

    st, comm_list = req("GET", "/api/communications/", token=token)
    check("沟通消息列表", st == 200 and len(comm_list or []) >= 1, f"status={st}")

    st, comm_by_app = req("GET", f"/api/communications/?{urllib.parse.urlencode({'application_id': app_id})}", token=token)
    check("按投递过滤沟通消息", st == 200 and len(comm_by_app or []) == 1, f"count={len(comm_by_app or [])}")

    st, comm_stats = req("GET", "/api/communications/stats", token=token)
    check("沟通统计", st == 200 and (comm_stats or {}).get("total", 0) >= 1,
          f"stats={comm_stats}")

    # 未关联投递且无公司名 → 422
    st, bad = req("POST", "/api/communications/", {
        "direction": "out", "channel": "email", "content": "缺少公司名",
    }, token)
    check("缺公司名/投递被拒(422)", st == 422, f"status={st}")

    # ── 边界：删除面试记录不影响岗位库与沟通 ──
    print("\n[边界] 模块互不干扰")
    st, _ = req("DELETE", f"/api/interview-tracks/{track_id}", token=token)
    check("删除面试记录成功", st == 200, f"status={st}")

    st, job_list2 = req("GET", "/api/jobs/", token=token)
    still = isinstance(job_list2, list) and any(
        isinstance(j, dict) and j.get("id") == job_id for j in job_list2
    )
    check("删除面试记录后岗位库仍在", st == 200 and still, f"status={st}")

    st, comm_list2 = req("GET", "/api/communications/", token=token)
    check("删除面试记录不影响沟通消息", st == 200 and len(comm_list2 or []) >= 1, f"status={st}")

    # 清理测试数据
    print("\n[清理]")
    if comm_id:
        req("DELETE", f"/api/communications/{comm_id}", token=token)
    if app_id:
        req("DELETE", f"/api/applications/{app_id}", token=token)
    req("DELETE", f"/api/jobs/{job_id}", token=token)
    print("  已清理测试岗位 / 投递 / 沟通记录")

    print("\n" + "=" * 66)
    print(f"结果：{PASSED} 通过 / {FAILED} 失败")
    print("=" * 66)


if __name__ == "__main__":
    main()
