-- =============================================================
-- 智能简历 · 清除演示测试数据
-- 说明：仅删除演示账号（61ea5cd6-aeb9-4f44-8aff-37b0a9993823）名下的数据，不影响其他账号。
-- =============================================================

BEGIN;

-- 演示账号 id
--   61ea5cd6-aeb9-4f44-8aff-37b0a9993823
-- 按外键依赖逆序清理，可单独执行以彻底移除演示数据
DELETE FROM "public"."interview_questions" WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."interview_sessions"  WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."batch_job_tasks"
  WHERE batch_id IN (SELECT id FROM "public"."batch_optimizations" WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823');
DELETE FROM "public"."batch_optimizations" WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."feedbacks"           WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."ticket_replies"
  WHERE ticket_id IN (SELECT id FROM "public"."support_tickets" WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823');
DELETE FROM "public"."support_tickets"     WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
UPDATE "public"."optimized_resumes" SET parent_record_id = NULL WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."optimized_resumes"   WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."messages"            WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."audit_logs"          WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."ai_model_call_logs"  WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."user_quotas"         WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."orders"              WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."user_devices"        WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."resumes"             WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."job_images"          WHERE user_id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';
DELETE FROM "public"."users"               WHERE id = '61ea5cd6-aeb9-4f44-8aff-37b0a9993823';

COMMIT;
