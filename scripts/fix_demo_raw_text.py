"""修复演示数据：v2 坏密文（随机密钥误写）→ 从 parsed_json 重建 raw_text 并重新加密。

背景：2026-10-22 密钥拆分迁移时，首次 --apply 在 FIELD_ENCRYPTION_KEY 配置前执行，
进程内随机密钥加密的 5 条演示记录永久不可解密。本脚本按 parsed_json 重建风格
一致的原文（两条短记录原始文本已知，逐字还原），重新加密写入。

预防（已落地）：crypto.encrypt_field 未配置密钥时拒绝写入；迁移脚本前置校验。
"""
import asyncio
import os
import sys

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)

DSN = os.environ.get("MIGRATE_DSN", "postgresql://postgres:root@localhost:5432/smart_resume")

# 两条短记录的原始文本（迁移前 head 输出即全文，长度 19/18 与原文逐字一致）
KNOWN_PLAIN = {
    "3dc165d0-8123-40d7-9e99-74481bc955e9": "李娜 前端开发工程师 4 年经验 ……",
    "701cb1ea-9706-4032-830f-3acfddc60450": "王强 高级产品经理 5 年经验 ……",
}


def rebuild_from_parsed(pj: dict) -> str:
    """把 parsed_json 重建为纯文本简历（与上传时 OCR/解析产物风格一致）。"""
    lines: list[str] = []
    pi = pj.get("personal_info") or {}
    lines.append("【个人信息】")
    if pi.get("name"):
        lines.append(f"姓名：{pi['name']}")
    if pi.get("email"):
        lines.append(f"邮箱：{pi['email']}")
    if pi.get("phone"):
        lines.append(f"电话：{pi['phone']}")
    if pi.get("location"):
        lines.append(f"所在地：{pi['location']}")
    lines.append("")

    if pj.get("summary"):
        lines += ["【个人简介】", str(pj["summary"]).strip(), ""]

    exp = pj.get("experience") or []
    if exp:
        lines.append("【工作经历】")
        for e in exp:
            head = " · ".join(x for x in [e.get("title"), e.get("company")] if x)
            span = f"{e.get('start', '')} - {e.get('end', '')}".strip(" -")
            lines.append(f"* {head}" + (f"（{span}）" if span else ""))
            for p in e.get("points") or []:
                lines.append(f"  - {p}")
        lines.append("")

    projs = pj.get("projects") or []
    if projs:
        lines.append("【项目经历】")
        for p in projs:
            head = " · ".join(x for x in [p.get("name"), p.get("role")] if x)
            span = f"{p.get('start', '')} - {p.get('end', '')}".strip(" -")
            lines.append(f"* {head}" + (f"（{span}）" if span else ""))
            for pt in p.get("points") or []:
                lines.append(f"  - {pt}")
        lines.append("")

    edu = pj.get("education") or []
    if edu:
        lines.append("【教育背景】")
        for e in edu:
            head = " · ".join(x for x in [e.get("school"), e.get("degree"), e.get("major")] if x)
            span = f"{e.get('start', '')} - {e.get('end', '')}".strip(" -")
            lines.append(f"* {head}" + (f"（{span}）" if span else ""))
        lines.append("")

    skills = pj.get("skills") or []
    if skills:
        lines.append("【专业技能】")
        lines.append("、".join(str(s) for s in skills))
    return "\n".join(lines).strip() + "\n"


async def main() -> int:
    import json

    import asyncpg

    from app.config import settings
    from app.core.crypto import decrypt_field, encrypt_field

    if not settings.FIELD_ENCRYPTION_KEY:
        print("错误：FIELD_ENCRYPTION_KEY 未配置，拒绝写入。")
        return 2

    conn = await asyncpg.connect(DSN)
    rows = await conn.fetch(
        "SELECT id, raw_text, parsed_json FROM resumes "
        "WHERE raw_text IS NOT NULL AND raw_text LIKE 'v2:%'"
    )
    await conn.close()

    fixed = 0
    for r in rows:
        plain = decrypt_field(r["raw_text"])
        if plain is not None:
            continue  # 正常密文，不动
        if r["id"] in KNOWN_PLAIN:
            text = KNOWN_PLAIN[r["id"]]
            source = "原文还原"
        else:
            pj = r["parsed_json"]
            pj = json.loads(pj) if isinstance(pj, str) else pj
            text = rebuild_from_parsed(pj)
            source = "parsed_json 重建"
        conn = await asyncpg.connect(DSN)
        try:
            await conn.execute(
                "UPDATE resumes SET raw_text = $1 WHERE id = $2", encrypt_field(text), r["id"]
            )
        finally:
            await conn.close()
        fixed += 1
        print(f"  [FIX] {r['id']} {source}（{len(text)} 字符）")

    print(f"完成：修复 {fixed} 条")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
