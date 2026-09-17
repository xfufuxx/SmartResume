"""端到端验证「停止优化」：创建异步任务 -> 立即取消 -> 校验状态与无残留记录。

只读 + 一次创建/取消，不触碰用户数据以外的东西；用于回归自检，可重复执行。
用法：backend/.venv/Scripts/python.exe scripts/verify_cancel_flow.py
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"


def call(method, path, token=None, body=None, timeout=30):
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

    status, res = call("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
    if status != 200:
        print(f"登录失败 {status}: {res}")
        return 1
    token = res["access_token"]
    print(f"登录成功（user={res.get('user', {}).get('id') or res.get('user_id')}）")

    _, rl = call("GET", "/api/resumes/", token)
    resumes = rl.get("data") if isinstance(rl, dict) else rl
    resumes = resumes or []
    check("简历库有可用简历", len(resumes) > 0, f"{len(resumes)} 份")
    if not resumes:
        return 1
    resume_id = resumes[0]["id"]

    _, jl = call("GET", "/api/jobs/", token)
    jobs = jl.get("data") if isinstance(jl, dict) else jl
    jobs = jobs or []
    check("岗位库有可用岗位", len(jobs) > 0, f"{len(jobs)} 个")
    if not jobs:
        return 1
    job_id = jobs[0]["id"]

    # 取消前后的优化记录数：用于确认中断不会留下半成品
    _, before = call("GET", "/api/optimize/", token)
    before_list = before.get("data") if isinstance(before, dict) else before
    before_n = len(before_list or [])

    status, task = call(
        "POST", "/api/optimize/async", token,
        {"resume_id": resume_id, "job_image_id": job_id, "template": "professional"},
    )
    check("创建异步优化任务", status in (200, 201), f"http={status}")
    if status not in (200, 201):
        print("返回：", task)
        return 1
    task_id = task.get("task_id") or task.get("id")
    check("返回 task_id", bool(task_id), task_id)

    # 立刻取消：覆盖「任务刚提交、还在跑」的窗口
    status, cancel = call("POST", f"/api/optimize/async/{task_id}/cancel", token)
    check("取消接口返回 200", status == 200, f"http={status} body={cancel}")
    if status == 200:
        check("取消后状态为 cancelled", cancel.get("status") == "cancelled", cancel.get("status"))
        check("cancelled 标记为 True", cancel.get("cancelled") is True, cancel.get("cancelled"))

    # 再查一次：任务状态应稳定停在 cancelled，而不是被后台任务改回 processing/completed
    time.sleep(2)
    status, after_status = call("GET", f"/api/optimize/async/{task_id}", token)
    if status == 200:
        st = after_status.get("status")
        check("轮询到的状态为 cancelled", st == "cancelled", st)
    elif status == 404:
        check("任务记录已清理（等价于已停止）", True, "404")
    else:
        check("查询任务状态", False, f"http={status}")

    # 幂等：重复取消不应报错
    status, again = call("POST", f"/api/optimize/async/{task_id}/cancel", token)
    check("重复取消幂等（不报错）", status in (200, 404), f"http={status}")

    # 等后台任务收尾后，确认没有写库留下半成品
    time.sleep(3)
    _, after = call("GET", "/api/optimize/", token)
    after_list = after.get("data") if isinstance(after, dict) else after
    after_n = len(after_list or [])
    check("中断未留下历史记录", after_n == before_n, f"取消前 {before_n} 条 -> 取消后 {after_n} 条")

    # 归属校验：他人任务不可取消（用一个不存在的 id 验证越权路径返回 404）
    status, foreign = call("POST", "/api/optimize/async/not-a-real-task/cancel", token)
    check("不存在的任务返回 404", status == 404, f"http={status}")

    print("\n结论：" + ("全部通过" if ok else "存在失败项"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
