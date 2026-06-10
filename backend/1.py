
import asyncio
from sqlalchemy import text
from app.database import async_session_factory
from app.core.security import verify_password

async def check():
    async with async_session_factory() as db:
        r = await db.execute(text("SELECT password_hash FROM users WHERE email='2375959600@qq.com'"))
        row = r.fetchone()
        pw = input('输入你注册时用的密码: ')
        ok = verify_password(pw, row[0])
        print('密码正确!' if ok else '密码错误 - 需要重置密码')
asyncio.run(check())
