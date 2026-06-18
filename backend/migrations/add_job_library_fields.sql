-- ============================================
-- 岗位库功能：为 job_images 表新增管理字段
-- 执行方式：psql -U postgres -d smart_resume -f add_job_library_fields.sql
-- ============================================

-- 1. 新增字段
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS company VARCHAR(200);
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS user_remark TEXT;
ALTER TABLE job_images ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 2. 新增索引
CREATE INDEX IF NOT EXISTS ix_job_images_user_deleted ON job_images(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS ix_job_images_user_category ON job_images(user_id, category);

-- 3. 为已有记录自动提取 title 和 company（从 parsed_job_json）
UPDATE job_images
SET title = parsed_job_json->>'title',
    company = parsed_job_json->>'company'
WHERE title IS NULL AND parsed_job_json IS NOT NULL;

-- 4. 为已有记录自动设置分类
UPDATE job_images
SET category = CASE
    WHEN title ILIKE '%开发%' OR title ILIKE '%工程师%' OR title ILIKE '%后端%' OR title ILIKE '%前端%' THEN '开发'
    WHEN title ILIKE '%产品%' THEN '产品'
    WHEN title ILIKE '%运营%' THEN '运营'
    WHEN title ILIKE '%设计%' OR title ILIKE '%UI%' OR title ILIKE '%UX%' THEN '设计'
    WHEN title ILIKE '%市场%' OR title ILIKE '%销售%' THEN '市场'
    ELSE '其他'
END
WHERE category IS NULL AND title IS NOT NULL;

-- 5. 为每个用户的第一个岗位设为默认
UPDATE job_images SET is_primary = TRUE
WHERE id IN (
    SELECT DISTINCT ON (user_id) id
    FROM job_images
    WHERE deleted_at IS NULL
    ORDER BY user_id, created_at ASC
);
