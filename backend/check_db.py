"""诊断: 检查验证码表、用户表、密码哈希"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import asyncio
from sqlalchemy import text
from app.database import async_session_factory
from app.core.security import hash_password, verify_password


async def diag():
    async with async_session_factory() as db:
        print("=" * 60)
        r = await db.execute(
            text("SELECT count(*) FROM information_schema.tables WHERE table_name = 'verification_codes'")
        )
        exists = r.scalar()
        print(f"verification_codes 表: {'✅ 存在' if exists else '❌ 不存在 - 需要创建'}")
        if not exists:
            print("  → 原因: 迁移 SQL 中缺少此表, 重启后端会自动创建(Base.metadata.create_all)")

        r = await db.execute(text("SELECT count(*) FROM users"))
        cnt = r.scalar()
        print(f"\nusers 表用户数: {cnt}")
        if cnt > 0:
            r = await db.execute(
                text("SELECT id::text, email, password_hash, status, created_at FROM users ORDER BY created_at DESC LIMIT 3")
            )
            for row in r.fetchall():
                print(f"  [{row.email}] 状态={row.status} 创建时间={row.created_at}")
                print(f"     password_hash 前40字符: {row.password_hash[:40] if row.password_hash else 'NULL'}")

        print(f"\n密码哈希自检:")
        test_pw = "test123456"
        h = hash_password(test_pw)
        ok = verify_password(test_pw, h)
        print(f"  hash('{test_pw}') → hash长度={len(h)} → verify: {'✅ OK' if ok else '❌ 失败'}")

asyncio.run(diag())