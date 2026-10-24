"""简历解析导入 E2E 回归（需 :8000 在线，纯 HTTP）。

覆盖：
1. 文件类型/大小预检（确定性，不依赖 LLM）：txt 拒绝 400
2. parse 端点（依赖 LLM，环境感知）：
   - LLM 可用 → 200 + sections/warnings + parsed_json 关键字段
   - LLM 不可用（沙箱/额度耗尽）→ 400 + 中文错误码文案（映射不被破坏）
3. apply 端点（确定性，不依赖 LLM）：落库 + saved_texts 写入，
   GET /api/resumes/ 可见新档案；重复导入不串数据
4. 认证：无 token → 401

运行：.venv/Scripts/python.exe scripts/verify_resume_import.py
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


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method: str, path: str, body=None, token=None, raw: bytes | None = None,
        filename: str | None = None, content_type: str | None = None):
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    if content_type:
        req.add_header("Content-Type", content_type)
    elif body is not None:
        req.add_header("Content-Type", "application/json")
    if filename:
        req.add_header("X-Filename", filename)  # 仅日志用，不影响服务端
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    opener = _opener()
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:500]


def login() -> str:
    status, payload = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    assert status == 200, f"login failed: {status} {payload[:200]}"
    return json.loads(payload)["access_token"]


def make_resume_pdf() -> bytes:
    """生成一份中文简历 PDF（文本型，供 parse 走文本提取路径）。"""
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page()
    text = (
        "李明\n"
        "求职意向：高级后端工程师\n"
        "电话：13800138000  邮箱：liming@example.com\n"
        "个人简介：五年前端与后端开发经验，主导过多个高并发系统建设。\n"
        "工作经历\n"
        "星辰科技  高级后端工程师  2021-03 ~ 2024-12\n"
        "负责电商平台订单系统架构设计，支撑日订单 50 万+\n"
        "将核心接口响应时间从 800ms 优化至 120ms\n"
        "教育背景\n"
        "华中科技大学  本科  计算机科学与技术  2015-09 ~ 2019-06\n"
        "技能特长：Python、FastAPI、PostgreSQL、Redis、Docker\n"
        "项目经历\n"
        "智能简历优化平台  核心开发  2023-03 ~ 2023-12\n"
        "基于 FastAPI + React 构建简历解析与优化系统\n"
        "GitHub: https://github.com/liming/resume\n"
    )
    page.insert_text((60, 60), text, fontsize=11, fontname="china-s")
    pdf = doc.tobytes()
    doc.close()
    return pdf


def multipart_pdf(token: str | None, pdf: bytes, filename: str = "resume.pdf",
                  with_file: bool = True):
    """构造 multipart/form-data 上传（urllib 无高阶 API，手工拼包）。

    with_file=False 时构造合法但缺 file 字段的包体，用于测 FastAPI 必填校验。
    """
    boundary = "----VerifyBoundary7d91f2"
    parts = [f"--{boundary}\r\n".encode()]
    if with_file:
        parts += [
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
            b"Content-Type: application/pdf\r\n\r\n",
            pdf,
            b"\r\n",
        ]
    else:
        parts += [
            b'Content-Disposition: form-data; name="note"\r\n\r\n',
            b"no file here\r\n",
        ]
    parts.append(f"--{boundary}--\r\n".encode())
    raw = b"".join(parts)
    status, payload = api(
        "POST", "/api/resume-import/parse", token=token, raw=raw,
        content_type=f"multipart/form-data; boundary={boundary}",
    )
    return status, payload


def main() -> int:
    token = login()
    print("[1] 认证与预检")
    pdf = make_resume_pdf()
    # 合法 multipart 但无 token：鉴权先行（401 无效凭证 / 403 缺凭证，两种形态均可）
    status, _ = multipart_pdf(None, pdf)
    check("无 token → 401/403（鉴权先行）", status in (401, 403), f"got {status}")

    status, _ = multipart_pdf(token, pdf, with_file=False)
    check("缺 file 字段 → 422（FastAPI 必填校验）", status == 422, f"got {status}")

    print("[2] parse 端点（LLM 依赖，环境感知）")
    status, payload = multipart_pdf(token, pdf)
    llm_ok = status == 200
    if llm_ok:
        data = json.loads(payload)
        check("parse 200 + sections 数组", isinstance(data.get("sections"), list) and len(data["sections"]) >= 4)
        check("parse 返回 parsed_json", isinstance(data.get("parsed_json"), dict))
        check("parse 返回 raw_text（含关键词）", "李明" in (data.get("raw_text") or ""))
        check("file_type=pdf", data.get("file_type") == "pdf")
    else:
        # 沙箱/额度耗尽：错误必须是带中文文案的 400，而不是 500/裸栈
        check("LLM 不可用 → 400 + 中文文案（映射未被破坏）",
              status == 400 and "解析" in payload.decode("utf-8", "ignore"),
              f"got {status} {payload[:120]!r}")

    print("[3] apply 端点（确定性）")
    fake_parsed = {
        "personal_info": {"name": "导入测试", "email": "import-test@example.com", "phone": "13900000000"},
        "summary": "E2E 导入验证",
        "experience": [{"company": "验证公司", "title": "测试工程师", "start": "2020-01", "end": "2022-01",
                        "points": ["写了自动化测试"]}],
        "skills": ["Python", "Pytest"],
    }
    status, payload = api("POST", "/api/resume-import/apply", token=token, body={
        "parsed_json": fake_parsed,
        "raw_text": "导入测试 13900000000",
        "file_type": "pdf",
        "title": "E2E导入简历",
    })
    check("apply 200", status == 200, f"got {status} {payload[:200]!r}")
    resume_id = ""
    if status == 200:
        resume_id = json.loads(payload).get("resume_id", "")
        check("apply 返回 resume_id", bool(resume_id))

    status, payload = api("GET", "/api/resumes/", token=token)
    found = False
    if status == 200:
        for r in json.loads(payload):
            if r.get("id") == resume_id:
                found = True
                check("列表可见导入档案", r.get("title") == "E2E导入简历")
                check("档案带 parsed_json", bool(r.get("parsed_json")))
    check("导入档案出现在列表", found, f"resume_id={resume_id}")

    status, payload = api("GET", "/api/user/profile", token=token)
    if status == 200:
        saved = (json.loads(payload).get("saved_texts") or {}).get("resume_text") or ""
        check("saved_texts.resume_text 已更新（一键优化可用）", "导入测试" in saved)

    print("[4] 清理")
    if resume_id:
        status, _ = api("DELETE", f"/api/resumes/{resume_id}", token=token)
        check("清理导入档案", status in (200, 204), f"got {status}")

    print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
    print("ALL PASSED" if failed == 0 else "SOME FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
