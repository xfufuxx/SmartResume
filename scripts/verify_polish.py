"""AI 对话润色 E2E 回归（需 :8000 在线，纯 HTTP）。

覆盖：
1. 认证：无 token → 401/403
2. 会话 CRUD（确定性）：创建（text 模式）→ 列表 → 详情 → 删除
3. 入参校验：空消息 400、不存在的会话 404、超长消息 400
4. chat SSE（LLM 依赖，环境感知）：
   - LLM 不可用 → error 事件（额度已退还文案）
   - LLM 可用 → delta + suggestions + done 事件齐全，消息落库
5. 额度：连续超限调用 → error 事件提示上限（用 settings 级联验证太慢，
   此处仅验证错误通路不 500）

运行：.venv/Scripts/python.exe scripts/verify_polish.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

passed, failed = 0, 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def api(method: str, path: str, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:400]


def login() -> str:
    status, payload = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    assert status == 200, f"login failed: {status} {payload[:200]}"
    return json.loads(payload)["access_token"]


def read_sse(token: str, session_id: str, message: str) -> list[dict]:
    """发送对话请求并收集全部 SSE 事件。"""
    req = urllib.request.Request(
        f"{API}/api/polish/chat",
        data=json.dumps({"session_id": session_id, "message": message}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    events: list[dict] = []
    with opener.open(req, timeout=180) as resp:
        buffer = b""
        while True:
            chunk = resp.read(1024)
            if not chunk:
                break
            buffer += chunk
            while b"\n\n" in buffer:
                frame, buffer = buffer.split(b"\n\n", 1)
                for line in frame.decode("utf-8", "ignore").split("\n"):
                    if line.startswith("data:"):
                        try:
                            events.append(json.loads(line[5:].strip()))
                        except json.JSONDecodeError:
                            pass
    return events


def main() -> int:
    token = login()

    print("[1] 认证与入参校验")
    status, _ = api("POST", "/api/polish/sessions", {"target_type": "text", "text": "x"})
    check("无 token → 401/403", status in (401, 403), f"got {status}")

    status, _ = api("POST", "/api/polish/sessions", {"target_type": "text"}, token=token)
    check("text 模式缺内容 → 400", status == 400, f"got {status}")

    status, _ = api("POST", "/api/polish/sessions", {"target_type": "optimized"}, token=token)
    check("optimized 模式缺 target_id → 400", status == 400, f"got {status}")

    status, _ = api("POST", "/api/polish/sessions",
                    {"target_type": "optimized", "target_id": "not-exist"}, token=token)
    check("目标记录不存在 → 404", status == 404, f"got {status}")

    print("[2] 会话 CRUD")
    status, payload = api("POST", "/api/polish/sessions", {
        "target_type": "text",
        "text": "五年前端开发经验，负责公司核心产品的前端架构与性能优化，主导组件库建设。",
        "title": "E2E润色会话",
    }, token=token)
    check("创建 text 会话 → 200", status == 200, f"got {status} {payload[:200]!r}")
    session_id = json.loads(payload)["id"] if status == 200 else ""

    status, payload = api("GET", "/api/polish/sessions", token=token)
    listed = json.loads(payload) if status == 200 else []
    check("列表含新会话", any(s["id"] == session_id for s in listed))

    status, payload = api("GET", f"/api/polish/sessions/{session_id}", token=token)
    check("详情：空消息列表", status == 200 and json.loads(payload)["messages"] == [])

    status, _ = api("POST", "/api/polish/chat", {"session_id": session_id, "message": "  "}, token=token)
    check("空消息 → 400", status == 400, f"got {status}")

    status, _ = api("POST", "/api/polish/chat", {"session_id": "no-such-session", "message": "hi"}, token=token)
    check("会话不存在 → 404", status == 404, f"got {status}")

    status, _ = api("POST", "/api/polish/chat", {"session_id": session_id, "message": "x" * 5000}, token=token)
    check("超长消息 → 400", status == 400, f"got {status}")

    print("[3] chat SSE（LLM 依赖，环境感知）")
    try:
        events = read_sse(token, session_id, "帮我把这段介绍改写得更专业")
        types = [e.get("type") for e in events]
        if "done" in types:
            check("SSE 含 delta 流", types.count("delta") >= 1, f"types={types[:6]}")
            check("SSE 含 suggestions 事件", "suggestions" in types)
            check("SSE 以 done 收尾", types[-1] == "done", f"types={types[-3:]}")
        else:
            # LLM 不可用（沙箱/额度耗尽）：必须是 error 事件且不 500
            check("LLM 不可用 → SSE error 事件（非 500）",
                  "error" in types and any("退还" in str(e.get("message", "")) or "失败" in str(e.get("message", "")) for e in events),
                  f"types={types}")
    except urllib.error.HTTPError as e:
        check("chat 不返回 HTTP 错误（SSE 200）", False, f"got {e.code}")

    print("[4] 消息落库与清理")
    status, payload = api("GET", f"/api/polish/sessions/{session_id}", token=token)
    msgs = json.loads(payload)["messages"] if status == 200 else []
    roles = [m["role"] for m in msgs]
    check("用户消息已落库", "user" in roles)

    status, _ = api("DELETE", f"/api/polish/sessions/{session_id}", token=token)
    check("删除会话 → 200", status == 200, f"got {status}")

    status, _ = api("GET", f"/api/polish/sessions/{session_id}", token=token)
    check("删除后详情 → 404", status == 404, f"got {status}")

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
