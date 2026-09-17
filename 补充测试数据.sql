-- =============================================================
-- 智能简历 - 补充测试数据脚本
-- 说明：
--   1. 本脚本仅补充「空表」的测试数据，以及回填 resumes 表的 UI 展示字段。
--   2. 结构（24 张表）均已存在，无需再建表。
--   3. 外键统一引用以下已有主键，导入不会破坏约束：
--      用户        f7bb26d7-2621-44c7-91dc-d8e253a9bd80
--      管理员      f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e
--      简历        f900c48e-8b00-480e-a0f9-531a38cad2e2 / e0db4fb0-0fe1-4575-9b9e-0c1da68592c4
--      岗位        2618aa32-4b16-46a8-81f7-87907f76576e
--      优化记录    e238add3-e3b6-41a1-90ee-f584a58bba07
--   4. 已在同库导入过本脚本时，重复执行可能因主键冲突报错，可用 id 去重后重跑。
-- =============================================================

BEGIN;

-- ---------- 消息通知 messages ----------
INSERT INTO "public"."messages" (id, user_id, msg_type, title, content, ref_id, is_read, created_at) VALUES
('test-msg-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','optimize','简历优化完成','您的简历已完成优化，匹配度提升至 85%','e238add3-e3b6-41a1-90ee-f584a58bba07',false, now() - interval '1 day'),
('test-msg-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','score','简历评分结果','您的简历评分为 82 分','f900c48e-8b00-480e-a0f9-531a38cad2e2',true, now() - interval '12 hour'),
('test-msg-003','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','system','欢迎使用智能简历','欢迎使用智能简历系统，开始优化您的第一份简历吧',NULL,true, now() - interval '3 day'),
('test-msg-004','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','job','职位动态更新','您关注的「java高级后端开发工程师」有新动态','2618aa32-4b16-46a8-81f7-87907f76576e',false, now() - interval '2 hour'),
('test-msg-005','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','interview','面试提醒','您有一个面试安排在明天上午 10:00',NULL,false, now() - interval '30 min'),
('test-msg-006','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','activity','限时活动','会员限时 8 折优惠，快来领取',NULL,true, now() - interval '5 day'),
('test-msg-007','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','vip','会员即将到期','您的会员将在 3 天后到期',NULL,false, now() - interval '1 hour');

-- ---------- 日志：管理员日志 / 审计日志 / AI 调用日志 ----------
INSERT INTO "public"."admin_logs" (id, admin_id, action, target_type, target_id, details, ip_address, created_at) VALUES
('test-alog-001','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e','login',NULL,NULL,'{"result":"success"}','127.0.0.1', now() - interval '1 day'),
('test-alog-002','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e','update_user','user','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','{"field":"status"}','127.0.0.1', now() - interval '20 hour'),
('test-alog-003','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e','toggle_model','model_routing','test-model-001','{"enabled":true}','127.0.0.1', now() - interval '2 hour');

INSERT INTO "public"."audit_logs" (id, user_id, action, target_type, target_id, detail, ip_address, user_agent, created_at) VALUES
('test-audit-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','upload_resume','resume','f900c48e-8b00-480e-a0f9-531a38cad2e2','上传简历','127.0.0.1','Mozilla/5.0', now() - interval '2 day'),
('test-audit-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','favorite_job','job_image','2618aa32-4b16-46a8-81f7-87907f76576e','收藏岗位','127.0.0.1','Mozilla/5.0', now() - interval '1 day'),
('test-audit-003','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','create_optimization','optimized_resume','e238add3-e3b6-41a1-90ee-f584a58bba07','发起简历优化','127.0.0.1','Mozilla/5.0', now() - interval '20 hour');

INSERT INTO "public"."ai_model_call_logs" (id, user_id, model_name, prompt_template_name, prompt_version, input_tokens, output_tokens, latency_ms, is_success, error_message, cost_usd, created_at) VALUES
('test-ai-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','gpt-4o','简历优化',1,1800,2200,3420,true,NULL,0.0123, now() - interval '1 day'),
('test-ai-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','deepseek-chat','简历评分',1,1200,800,2100,true,NULL,0.0042, now() - interval '12 hour'),
('test-ai-003','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','gpt-4o-mini','岗位解析',2,500,900,1500,false,'rate limited',0.000000, now() - interval '3 hour');

