-- ============================================
-- 智能简历 v2.0 数据库迁移脚本
-- 三大功能模块：智能分析与洞察 + 多简历管理 + 反馈迭代
-- 基于现有 PostgreSQL 数据库增量迁移
-- 运行方式: psql -U postgres -d smart_resume -f migrate_v2.sql
-- ============================================

-- 1. 扩展 resumes 表（多简历库）
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS title VARCHAR(100);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 将现有用户的第一份简历设为主简历
UPDATE resumes SET is_primary = true
WHERE id IN (
    SELECT DISTINCT ON (user_id) id
    FROM resumes
    WHERE deleted_at IS NULL
    ORDER BY user_id, created_at ASC
);

-- 2. 扩展 optimized_resumes 表（满意度 + 微调）
ALTER TABLE optimized_resumes ADD COLUMN IF NOT EXISTS satisfaction_score INT;
ALTER TABLE optimized_resumes ADD COLUMN IF NOT EXISTS feedback_text TEXT;
ALTER TABLE optimized_resumes ADD COLUMN IF NOT EXISTS parent_record_id VARCHAR(36);
ALTER TABLE optimized_resumes ADD COLUMN IF NOT EXISTS refine_count INT DEFAULT 0;

ALTER TABLE optimized_resumes
    ADD CONSTRAINT fk_parent_record
    FOREIGN KEY (parent_record_id)
    REFERENCES optimized_resumes(id)
    ON DELETE SET NULL;

-- 3. 投递反馈表
CREATE TABLE IF NOT EXISTS feedbacks (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    optimization_record_id VARCHAR(36) NOT NULL REFERENCES optimized_resumes(id),
    outcome VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_feedbacks_user ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS ix_feedbacks_opt ON feedbacks(optimization_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_feedbacks_user_opt ON feedbacks(user_id, optimization_record_id);

-- 4. 批量优化任务表
CREATE TABLE IF NOT EXISTS batch_optimizations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    source_resume_id VARCHAR(36) NOT NULL REFERENCES resumes(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_jobs INT DEFAULT 0,
    completed_jobs INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_batch_user ON batch_optimizations(user_id);

-- 5. 批量优化子任务表
CREATE TABLE IF NOT EXISTS batch_job_tasks (
    id VARCHAR(36) PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL REFERENCES batch_optimizations(id),
    job_image_id VARCHAR(36) NOT NULL REFERENCES job_images(id),
    optimization_record_id VARCHAR(36) REFERENCES optimized_resumes(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_batch_tasks_batch ON batch_job_tasks(batch_id);

-- 6. 新增复合索引（优化查询性能）
CREATE INDEX IF NOT EXISTS ix_resumes_user_deleted ON resumes(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS ix_resumes_user_primary ON resumes(user_id, is_primary);

-- 7. 岗位热度统计物化视图（可选，加速查询）
-- CREATE MATERIALIZED VIEW IF NOT EXISTS trending_jobs_mv AS
-- SELECT
--     DATE_TRUNC('day', created_at) AS day,
--     (parsed_job_json->>'title') AS job_title,
--     COUNT(*) AS upload_count
-- FROM job_images
-- WHERE parsed_job_json IS NOT NULL
-- GROUP BY DATE_TRUNC('day', created_at), parsed_job_json->>'title';

-- 验证迁移结果
SELECT 'Migration completed. New tables:' AS info;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('feedbacks', 'batch_optimizations', 'batch_job_tasks');