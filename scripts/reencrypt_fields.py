"""历史 raw_text 加密迁移（明文 / v1 AES-CBC → v2 AESGCM）。

用法（backend/.venv 下）：
    .venv/Scripts/python.exe ../scripts/reencrypt_fields.py            # 试运行（只统计）
    .venv/Scripts/python.exe ../scripts/reencrypt_fields.py --apply    # 实际重写

背景：core/crypto.py 已改用 AESGCM（防篡改）。存量 resumes.raw_text 有三种形态：
  1. 明文（早期上传未加密，见 api/resumes.py「兼容历史未加密数据」注释）；
  2. v1 AES-256-CBC 密文（旧 SECRET_KEY 派生密钥）；
  3. v2 AESGCM 密文（无需处理）。

处理规则：
  - v1 密文能解密 → 重加密为 v2；
  - v1 密文解密失败（密钥不匹配/损坏）→ 跳过并统计，绝不写坏数据；
  - 明文（base64 形态即失败）→ 直接 v2 加密，把历史数据纳入保护。
"""
import argparse
import asyncio
import base64
import binascii
import os
import sys

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)

DSN = os.environ.get("MIGRATE_DSN", "postgresql://postgres:root@localhost:5432/smart_resume")


def looks_like_ciphertext(value: str) -> bool:
    """保守判定「形态像 v1 密文」：标准 base64 且解码后长度合规（iv16 + ≥1 块密文）。"""
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return False
    return len(raw) >= 32 and len(raw) % 16 == 0


async def main(apply: bool) -> int:
    import asyncpg

    from app.core.crypto import decrypt_field, encrypt_field, is_legacy_ciphertext
    from app.config import settings

    # 前置校验：未配置写密钥时拒绝执行（曾因随机密钥写库导致数据永久不可解）
    if not settings.FIELD_ENCRYPTION_KEY:
        print("错误：FIELD_ENCRYPTION_KEY 未配置。随机密钥写库后重启即永久无法解密，已拒绝执行。")
        print("请在 backend/.env 配置该密钥后重试。")
        return 2

    conn = await asyncpg.connect(DSN)
    rows = await conn.fetch("SELECT id, raw_text FROM resumes WHERE raw_text IS NOT NULL")
    await conn.close()

    legacy = [r for r in rows if is_legacy_ciphertext(r["raw_text"])]
    print(f"共 {len(rows)} 条含 raw_text 的记录，其中待处理 {len(legacy)} 条")

    migrated = encrypted_plain = failed = 0
    for r in legacy:
        value = r["raw_text"]
        if looks_like_ciphertext(value):
            plain = decrypt_field(value)
            if plain is None:
                failed += 1
                print(f"  [SKIP] {r['id']} 密文解密失败（密钥不匹配或损坏），保持原样")
                continue
            kind = "v1→v2"
        else:
            plain = value  # 历史明文
            kind = "明文→v2"
        if not apply:
            print(f"  [DRY ] {r['id']} {kind}")
            if kind == "v1→v2":
                migrated += 1
            else:
                encrypted_plain += 1
            continue
        conn = await asyncpg.connect(DSN)
        try:
            await conn.execute(
                "UPDATE resumes SET raw_text = $1 WHERE id = $2", encrypt_field(plain), r["id"]
            )
        finally:
            await conn.close()
        if kind == "v1→v2":
            migrated += 1
        else:
            encrypted_plain += 1
        print(f"  [ OK ] {r['id']} {kind}")

    mode = "已重写" if apply else "待处理（试运行）"
    print(f"完成：{mode} v1→v2 {migrated} 条，明文→v2 {encrypted_plain} 条，跳过 {failed} 条")
    if failed:
        print("提示：跳过记录多为密钥已轮换且未配置 FIELD_ENCRYPTION_PREVIOUS 的历史密文")
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="raw_text 加密迁移（明文/v1 → v2）")
    ap.add_argument("--apply", action="store_true", help="实际执行重写（默认只统计）")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(args.apply)))
