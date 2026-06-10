-- ============================================
-- 智能简历 v3.0 数据库迁移脚本
-- 模块: 增强认证 + 资产安全 + 管理后台
-- 基于 v2 增量迁移
-- 运行方式: psql -U postgres -d smart_resume -f migrate_v3.sql
-- ============================================

-- 1. 扩展 users 表（增强认证 + 个人资料）
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1024);
ALTER TABLE users ADD COLUMN IF NOT EXISTS career_state VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS expectation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_agreed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 更新已存在的用户状态
UPDATE users SET status = 'active' WHERE status IS NULL;
UPDATE users SET nickname = SPLIT_PART(email, '@', 1) WHERE nickname IS NULL;

-- 唯一约束（phone 可为 NULL，但非 NULL 值必须唯一）
-- PostgreSQL 15+ 支持 NULLS NOT DISTINCT
-- 旧版本使用部分唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;

-- 2. 登录设备表
CREATE TABLE IF NOT EXISTS user_devices (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(128),
    platform VARCHAR(32),
    ip_address VARCHAR(45),
    user_agent TEXT,
    refresh_token_hash VARCHAR(255),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS ix_user_devices_device ON user_devices(user_id, device_id);
CREATE INDEX IF NOT EXISTS ix_user_devices_token ON user_devices(refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

-- 3. 消息表
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    msg_type VARCHAR(32) NOT NULL,
    title VARCHAR(255),
    content TEXT,
    ref_id VARCHAR(36),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS ix_messages_unread ON messages(user_id, is_read) WHERE is_read = false;

-- 4. 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),
    target_id VARCHAR(36),
    detail TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at);

-- 5. 简历模板表
CREATE TABLE IF NOT EXISTS resume_templates (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    html_content TEXT,
    css_content TEXT,
    thumbnail_url VARCHAR(1024),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 用户额度表
CREATE TABLE IF NOT EXISTS user_quotas (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    daily_limit INT DEFAULT 3,
    monthly_limit INT DEFAULT 50,
    daily_used INT DEFAULT 0,
    monthly_used INT DEFAULT 0,
    last_reset_date TIMESTAMPTZ,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_user_quotas_user ON user_quotas(user_id);

-- 7. 设置管理员（替换为你的邮箱）
-- INSERT INTO users (email, password_hash, is_verified, status) VALUES
-- ('admin@example.com', '$2b$12$...', true, 'active');
-- 然后在代码中调用: set_admin_emails(['admin@example.com'])

-- 验证迁移结果
SELECT 'v3 migration completed. New tables:' AS info;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_devices', 'messages', 'audit_logs', 'resume_templates', 'user_quotas');