-- ---------- AI 模型路由 / Prompt 模板 / 规则与关键词 ----------
INSERT INTO "public"."model_routing" (id, model_name, display_name, api_endpoint, api_key_encrypted, weight, rate_limit_per_minute, rate_limit_per_hour, max_consecutive_failures, consecutive_failures, failover_to, is_enabled, tier, created_at) VALUES
('test-model-001','gpt-4o','GPT-4o','https://api.openai.com/v1/chat/completions','enc:xxx',100,60,1000,5,0,NULL,true,'paid', now()),
('test-model-002','gpt-4o-mini','GPT-4o Mini','https://api.openai.com/v1/chat/completions','enc:yyy',50,120,2000,5,0,'test-model-001',true,'free', now()),
('test-model-003','deepseek-chat','DeepSeek Chat','https://api.deepseek.com/v1/chat/completions',NULL,80,60,1000,5,1,NULL,true,'free', now());

INSERT INTO "public"."prompt_templates" (id, name, scene, version, content, variables, is_active, gray_ratio, created_by, created_at) VALUES
('test-pt-001','简历优化','optimize',1,'你是简历优化专家，请根据目标岗位 {{job}} 优化以下简历 {{resume}}。','{"job":"string","resume":"string"}',true,100,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-pt-002','简历评分','score',1,'请从内容、结构、匹配度三个维度对简历打分：{{resume}}','{"resume":"string"}',true,0,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-pt-003','岗位解析','job_parse',2,'请解析以下岗位文字并返回结构化 JSON：{{text}}','{"text":"string"}',false,50,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now());

INSERT INTO "public"."ats_rules" (id, name, pattern, description, severity, is_active, created_by, created_at) VALUES
('test-ats-001','联系方式缺失','电话|手机|邮箱','检查联系方式是否完整','warning',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ats-002','教育经历缺失','教育','检查教育经历是否存在','error',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ats-003','工作年限不足','[0-9]+年','检查工作年限','info',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now());

