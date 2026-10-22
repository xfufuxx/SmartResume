"""扫描 git 全历史里的敏感字符串（输出脱敏，只显示前 6 位）。

判定两个来源：
1. 通用模式（sk- 前缀、私钥头、带账号密码的 DSN、*_SECRET/*_KEY 赋值等）；
2. 与当前 backend/.env 里实际密钥值精确匹配（历史里出现过就算泄露）。

只读，不修改任何东西。
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(r"D:/下载/智能简历")
ENV = ROOT / "backend" / ".env"

GREP_PATTERN = "|".join(
    [
        r"sk-[A-Za-z0-9]{16,}",                 # 各类 LLM/云 API key
        r"AKID[A-Za-z0-9]{10,}",                # 腾讯云
        r"LTAI[A-Za-z0-9]{10,}",                # 阿里云
        r"ghp_[A-Za-z0-9]{20,}",                # GitHub PAT
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        r"[a-zA-Z]+://[^\s:@/]+:[^\s@/]+@[^\s/]+",  # 带口令的 URL（DB/Redis）
        r"(SECRET_KEY|JWT_SECRET|FIELD_ENCRYPTION_KEY|APP_SECRET|API_KEY|ACCESS_KEY|PASSWORD)\s*[=:]\s*['\"]?[A-Za-z0-9+/=_\-\.]{8,}",
    ]
)

# Python 侧的两条正则：一条通用、一条大小写不敏感的赋值式（re 不允许中段 (?i)）
PATTERNS = [
    re.compile(GREP_PATTERN.split("|(SECRET_KEY")[0]),
    re.compile(
        r"(SECRET_KEY|JWT_SECRET|FIELD_ENCRYPTION_KEY|APP_SECRET|API_KEY|ACCESS_KEY|PASSWORD)\s*[=:]\s*['\"]?[A-Za-z0-9+/=_\-\.]{8,}",
        re.I,
    ),
]

SECRETISH_ENV_KEYS = re.compile(r"(?i)(SECRET|KEY|PASSWORD|TOKEN|PASSWD)")


def mask(token: str) -> str:
    token = token.strip().strip("'\"")
    if len(token) <= 8:
        return token[:2] + "*" * 4
    return f"{token[:6]}…{token[-2:]}(len={len(token)})"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace"
    ).stdout


def env_secrets() -> dict[str, str]:
    """从 .env 提取疑似密钥的值（排除明显的占位符）。"""
    if not ENV.exists():
        return {}
    out: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip("'\"")
        if not SECRETISH_ENV_KEYS.search(k):
            continue
        if len(v) < 8 or v.lower() in {"changeme", "your-key-here", "none", "null", "true", "false"}:
            continue
        if v.lower().startswith(("your", "xxx", "sk-xxx", "<")):
            continue
        out[k] = v
    return out


def main() -> int:
    commits = [c for c in git("rev-list", "--all").split("\n") if c]
    print(f"扫描 {len(commits)} 个提交（{len(set(commits))} 唯一）\n")

    hits: dict[str, dict] = {}
    for c in commits:
        short = c[:8]
        # 模式扫描（-I 跳过二进制，-E 扩展正则）
        raw = subprocess.run(
            ["git", "grep", "-n", "-I", "-i", "-E", GREP_PATTERN, c],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        ).stdout
        for line in raw.splitlines():
            parts = line.split(":", 3)
            if len(parts) < 4:
                continue
            _, path, lineno, text = parts
            for pat in PATTERNS:
                for m in pat.finditer(text):
                    token = m.group(0)
                    key = f"{path}::{token[:20]}"
                    rec = hits.setdefault(key, {"path": path, "masked": mask(token), "commits": set(), "samples": set()})
                    rec["commits"].add(short)
                    rec["samples"].add(text.strip()[:100])

    print("── 通用模式命中 ──")
    if not hits:
        print("  （无）")
    for rec in sorted(hits.values(), key=lambda r: r["path"]):
        print(f"  {rec['path']}  值={rec['masked']}  提交={','.join(sorted(rec['commits']))}")
        for s in list(rec["samples"])[:2]:
            print(f"      行内容: {s}")

    print("\n── 与当前 .env 密钥精确匹配 ──")
    secrets = env_secrets()
    print(f"  .env 中疑似密钥项：{len(secrets)} 个")
    leaked = 0
    for k, v in secrets.items():
        found = [c[:8] for c in commits if subprocess.run(
            ["git", "grep", "-q", "-I", "-F", "--", v, c],
            cwd=ROOT, capture_output=True,
        ).returncode == 0]
        if found:
            leaked += 1
            print(f"  [泄露] {k}  值={mask(v)}  提交={','.join(found)}")
    if not leaked:
        print("  （当前 .env 的密钥值均未出现在历史中）")

    # .env 本身是否被提交过
    env_tracked = git("log", "--all", "--oneline", "--", "backend/.env").strip()
    print("\n── backend/.env 是否进过版本库 ──")
    print("  " + (env_tracked.replace("\n", "\n  ") if env_tracked else "否，从未提交"))

    print(f"\n结论：通用模式命中 {len(hits)} 处；.env 密钥泄露 {leaked}/{len(secrets)} 项")
    return 0


if __name__ == "__main__":
    sys.exit(main())
