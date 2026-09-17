# -*- coding: utf-8 -*-
"""执行一个 .sql 文件（默认连本地 smart_resume 库）。

用法：
    backend/.venv/Scripts/python.exe scripts/apply_seed.py 演示测试数据.sql
    backend/.venv/Scripts/python.exe scripts/apply_seed.py 演示测试数据-清理.sql

说明：整个文件在一条连接里执行；文件自带 BEGIN/COMMIT，失败会自动回滚。
"""
import asyncio
import io
import sys

import asyncpg

DSN = "postgresql://postgres:root@localhost:5432/smart_resume"


async def main(path: str):
    with io.open(path, encoding="utf-8") as f:
        sql = f.read()
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute(sql)
        print("执行成功:", path)
        total_users = await conn.fetchval("select count(*) from public.users")
        demo = await conn.fetchval(
            "select count(*) from public.users where email='demo@smart-resume.com'"
        )
        print("users 总数 =%d，其中演示账号 =%d" % (total_users, demo))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
