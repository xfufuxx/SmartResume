-- ============================================
-- 「我的简历」列表页：为 resumes 表新增展示管理字段
-- 执行方式：psql -U postgres -d smart_resume -f add_resume_library_fields.sql
-- ============================================

-- 1. 新增字段
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS target_position VARCHAR(128);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS target_company VARCHAR(128);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS match_rate INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(1024);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. 新增索引
CREATE INDEX IF NOT EXISTS ix_resumes_user_status ON resumes(user_id, status);
CREATE INDEX IF NOT EXISTS ix_resumes_user_favorite ON resumes(user_id, is_favorite);

-- 3. 为已有记录回填 status（存在优化结果的视为已优化）
UPDATE resumes SET status = 'optimized'
WHERE deleted_at IS NULL
  AND id IN (SELECT DISTINCT resume_id FROM optimized_resumes WHERE resume_id IS NOT NULL);

-- 4. 为已有记录回填 version（默认 1，已有则不动）
UPDATE resumes SET version = 1 WHERE version IS NULL;

-- 5. 回填 updated_at（与 created_at 保持一致）
UPDATE resumes SET updated_at = created_at WHERE updated_at IS NULL;