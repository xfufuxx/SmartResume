"""轻量级启动迁移：项目不使用 alembic，create_all 只能建新表、不能给老表补列。

此处用幂等 ALTER（PostgreSQL 支持 ADD COLUMN IF NOT EXISTS）为已有表补齐
阶段 1「邮件直投」新增的列。新增列必须同时：
1. 在对应 model 中声明（保证新库 create_all 直接建全）；
2. 在 MIGRATIONS 中登记（保证老库启动时自动补列）。
"""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# (表名, 列名, DDL 类型子句)
MIGRATIONS: list[tuple[str, str, str]] = [
    ("applications", "channel", "VARCHAR(20)"),
    ("applications", "recipient_email", "VARCHAR(255)"),
    ("applications", "delivery_status", "VARCHAR(20)"),
    ("applications", "sent_at", "TIMESTAMP WITH TIME ZONE"),
    ("applications", "provider_message_id", "VARCHAR(255)"),
    ("applications", "consent_at", "TIMESTAMP WITH TIME ZONE"),
    # 阶段3：官网表单半自动投递（通道 B）
    ("applications", "apply_url", "VARCHAR(500)"),
]


async def run_lightweight_migrations(engine: AsyncEngine) -> None:
    """启动时幂等执行：给老表补列，已存在则跳过。"""
    async with engine.begin() as conn:
        for table, column, ddl in MIGRATIONS:
            stmt = text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}')
            try:
                await conn.execute(stmt)
            except Exception as e:  # noqa: BLE001 —— 单列失败不阻断启动
                logger.warning("轻量迁移跳过 %s.%s: %s", table, column, e)
    logger.info("轻量迁移检查完成（applications 邮件直投列）")
