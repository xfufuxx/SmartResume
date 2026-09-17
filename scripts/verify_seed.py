import asyncio
import io
import sys

import asyncpg

DSN = "postgresql://postgres:root@localhost:5432/smart_resume"
TABLES = [
    "users", "resumes", "job_images", "optimized_resumes", "messages",
    "interview_sessions", "interview_questions", "feedbacks",
    "batch_optimizations", "batch_job_tasks", "user_quotas", "orders",
    "support_tickets", "ticket_replies", "user_devices", "audit_logs",
    "ai_model_call_logs",
]


async def snapshot(conn):
    out = {}
    for t in TABLES:
        out[t] = await conn.fetchval(f'select count(*) from "public"."{t}"')
    return out


async def run_file(conn, path):
    with io.open(path, encoding="utf-8") as f:
        sql = f.read()
    await conn.execute(sql)


def diff(before, after):
    for t in TABLES:
        d = after[t] - before[t]
        flag = "  " if d == 0 else ">>"
        print(f"  {flag} {t:<24} {before[t]:>4} -> {after[t]:>4}  ({d:+d})")


async def main(seed_path, clean_path):
    conn = await asyncpg.connect(DSN)
    print("== 1) 导入前基线 ==")
    before = await snapshot(conn)
    for t in TABLES:
        print(f"     {t:<24} {before[t]:>4}")

    print("\n== 2) 执行演示数据脚本 ==")
    await run_file(conn, seed_path)
    mid = await snapshot(conn)
    diff(before, mid)

    print("\n== 3) 关键校验 ==")
    demo_id = await conn.fetchval(
        "select id from public.users where email = 'demo@smart-resume.com'"
    )
    print("     演示账号 id:", demo_id)
    checks = {
        "简历(含1份软删)": 'select count(*) from public.resumes where user_id=$1',
        "岗位(含1份软删)": 'select count(*) from public.job_images where user_id=$1',
        "优化记录(含1份软删)": 'select count(*) from public.optimized_resumes where user_id=$1',
        "面试题": 'select count(*) from public.interview_questions where user_id=$1',
        "消息(未读)": 'select count(*) from public.messages where user_id=$1 and is_read=false',
        "工单回复(含管理员回复)": (
            'select count(*) from public.ticket_replies r join public.support_tickets t '
            'on r.ticket_id=t.id where t.user_id=$1'
        ),
    }
    for label, q in checks.items():
        print(f"     {label:<22}", await conn.fetchval(q, demo_id))
    print("     低分优化(<70)条数      ",
          await conn.fetchval(
              "select count(*) from public.optimized_resumes where user_id=$1 and match_score<70 and deleted_at is null",
              demo_id,
          ))

    print("\n== 4) 登录校验（bcrypt 比对）==")
    row = await conn.fetchrow(
        "select password_hash from public.users where email='demo@smart-resume.com'"
    )
    from passlib.hash import bcrypt
    print("     Demo@123456 校验:", bcrypt.verify("Demo@123456", row["password_hash"]))

    print("\n== 5) 执行清理脚本 ==")
    await run_file(conn, clean_path)
    after = await snapshot(conn)
    diff(before, after)

    restored = all(after[t] == before[t] for t in TABLES)
    print("\n结果：", "数据库已完全恢复到导入前状态 ✔" if restored else "!! 存在残留，请检查 !!")
    await conn.close()
    return 0 if restored else 1


if __name__ == "__main__":
    code = asyncio.run(main(sys.argv[1], sys.argv[2]))
    sys.exit(code)
