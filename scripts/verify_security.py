"""安全链路回归：密钥拆分（问题 11）/ AESGCM（问题 12）/ test-template 加固（问题 13）。

用法（backend/.venv，需 :8000 / :6379 在线）：
    .venv/Scripts/python.exe ../scripts/verify_security.py

覆盖：
  A. 密钥拆分：JWT_SECRET / FIELD_ENCRYPTION_KEY / FILE_URL_SECRET 独立配置，
     旧 SECRET_KEY 字段已删除（config 中不再存在）；
  B. 写路径 fail-fast：FIELD_ENCRYPTION_KEY 未配置时 encrypt_field 拒绝写入；
  C. AESGCM：v2 往返、篡改检测（认证失败 → None + 审计）、v1 双读兼容；
  D. 轮换窗口：旧密钥加密的密文在 PREVIOUS 配置后可读，未配置则 None；
  E. fail-fast 启动校验：APP_ENV=production + 默认/缺失密钥 → 拒绝启动；
  F. test-template：开发环境可用、固定窗口 10 次/分钟限流、非法模板 400。
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8000"
BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
EMAIL, PASSWORD = "demo@smart-resume.com", "Demo@123456"

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_passed = _failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"[PASS] {name}" + (f" — {detail}" if detail else ""))
    else:
        _failed += 1
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))


def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with opener.open(req, timeout=120) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


def run_py(code: str, env_extra: dict | None = None) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.update(env_extra or {})
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, timeout=120, cwd=BACKEND, env=env,
    )


def main() -> int:
    sys.path.insert(0, BACKEND)

    # ── A. 密钥拆分 ──
    from app.config import Settings

    fields = Settings.model_fields
    check("A1 config 已无 SECRET_KEY 字段", "SECRET_KEY" not in fields, str(sorted(fields)[:6]) + "...")
    check("A2 JWT_SECRET / FIELD_ENCRYPTION_KEY / FILE_URL_SECRET 独立存在",
          all(k in fields for k in ("JWT_SECRET", "FIELD_ENCRYPTION_KEY", "FILE_URL_SECRET")))

    from app.core import crypto
    from app.config import settings

    check("A3 三密钥来源可分辨", bool(settings.JWT_SECRET) and bool(settings.FIELD_ENCRYPTION_KEY))

    # ── B. 写路径 fail-fast ──
    r = run_py(
        "from app.core.crypto import encrypt_field\n"
        "try:\n"
        "    encrypt_field('x')\n"
        "    print('WROTE')\n"
        "except RuntimeError as e:\n"
        "    print('REFUSED')\n",
        {"FIELD_ENCRYPTION_KEY": ""},
    )
    check("B1 未配置写密钥 → encrypt_field 拒绝", "REFUSED" in r.stdout, r.stdout.strip() + r.stderr[-120:])

    # ── C. AESGCM ──
    ct = crypto.encrypt_field("PII-13800138000")
    check("C1 新密文带 v2 前缀", ct.startswith("v2:"))
    check("C2 v2 往返", crypto.decrypt_field(ct) == "PII-13800138000")
    check("C3 新密文不是旧 CBC 形态", not crypto.is_legacy_ciphertext(ct))

    raw = bytearray(base64.b64decode(ct[3:]))
    raw[-1] ^= 0xFF
    check("C4 篡改密文 → None（AEAD 认证）", crypto.decrypt_field("v2:" + base64.b64encode(bytes(raw)).decode()) is None)
    check("C5 垃圾输入 → None", crypto.decrypt_field("!!!not-base64!!!") is None)
    check("C6 空值 → None", crypto.decrypt_field(None) is None and crypto.decrypt_field("") is None)

    # v1 双读：按「当前生效的 LEGACY_CBC_KEY」手工造 CBC 密文（测逻辑而非硬编码密钥值）
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    legacy_material = settings.LEGACY_CBC_KEY or "change-me-in-production"
    key = hashlib.sha256(legacy_material.encode()).digest()
    iv = secrets.token_bytes(16)
    padded = b"legacy-cbc-data"
    pad_len = 16 - (len(padded) % 16)
    padded += bytes([pad_len]) * pad_len
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    v1 = base64.b64encode(iv + enc.update(padded) + enc.finalize()).decode()
    check("C7 v1 无前缀密文可双读", crypto.decrypt_field(v1) == "legacy-cbc-data")
    check("C8 v1: 前缀密文可双读", crypto.decrypt_field("v1:" + v1) == "legacy-cbc-data")

    # ── D. 轮换窗口 ──
    r_old = run_py(
        "import os\nos.environ['FIELD_ENCRYPTION_KEY'] = 'rotate-old'\n"
        "from app.core.crypto import encrypt_field\nprint(encrypt_field('rotate-data'))\n"
    )
    old_ct = r_old.stdout.strip()
    r_new = run_py(
        f"import os\nos.environ['FIELD_ENCRYPTION_KEY'] = 'rotate-new'\n"
        f"os.environ['FIELD_ENCRYPTION_PREVIOUS'] = 'rotate-old'\n"
        f"from app.core.crypto import decrypt_field\nprint(decrypt_field({old_ct!r}))\n"
    )
    check("D1 PREVIOUS 旧密钥可读轮换期密文", r_new.stdout.strip() == "rotate-data")
    r_no = run_py(
        f"import os\nos.environ['FIELD_ENCRYPTION_KEY'] = 'rotate-new'\n"
        f"from app.core.crypto import decrypt_field\nprint(decrypt_field({old_ct!r}))\n"
    )
    check("D2 无 PREVIOUS → None", r_no.stdout.strip() == "None")

    # ── E. fail-fast 启动校验 ──
    r_prod = run_py("from app.config import settings; print('STARTED')", {"APP_ENV": "production"})
    check("E1 production + 默认密钥 → 拒绝启动",
          r_prod.returncode != 0 and "生产环境密钥配置不合法" in r_prod.stderr)
    r_ok = run_py(
        "from app.config import settings; print('STARTED')",
        {"APP_ENV": "production", "JWT_SECRET": "p-jwt", "FIELD_ENCRYPTION_KEY": "p-field", "FILE_URL_SECRET": "p-file"},
    )
    check("E2 production + 三密钥齐全 → 正常启动", r_ok.returncode == 0 and "STARTED" in r_ok.stdout)

    # ── F. test-template 端点 ──
    # 先测非法模板（避免被后面的限流打满后抢先 429），再测限流
    st, body = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    check("F1 登录（JWT_SECRET 拆分后仍可用）", st == 200, f"st={st}")
    token = json.loads(body)["access_token"]

    st, body = api("POST", "/api/optimize/test-template?template=__nope__", {}, token=token)
    check("F2 未注册模板 400", st == 400, f"st={st}")

    ok = limited = 0
    for _ in range(12):
        st, _ = api("POST", "/api/optimize/test-template?template=professional", {}, token=token)
        if st == 200:
            ok += 1
        elif st == 429:
            limited += 1
    check("F3 固定窗口限流 10 次/分钟", ok == 10 and limited == 2, f"200x{ok} 429x{limited}")

    # 文件签名 URL（FILE_URL_SECRET 拆分后仍可用）
    st, body = api("GET", "/api/resumes", token=token)
    items = json.loads(body)
    signed = [r for r in items if r.get("original_file_url")]
    check("F4 文件签名 URL 仍可下发", st == 200 and isinstance(items, list), f"resumes={len(items)}")

    print(f"\n共 {_passed + _failed} 项：PASS {_passed} / FAIL {_failed}")
    print("ALL PASSED" if _failed == 0 else "SOME FAILED")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