INSERT INTO "public"."industry_keywords" (id, keyword, industry, category, is_active, created_by, created_at) VALUES
('test-ik-001','Java','互联网','hard_skill',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ik-002','Spring Boot','互联网','hard_skill',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ik-003','MySQL','互联网','hard_skill',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ik-004','Python','互联网','hard_skill',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now()),
('test-ik-005','沟通能力','通用','soft_skill',true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now());

-- ---------- 批量优化 / 任务 / 反馈 ----------
INSERT INTO "public"."batch_optimizations" (id, user_id, source_resume_id, status, total_jobs, completed_jobs, created_at, completed_at) VALUES
('test-batch-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','f900c48e-8b00-480e-a0f9-531a38cad2e2','completed',1,1, now() - interval '1 day', now() - interval '23 hour'),
('test-batch-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','e0db4fb0-0fe1-4575-9b9e-0c1da68592c4','pending',2,0, now() - interval '1 hour', NULL);

INSERT INTO "public"."batch_job_tasks" (id, batch_id, job_image_id, optimization_record_id, status, error_message, created_at) VALUES
('test-bj-001','test-batch-001','2618aa32-4b16-46a8-81f7-87907f76576e','e238add3-e3b6-41a1-90ee-f584a58bba07','completed',NULL, now() - interval '23 hour'),
('test-bj-002','test-batch-002','2618aa32-4b16-46a8-81f7-87907f76576e',NULL,'pending',NULL, now() - interval '1 hour');

INSERT INTO "public"."feedbacks" (id, user_id, optimization_record_id, outcome, created_at) VALUES
('test-fb-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','e238add3-e3b6-41a1-90ee-f584a58bba07','satisfied', now() - interval '20 hour'),
('test-fb-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','e238add3-e3b6-41a1-90ee-f584a58bba07','needs_improvement', now() - interval '2 hour');

-- ---------- 简历模板 / 套餐 / 额度 / 订单 / 工单 ----------
INSERT INTO "public"."resume_templates" (id, name, description, html_content, css_content, thumbnail_url, is_active, is_default, created_by, created_at, updated_at) VALUES
('test-rt-001','简洁风格','简约清爽的一页简历模板','<div class="resume">...</div>','.resume{padding:24px}',NULL,true,true,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now(), now()),
('test-rt-002','商务风格','适合金融、咨询行业的商务模板',NULL,NULL,NULL,true,false,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now(), now()),
('test-rt-003','创意风格','适合设计、新媒体岗位的创意模板',NULL,NULL,NULL,false,false,'f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', now(), now());

INSERT INTO "public"."quota_packages" (id, name, package_type, price, duration_days, quota_amount, is_active, created_at) VALUES
('test-qp-001','免费版','free',0.00,NULL,50,true, now()),
('test-qp-002','月度会员','monthly',29.90,30,300,true, now()),
('test-qp-003','年度会员','yearly',299.00,365,5000,true, now()),
('test-qp-004','优化次卡','package',99.00,NULL,50,true, now());

INSERT INTO "public"."user_quotas" (id, user_id, daily_limit, monthly_limit, daily_used, monthly_used, last_reset_date, is_paid, created_at, updated_at) VALUES
('test-uq-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80',3,50,1,12, now() - interval '1 day',false, now() - interval '30 day', now());

INSERT INTO "public"."orders" (id, user_id, order_no, package_type, package_name, amount, payment_method, status, refund_reason, refunded_by, paid_at, refunded_at, created_at) VALUES
('test-order-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','ORD202609050001','monthly','月度会员',29.90,'alipay','paid',NULL,NULL, now() - interval '3 day',NULL, now() - interval '3 day'),
('test-order-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','ORD202609010001','package','简历优化次卡 50 次',99.00,'wechat','completed',NULL,NULL, now() - interval '10 day',NULL, now() - interval '10 day'),
('test-order-003','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','ORD202608010001','monthly','月度会员',29.90,NULL,'pending',NULL,NULL,NULL,NULL, now() - interval '1 hour');

INSERT INTO "public"."support_tickets" (id, user_id, category, priority, subject, content, attachments, status, assigned_to, resolution, created_at, closed_at) VALUES
('test-ticket-001','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','功能咨询','medium','如何查看优化后的简历？','请问在哪里可以下载优化后的 PDF？',NULL,'open',NULL,NULL, now() - interval '1 day',NULL),
('test-ticket-002','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','故障反馈','high','PDF 导出出现空白','优化后的 PDF 出现空白页',NULL,'processing','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e',NULL, now() - interval '5 hour',NULL),
('test-ticket-003','f7bb26d7-2621-44c7-91dc-d8e253a9bd80','建议','low','建议增加更多模板','希望增加简历模板种类',NULL,'closed','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e','已记录，后续版本会新增模板', now() - interval '10 day', now() - interval '9 day');

INSERT INTO "public"."ticket_replies" (id, ticket_id, admin_id, user_id, content, is_internal, created_at) VALUES
('test-tr-001','test-ticket-002','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e',NULL,'已定位问题，正在修复中',false, now() - interval '4 hour'),
('test-tr-002','test-ticket-002','f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e',NULL,'备注：疑似字体加载导致',true, now() - interval '4 hour'),
('test-tr-003','test-ticket-001',NULL,'f7bb26d7-2621-44c7-91dc-d8e253a9bd80','请到「优化记录」页面点击下载',false, now() - interval '20 hour');

-- ---------- 回填 resumes 的 UI 展示字段 ----------
UPDATE "public"."resumes"
SET
  target_position = CASE
    WHEN title = '岗位' THEN 'Java 高级后端开发工程师'
    ELSE '新媒体运营 / 市场专员'
  END,
  target_company = CASE WHEN title = '岗位' THEN '某互联网公司' ELSE NULL END,
  match_rate = CASE
    WHEN id = 'f900c48e-8b00-480e-a0f9-531a38cad2e2' THEN 85
    ELSE 72
  END,
  score = CASE
    WHEN id = 'f900c48e-8b00-480e-a0f9-531a38cad2e2' THEN 82
    ELSE 68
  END,
  status   = 'optimized',
  is_favorite = CASE WHEN id = 'f900c48e-8b00-480e-a0f9-531a38cad2e2' THEN true ELSE false END,
  updated_at = now()
WHERE user_id = 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80'
  AND (target_position IS NULL OR match_rate IS NULL OR score IS NULL);

COMMIT;