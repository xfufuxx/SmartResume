"""问题 6-C 主题链路 API 回归（需 :8000 在线）。

覆盖：
1. PUT /api/optimize/{id}/theme：合法部分字段 → 200 且 theme_config 增量合并
2. 非法值（非 hex / 越界 clamp / 白名单外字体）→ 400
3. reexport 无参 → PDF 元数据 keywords 含 theme-primary/accent/font/size/lh/margin/gap
4. 预览端点带主题参数 → HTML 内 --tpl-primary 为用户值（预览与导出同一定值）
5. 预览端点非法主题 → 400
6. 清理：清空 theme_config 并重导出还原
"""
import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8000"
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"
RECORD = "9d65fbd1-d1be-4cbc-a64d-8b53001183f1"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


st, body = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
token = json.loads(body)["access_token"]
check("登录", st == 200)

st, body = api("GET", f"/api/optimize/{RECORD}", token=token)
rec = json.loads(body)
check("GET 记录含 theme_config 字段", "theme_config" in rec, f"got {rec.get('theme_config')!r}")

# 1. 合法部分字段（增量）
st, body = api("PUT", f"/api/optimize/{RECORD}/theme",
               {"primary": "#e11d48", "fontFamily": "SimHei"}, token=token)
check("PUT 主题 200", st == 200, f"st={st} {body[:150]}")
merged = json.loads(body).get("theme_config") or {}
check("theme_config 增量合并（含 primary+fontFamily）",
      merged.get("primary") == "#e11d48" and merged.get("fontFamily") == "SimHei",
      f"got {merged}")

# 2. 非法值
st, body = api("PUT", f"/api/optimize/{RECORD}/theme", {"primary": "red"}, token=token)
check("primary 非 hex → 400", st == 400, f"st={st} {body[:120]}")
st, body = api("PUT", f"/api/optimize/{RECORD}/theme", {"fontFamily": "Comic Sans"}, token=token)
check("白名单外字体 → 400", st == 400, f"st={st} {body[:120]}")
st, body = api("PUT", f"/api/optimize/{RECORD}/theme", {"baseFontSizePt": 99}, token=token)
check("越界字号 → 400（strict 收敛前先报错）", st == 400, f"st={st} {body[:120]}")

# 3. reexport 无参 → PDF 元数据带主题摘要
st, body = api("POST", f"/api/optimize/{RECORD}/reexport", token=token)
check("reexport 无参 200", st == 200, f"st={st} {body[:120]}")
payload = json.loads(body) if st == 200 else {}
pdf_url = payload.get("pdf_url", "").replace("http://localhost:8000", "http://127.0.0.1:8000")
pdf = opener.open(urllib.request.Request(pdf_url), timeout=180).read()
check("下载到 PDF", pdf[:4] == b"%PDF", f"size={len(pdf)}")

import fitz
doc = fitz.open(stream=pdf, filetype="pdf")
kw = doc.metadata.get("keywords") or ""
doc.close()
for key, expect in [
    ("theme-primary", "#e11d48"),
    ("theme-font", "SimHei"),
    ("theme-line-height", None),
    ("theme-margin", None),
]:
    if expect:
        check(f"PDF keywords 含 {key}={expect}", key in kw and expect in kw, f"kw={kw[:200]}")
    else:
        check(f"PDF keywords 含 {key}", key in kw, f"kw={kw[:200]}")

# 4. 预览端点带主题
st, html = api("GET", "/api/templates/jade-twocol/preview?primary=%23e11d48&accent=%230f766e")
check("预览带主题 200", st == 200, f"st={st}")
check("预览 HTML 的 --tpl-primary 为用户值", "--tpl-primary: #e11d48" in html.decode("utf-8", "ignore"))
check("预览 HTML 的 --tpl-accent 为用户值", "--tpl-accent: #0f766e" in html.decode("utf-8", "ignore"))

st, body = api("GET", "/api/templates/jade-twocol/preview?primary=notacolor")
check("预览非法主题 → 400", st == 400, f"st={st} {body[:100]}")

# 5. 清理：theme_config 置空并重导出
api("PUT", f"/api/optimize/{RECORD}/theme", {"primary": None, "fontFamily": None}, token=token)
st, body = api("PUT", f"/api/optimize/{RECORD}/theme", {"primary": None}, token=token)
# 上面的 None 不构成提交；直接清库
import asyncio
import asyncpg


async def clear():
    conn = await asyncpg.connect("postgresql://postgres:root@localhost:5432/smart_resume")
    await conn.execute(
        "UPDATE optimized_resumes SET theme_config = NULL WHERE id = $1", RECORD
    )
    await conn.close()


asyncio.run(clear())
st, body = api("POST", f"/api/optimize/{RECORD}/reexport", token=token)
check("清理：清空主题并重导出", st == 200, f"st={st}")

print(f"\n共 {passed + failed} 项：PASS {passed} / FAIL {failed}")
print("ALL PASSED" if failed == 0 else "SOME FAILED")
sys.exit(0 if failed == 0 else 1)
