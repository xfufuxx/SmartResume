-- ============================================
-- 智能简历 v4.0 数据库迁移脚本
-- 模块: 完整管理后台（AI模型/财务/工单/大屏/计费）
-- 基于 v3 增量迁移
-- 运行方式: psql -U postgres -d smart_resume -f migrate_v4.sql
-- ============================================

-- 1. 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'super_admin',
    email VARCHAR(255),
    last_login_ip VARCHAR(45),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 默认管理员 (password: admin123)
-- INSERT INTO admins (id, username, password_hash, role) VALUES
-- ('admin-001', 'superadmin', '$2b$12$...', 'super_admin');

-- 2. 管理员操作日志
CREATE TABLE IF NOT EXISTS admin_logs (
    id VARCHAR(36) PRIMARY KEY,
    admin_id VARCHAR(36) NOT NULL REFERENCES admins(id),
    action VARCHAR(128) NOT NULL,
    target_type VARCHAR(32),
    target_id VARCHAR(36),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS ix_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS ix_admin_logs_created ON admin_logs(created_at);

-- 3. Prompt 模板版本管理
CREATE TABLE IF NOT EXISTS prompt_templates (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    scene VARCHAR(32) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    variables JSONB,
    is_active BOOLEAN DEFAULT false,
    gray_ratio INT DEFAULT 0,
    created_by VARCHAR(36) REFERENCES admins(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_prompts_name_scene_version ON prompt_templates(name, scene, version);
CREATE INDEX IF NOT EXISTS ix_prompts_active ON prompt_templates(name, scene) WHERE is_active = true;

-- 4. 模型路由配置
CREATE TABLE IF NOT EXISTS model_routing (
    id VARCHAR(36) PRIMARY KEY,
    model_name VARCHAR(64) NOT NULL,
    display_name VARCHAR(64) NOT NULL,
    api_endpoint VARCHAR(512) NOT NULL,
    api_key_encrypted TEXT,
    weight INT DEFAULT 1,
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_hour INT DEFAULT 1000,
    max_consecutive_failures INT DEFAULT 5,
    consecutive_failures INT DEFAULT 0,
    failover_to VARCHAR(36) REFERENCES model_routing(id),
    is_enabled BOOLEAN DEFAULT true,
    tier VARCHAR(16) DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AI 模型调用日志
CREATE TABLE IF NOT EXISTS ai_model_call_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    model_name VARCHAR(64) NOT NULL,
    prompt_template_name VARCHAR(64),
    prompt_version INT,
    input_tokens INT,
    output_tokens INT,
    latency_ms INT,
    is_success BOOLEAN DEFAULT true,
    error_message TEXT,
    cost_usd DECIMAL(10,6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ai_call_user ON ai_model_call_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_ai_call_model ON ai_model_call_logs(model_name);
CREATE INDEX IF NOT EXISTS ix_ai_call_created ON ai_model_call_logs(created_at);

-- 6. 行业关键词库
CREATE TABLE IF NOT EXISTS industry_keywords (
    id VARCHAR(36) PRIMARY KEY,
    keyword VARCHAR(128) NOT NULL,
    industry VARCHAR(32) NOT NULL,
    category VARCHAR(32) DEFAULT 'hard_skill',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(36) REFERENCES admins(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_keywords_industry ON industry_keywords(industry);

-- 7. ATS 检测规则
CREATE TABLE IF NOT EXISTS ats_rules (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    pattern TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(16) DEFAULT 'warning',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(36) REFERENCES admins(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 订单表
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    order_no VARCHAR(64) UNIQUE NOT NULL,
    package_type VARCHAR(32) NOT NULL,
    package_name VARCHAR(128),
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(16),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    refund_reason TEXT,
    refunded_by VARCHAR(36) REFERENCES admins(id),
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status);

-- 9. 工单表
CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    category VARCHAR(32) NOT NULL,
    priority VARCHAR(8) NOT NULL DEFAULT 'medium',
    subject VARCHAR(255) NOT NULL,
    content TEXT,
    attachments JSONB,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    assigned_to VARCHAR(36) REFERENCES admins(id),
    resolution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS ix_tickets_status ON support_tickets(status);

-- 10. 工单回复表
CREATE TABLE IF NOT EXISTS ticket_replies (
    id VARCHAR(36) PRIMARY KEY,
    ticket_id VARCHAR(36) NOT NULL REFERENCES support_tickets(id),
    admin_id VARCHAR(36) REFERENCES admins(id),
    user_id VARCHAR(36) REFERENCES users(id),
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_replies_ticket ON ticket_replies(ticket_id);

-- 11. 套餐表
CREATE TABLE IF NOT EXISTS quota_packages (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    package_type VARCHAR(32) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_days INT,
    quota_amount INT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 默认套餐数据
INSERT INTO quota_packages (id, name, package_type, price, duration_days, quota_amount) VALUES
    ('pkg-monthly', '月度VIP', 'monthly_vip', 29.90, 30, -1),
    ('pkg-quarterly', '季度VIP', 'quarterly_vip', 79.00, 90, -1),
    ('pkg-yearly', '年度VIP', 'yearly_vip', 249.00, 365, -1),
    ('pkg-topup10', '10次优化包', 'topup_10', 9.90, NULL, 10),
    ('pkg-topup50', '50次优化包', 'topup_50', 39.00, NULL, 50)
ON CONFLICT (id) DO NOTHING;

-- 验证
SELECT 'v4 migration completed. New tables:' AS info;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('admins', 'admin_logs', 'prompt_templates', 'model_routing',
                    'ai_model_call_logs', 'industry_keywords', 'ats_rules',
                    'orders', 'support_tickets', 'ticket_replies', 'quota_packages');