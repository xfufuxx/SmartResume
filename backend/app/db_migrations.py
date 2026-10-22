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
    # 可视化排版编辑器：布局文档（内容/排版正交，互不改写）
    ("optimized_resumes", "layout_json", "JSONB"),
    # QQ 登录：users.qq_openid（QQ 互联 openid，唯一）
    ("users", "qq_openid", "VARCHAR(64)"),
    # 模板体系：用户选定的模板 ID（预览/导出/文档属性的唯一事实来源）
    ("optimized_resumes", "template", "VARCHAR(50)"),
    # 主题定制：用户对模板的主题覆盖（NULL=模板默认，与 template 正交）
    ("optimized_resumes", "theme_config", "JSONB"),
]

# 存量数据回填（幂等：只补 NULL 行，不覆盖用户已选值）
BACKFILLS: list[tuple[str, str]] = [
    (
        "optimized_resumes 模板回填",
        "UPDATE optimized_resumes SET template = 'professional' WHERE template IS NULL",
    ),
]

# (索引名, 建索引 DDL) —— ADD COLUMN 不会带唯一约束，这里补唯一索引
INDEXES: list[tuple[str, str]] = [
    ("uq_users_qq_openid", "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_qq_openid ON users (qq_openid)"),
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
        for index_name, ddl in INDEXES:
            try:
                await conn.execute(text(ddl))
            except Exception as e:  # noqa: BLE001 —— 索引失败（如历史脏数据重复）不阻断启动
                logger.warning("轻量迁移跳过索引 %s: %s", index_name, e)
        # 列补齐后再回填存量数据（必须在 ADD COLUMN 之后执行）
        for name, ddl in BACKFILLS:
            try:
                await conn.execute(text(ddl))
            except Exception as e:  # noqa: BLE001 —— 回填失败不阻断启动
                logger.warning("轻量迁移跳过回填 %s: %s", name, e)
    logger.info(
        "轻量迁移检查完成（applications 邮件直递列 + optimized_resumes 布局/模板列 + users QQ 登录列）"
    )
