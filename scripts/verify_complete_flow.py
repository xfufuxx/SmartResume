"""回归验证「正常完成」路径未被取消能力破坏：任务应能跑完并落库一条记录。

用法：backend/.venv/Scripts/python.exe scripts/verify_complete_flow.py
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"


def call(method, path, token=None, body=None, timeout=60):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def main():
    ok = True

    def check(label, cond, extra=""):
        nonlocal ok
        mark = "PASS" if cond else "FAIL"
        if not cond:
            ok = False
        print(f"[{mark}] {label}{(' -> ' + str(extra)) if extra else ''}")

    _, res = call("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
    token = res["access_token"]
    print("登录成功")

    _, rl = call("GET", "/api/resumes/", token)
    resumes = (rl.get("data") if isinstance(rl, dict) else rl) or []
    _, jl = call("GET", "/api/jobs/", token)
    jobs = (jl.get("data") if isinstance(jl, dict) else jl) or []
    resume_id, job_id = resumes[0]["id"], jobs[0]["id"]

    _, before = call("GET", "/api/optimize/", token)
    before_n = len(((before.get("data") if isinstance(before, dict) else before) or []))

    status, task = call(
        "POST", "/api/optimize/async", token,
        {"resume_id": resume_id, "job_image_id": job_id, "template": "professional"},
    )
    check("创建任务", status in (200, 201), f"http={status}")
    task_id = task.get("task_id")

    final = None
    for i in range(90):          # 最长等 180s
        time.sleep(2)
        st, info = call("GET", f"/api/optimize/async/{task_id}", token)
        if st != 200:
            check("轮询任务状态", False, f"http={st}")
            return 1
        final = info
        if info.get("status") in ("completed", "failed", "cancelled"):
            print(f"  任务在约 {(i + 1) * 2}s 后进入 {info['status']}")
            break

    check("任务进入 completed", final and final.get("status") == "completed", final and final.get("status"))
    if not final or final.get("status") != "completed":
        print("  最终状态详情：", json.dumps(final, ensure_ascii=False)[:400])
        return 1

    r = final.get("result") or {}
    check("结果含 optimized_json", bool(r.get("optimized_json")))
    check("结果含 match_score", r.get("match_score") is not None, r.get("match_score"))
    check("结果含记录 id", bool(r.get("id")), r.get("id"))

    _, after = call("GET", "/api/optimize/", token)
    after_list = ((after.get("data") if isinstance(after, dict) else after) or [])
    check("完成时正常写入一条记录", len(after_list) == before_n + 1, f"{before_n} -> {len(after_list)}")

    print("\n结论：" + ("正常完成路径完好" if ok else "存在失败项"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
