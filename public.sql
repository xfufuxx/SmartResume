/*
 Navicat Premium Data Transfer

 Source Server         : PostgreSql
 Source Server Type    : PostgreSQL
 Source Server Version : 180004 (180004)
 Source Host           : localhost:5432
 Source Catalog        : smart_resume
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 180004 (180004)
 File Encoding         : 65001

 Date: 05/09/2026 10:15:51
*/


-- ----------------------------
-- Table structure for admin_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."admin_logs";
CREATE TABLE "public"."admin_logs" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "admin_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "action" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "target_type" varchar(32) COLLATE "pg_catalog"."default",
  "target_id" varchar(36) COLLATE "pg_catalog"."default",
  "details" jsonb,
  "ip_address" varchar(45) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of admin_logs
-- ----------------------------

-- ----------------------------
-- Table structure for admins
-- ----------------------------
DROP TABLE IF EXISTS "public"."admins";
CREATE TABLE "public"."admins" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "username" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "password_hash" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "role" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "email" varchar(255) COLLATE "pg_catalog"."default",
  "last_login_ip" varchar(45) COLLATE "pg_catalog"."default",
  "last_login_at" timestamptz(6),
  "is_active" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of admins
-- ----------------------------
INSERT INTO "public"."admins" VALUES ('f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e', 'superadmin', '$2b$12$i8bfWcMmFH5X1P3QAZmfle8qR0toc6rRBTGd/gtFSYINVyacqU5re', 'super_admin', 'admin@example.com', NULL, '2026-06-01 13:29:01.337623+08', 't', '2026-06-01 13:04:28.257549+08');

-- ----------------------------
-- Table structure for ai_model_call_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."ai_model_call_logs";
CREATE TABLE "public"."ai_model_call_logs" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default",
  "model_name" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "prompt_template_name" varchar(64) COLLATE "pg_catalog"."default",
  "prompt_version" int4,
  "input_tokens" int4,
  "output_tokens" int4,
  "latency_ms" int4,
  "is_success" bool NOT NULL,
  "error_message" text COLLATE "pg_catalog"."default",
  "cost_usd" numeric(10,6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of ai_model_call_logs
-- ----------------------------

-- ----------------------------
-- Table structure for ats_rules
-- ----------------------------
DROP TABLE IF EXISTS "public"."ats_rules";
CREATE TABLE "public"."ats_rules" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "name" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "pattern" text COLLATE "pg_catalog"."default" NOT NULL,
  "description" text COLLATE "pg_catalog"."default",
  "severity" varchar(16) COLLATE "pg_catalog"."default" NOT NULL,
  "is_active" bool NOT NULL,
  "created_by" varchar(36) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of ats_rules
-- ----------------------------

-- ----------------------------
-- Table structure for audit_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."audit_logs";
CREATE TABLE "public"."audit_logs" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default",
  "action" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "target_type" varchar(32) COLLATE "pg_catalog"."default",
  "target_id" varchar(36) COLLATE "pg_catalog"."default",
  "detail" text COLLATE "pg_catalog"."default",
  "ip_address" varchar(45) COLLATE "pg_catalog"."default",
  "user_agent" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of audit_logs
-- ----------------------------

-- ----------------------------
-- Table structure for batch_job_tasks
-- ----------------------------
DROP TABLE IF EXISTS "public"."batch_job_tasks";
CREATE TABLE "public"."batch_job_tasks" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "batch_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "job_image_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "optimization_record_id" varchar(36) COLLATE "pg_catalog"."default",
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "error_message" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of batch_job_tasks
-- ----------------------------

-- ----------------------------
-- Table structure for batch_optimizations
-- ----------------------------
DROP TABLE IF EXISTS "public"."batch_optimizations";
CREATE TABLE "public"."batch_optimizations" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "source_resume_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "total_jobs" int4 NOT NULL,
  "completed_jobs" int4 NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "completed_at" timestamptz(6)
)
;

-- ----------------------------
-- Records of batch_optimizations
-- ----------------------------

-- ----------------------------
-- Table structure for feedbacks
-- ----------------------------
DROP TABLE IF EXISTS "public"."feedbacks";
CREATE TABLE "public"."feedbacks" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "optimization_record_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "outcome" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of feedbacks
-- ----------------------------

-- ----------------------------
-- Table structure for industry_keywords
-- ----------------------------
DROP TABLE IF EXISTS "public"."industry_keywords";
CREATE TABLE "public"."industry_keywords" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "keyword" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "industry" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "category" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "is_active" bool NOT NULL,
  "created_by" varchar(36) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of industry_keywords
-- ----------------------------

-- ----------------------------
-- Table structure for job_images
-- ----------------------------
DROP TABLE IF EXISTS "public"."job_images";
CREATE TABLE "public"."job_images" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "image_url" varchar(1024) COLLATE "pg_catalog"."default" NOT NULL,
  "parsed_job_json" jsonb,
  "ocr_text" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "title" varchar(200) COLLATE "pg_catalog"."default",
  "company" varchar(200) COLLATE "pg_catalog"."default",
  "category" varchar(50) COLLATE "pg_catalog"."default",
  "is_primary" bool DEFAULT false,
  "is_favorite" bool DEFAULT false,
  "user_remark" text COLLATE "pg_catalog"."default",
  "deleted_at" timestamptz(6)
)
;

-- ----------------------------
-- Records of job_images
-- ----------------------------
INSERT INTO "public"."job_images" VALUES ('7f609c3e-18a1-402a-8944-2415be96906e', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', '{"title": "java高级后端开发工程师", "company": null, "industry": null, "location": "南京", "must_have": {"skills": ["Java", "MySQL", "MyBatis", "Oracle", "MES开发经验", "Springboot", "微服务开发", "Spring Cloud Alibaba", "Linux系统"], "education": "计算机相关专业本科及以上学历", "experience": "5年及以上后端研发经验"}, "soft_skills": [], "nice_to_have": {"skills": [], "qualifications": ["有电网数字化项目开发经验优先"]}, "salary_range": "10-15K", "original_text": "java高级后端开发工程师 10-15K\n南京 3-5年 本科\n职位描述\n微信扫码分享 举报\nMES开发经验 Java MySQL MyBatis Oracle\n岗位职责：\n1、负责全域直流管控项目后端代码编写、自测、性能优化等工作；\n2、负责电网业务需求理解，并合理化设计接口服务及数据库；\n3、独立完成代码编写和自测工作；\n4、配合项目经理进行版本发布工作。\n5、编写接口文档、软件设计相关文档。\n任职要求：\n1、计算机相关专业本科及以上学历，5年及以上后端研发经验；\n2、熟练掌握Springboot下的微服务开发，熟悉Spring Cloud Alibaba下的配置、注册、开发工作；\n3、熟练掌握Mybatis开发技术，熟练使用Oracel、Mysql数据库；\n4、熟悉Linux系统，能独立完成打包部署实施工作；\n5、有电网数字化项目开发经验优先；", "responsibilities": ["负责全域直流管控项目后端代码编写、自测、性能优化等工作；", "负责电网业务需求理解，并合理化设计接口服务及数据库；", "独立完成代码编写和自测工作；", "配合项目经理进行版本发布工作。", "编写接口文档、软件设计相关文档。"]}', NULL, '2026-06-18 15:19:42.046126+08', 'java高级后端开发工程师 (副本)', NULL, '开发', 'f', 'f', NULL, '2026-06-18 15:19:44.356356+08');
INSERT INTO "public"."job_images" VALUES ('2618aa32-4b16-46a8-81f7-87907f76576e', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', '{"title": "java高级后端开发工程师", "company": null, "industry": null, "location": "南京", "must_have": {"skills": ["Java", "MySQL", "MyBatis", "Oracle", "MES开发经验", "Springboot", "微服务开发", "Spring Cloud Alibaba", "Linux系统"], "education": "计算机相关专业本科及以上学历", "experience": "5年及以上后端研发经验"}, "soft_skills": [], "nice_to_have": {"skills": [], "qualifications": ["有电网数字化项目开发经验优先"]}, "salary_range": "10-15K", "original_text": "java高级后端开发工程师 10-15K\n南京 3-5年 本科\n职位描述\n微信扫码分享 举报\nMES开发经验 Java MySQL MyBatis Oracle\n岗位职责：\n1、负责全域直流管控项目后端代码编写、自测、性能优化等工作；\n2、负责电网业务需求理解，并合理化设计接口服务及数据库；\n3、独立完成代码编写和自测工作；\n4、配合项目经理进行版本发布工作。\n5、编写接口文档、软件设计相关文档。\n任职要求：\n1、计算机相关专业本科及以上学历，5年及以上后端研发经验；\n2、熟练掌握Springboot下的微服务开发，熟悉Spring Cloud Alibaba下的配置、注册、开发工作；\n3、熟练掌握Mybatis开发技术，熟练使用Oracel、Mysql数据库；\n4、熟悉Linux系统，能独立完成打包部署实施工作；\n5、有电网数字化项目开发经验优先；", "responsibilities": ["负责全域直流管控项目后端代码编写、自测、性能优化等工作；", "负责电网业务需求理解，并合理化设计接口服务及数据库；", "独立完成代码编写和自测工作；", "配合项目经理进行版本发布工作。", "编写接口文档、软件设计相关文档。"]}', NULL, '2026-06-05 15:43:48.157485+08', 'java高级后端开发工程师', NULL, '开发', 't', 't', NULL, NULL);

-- ----------------------------
-- Table structure for messages
-- ----------------------------
DROP TABLE IF EXISTS "public"."messages";
CREATE TABLE "public"."messages" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "msg_type" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "title" varchar(255) COLLATE "pg_catalog"."default",
  "content" text COLLATE "pg_catalog"."default",
  "ref_id" varchar(36) COLLATE "pg_catalog"."default",
  "is_read" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of messages
-- ----------------------------

-- ----------------------------
-- Table structure for model_routing
-- ----------------------------
DROP TABLE IF EXISTS "public"."model_routing";
CREATE TABLE "public"."model_routing" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "model_name" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "display_name" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "api_endpoint" varchar(512) COLLATE "pg_catalog"."default" NOT NULL,
  "api_key_encrypted" text COLLATE "pg_catalog"."default",
  "weight" int4 NOT NULL,
  "rate_limit_per_minute" int4 NOT NULL,
  "rate_limit_per_hour" int4 NOT NULL,
  "max_consecutive_failures" int4 NOT NULL,
  "consecutive_failures" int4 NOT NULL,
  "failover_to" varchar(36) COLLATE "pg_catalog"."default",
  "is_enabled" bool NOT NULL,
  "tier" varchar(16) COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of model_routing
-- ----------------------------

-- ----------------------------
-- Table structure for optimized_resumes
-- ----------------------------
DROP TABLE IF EXISTS "public"."optimized_resumes";
CREATE TABLE "public"."optimized_resumes" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "resume_id" varchar(36) COLLATE "pg_catalog"."default",
  "job_image_id" varchar(36) COLLATE "pg_catalog"."default",
  "original_json" jsonb,
  "optimized_json" jsonb,
  "match_score" int4,
  "pdf_url" varchar(1024) COLLATE "pg_catalog"."default",
  "changes_description" text COLLATE "pg_catalog"."default",
  "custom_instructions" text COLLATE "pg_catalog"."default",
  "job_title" varchar(255) COLLATE "pg_catalog"."default",
  "company" varchar(255) COLLATE "pg_catalog"."default",
  "category" varchar(50) COLLATE "pg_catalog"."default",
  "thumbnail_url" varchar(1024) COLLATE "pg_catalog"."default",
  "is_favorite" bool NOT NULL,
  "satisfaction_score" int4,
  "feedback_text" text COLLATE "pg_catalog"."default",
  "parent_record_id" varchar(36) COLLATE "pg_catalog"."default",
  "refine_count" int4 NOT NULL,
  "deleted_at" timestamptz(6),
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'completed'::character varying,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of optimized_resumes
-- ----------------------------
INSERT INTO "public"."optimized_resumes" VALUES ('e238add3-e3b6-41a1-90ee-f584a58bba07', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java", "MySQL", "MyBatis", "Oracle", "Spring Boot", "微服务架构", "Spring Cloud Alibaba", "Linux系统", "语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，锻炼了出色的项目执行力与用户需求分析能力。具备良好的沟通与团队协作能力，能快速融入团队。目前正在系统学习Java后端开发技术栈，熟悉Spring Boot、MyBatis、MySQL、Oracle等技术，对微服务架构和Linux系统有一定了解，正寻求将过往的逻辑思维与项目执行能力迁移到后端研发领域。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责“OPPO校园俱乐部”项目运营，通过策划创意活动与社群运营，在全国高校范围内集结并管理核心用户社群，提升了品牌在校园渠道的传播影响力。", "根据品牌客户诉求与产品特点，制定并执行品牌传播策略，负责创意构思与文案撰写，有效提升了用户互动与参与度。", "挖掘并分析用户使用习惯与体验数据，结合产品特点撰写传播策划方案，为产品优化与市场推广提供了数据洞察。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写推广文案，协助执行线上运营活动，保证了活动内容的按时、高质量发布。", "负责公司自媒体平台（微博、微信公众平台）的信息发布与日常维护，确保了内容更新的及时性与准确性。", "通过策划与执行微博热点活动，成功实现单条活动参与量超1,000人，获得1,000次转发与500条回复，显著提升了账号互动数据。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/25ebb6d6-8aab-4b25-af3f-816e0dead00c.pdf', '*   **技能列表大幅扩充**：原简历仅包含语言、计算机基础能力，优化后新增了“Java”、“MySQL”、“Spring Boot”、“微服务架构”等一整套后端开发技术栈。
*   **个人总结重塑求职目标**：优化后的总结不仅保留了原有的项目执行力等软实力，更明确指出“目前正在系统学习Java后端开发技术栈”，并将过往经验与目标岗位（后端研发）进行了关联，点明了职业转型意图。
*   **工作经历描述优化**：对两段实习经历的工作职责进行了语言润色和结构化重组，使表述更专业、更具主动性（如“负责”、“制定并执行”），并隐含了对执行结果的量化描述（如“提升了传播影响力”、“显著提升了账号互动数据”）。
*   **强化了技术学习意向**：在“总结”和新增的“技能”部分，反复、具体地强调了对Java及相关后端技术的学习，这是原简历中完全没有的新方向，是本次优化最核心的改动。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-11 10:29:09.014141+08');
INSERT INTO "public"."optimized_resumes" VALUES ('38e9f303-6db9-48b6-b0ad-15ba8cf3b1f4', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程基础：通过全国计算机等级考试（二级C），具备基础编程逻辑与算法思维", "数据库基础：熟悉SQL语言基础，了解关系型数据库（如MySQL）的基本操作", "办公软件：精通Word、Excel、PPT，具备撰写技术文档、项目计划书及汇报材料的能力", "语言能力：大学英语六级，可阅读英文技术文档及开源社区资料", "技术栈（学习中）：正在系统学习Java、Spring Boot、MyBatis、MySQL、Linux等后端开发技术", "框架（熟悉）：熟悉Spring Cloud Alibaba微服务框架的核心组件与开发模式"], "summary": "具备多年互联网项目策划与执行经验，深刻理解从需求分析、方案设计到落地实施的全流程，擅长逻辑分析、文档编写与跨团队协作。拥有扎实的计算机基础（C语言二级）和强大的学习能力，现已系统学习并掌握Java后端开发技术栈（Spring Boot、MyBatis、MySQL、Linux），致力于将过往的业务理解与项目管理能力与后端开发技术相结合。寻求Java高级后端开发工程师岗位，期望在电网数字化或工业互联网领域（如MES系统）贡献价值。", "projects": [{"end": "2015.08", "name": "OPPO校园品牌数字化推广项目", "role": "项目执行与内容策划", "start": "2015.07", "points": ["基于OPPO产品特点与品牌诉求，策划并执行全国性校园线上推广方案，独立负责从创意构想、文案撰写到活动落地的全流程，成功集结高校粉丝社群。", "深度挖掘并分析用户（学生群体）使用习惯与情感反馈，结合产品特性撰写详细的传播策划方案，体现了将业务需求转化为具体方案的能力。", "独立运营官方微博平台，通过内容发布、互动维护与热点活动策划，实现单条活动参与人数超1000，转发1000次，展现了独立负责模块与数据分析优化的思维。"]}], "education": [{"end": "2016.07", "major": "计算机相关专业", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "项目执行与内容策划", "points": ["负责基于品牌与产品特点，策划并执行全国性校园数字化推广方案，通过创意构想与文案撰写，将业务需求转化为具体的传播策略与执行文档。", "挖掘分析用户（学生）使用习惯与反馈数据，结合产品特性撰写详细的策划方案，体现了需求理解、数据分析与方案设计能力。", "独立运营官方微博平台，负责内容发布、互动维护与活动执行，成功策划并落地线上热点活动，实现用户参与度与传播效果的大幅提升。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体平台（微博、微信）的内容发布、信息维护与基础运营工作，熟悉线上平台的信息管理与发布流程。", "协助执行线上推广活动，负责相关软文撰写与活动支持，具备独立完成模块任务的能力。", "通过策划与执行微博热点活动，实现单条活动参与超1000人、转发1000次，锻炼了活动策划、执行与数据反馈的初步能力。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 10, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/5baa7f01-39cd-4f62-957c-27e6ab6cd2ea.pdf', '- **简历定位与方向调整**：从以校园推广、活动策划为主的综合型简历，转变为以Java后端开发为目标的垂直型技术简历，突出了向开发岗位的转型意图。
- **技能体系重构与深化**：删除了原有的计算机二级、办公软件等基础技能描述，新增了编程语言、框架、数据库等后端开发技术栈，并标注了“学习中”、“熟悉”等状态，明确了技术能力。
- **教育背景适配性修改**：将“市场营销”专业修改为“计算机相关专业”，以增强与目标技术岗位的匹配度。
- **描述语言技术化与专业化**：将所有工作经历的描述从“校园推广”、“新媒体运营”等业务视角，重写为“需求分析”、“方案设计”、“数据分析”等更通用、更技术化的项目语言。
- **经验呈现项目化与成果化**：将两段工作经历整合为“项目经验”，并为每个要点增加了更具体、可量化的能力体现（如“体现了…能力”、“锻炼了…能力”），使经验描述更聚焦于个人所承担的职责与产出的结果。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-11 14:14:26.894472+08');
INSERT INTO "public"."optimized_resumes" VALUES ('0c458be4-7397-4f6c-8135-c8c6c2aa7960', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "办公软件：熟练掌握Word、Excel、PPT等日常办公软件", "需求分析与方案设计：具备多年活动策划与执行经验，擅长从需求出发制定策略与方案", "项目执行与文档编写：拥有项目执行、监控与文档（如策划方案、传播文案）撰写经验", "沟通协作与问题解决：具备良好的跨团队沟通协作能力，能在复杂任务中确保执行与问题解决"], "summary": "具备多年活动策划与执行经验，擅长从需求分析到方案制定与高效执行。拥有出色的逻辑思维与沟通协作能力，能快速理解复杂业务并转化为可执行方案，注重文档化与结果复盘，可快速融入团队并应对挑战。具备优秀的自驱力与学习能力，对技术驱动的业务解决方案有浓厚兴趣。", "projects": [{"name": "校园品牌传播与用户运营项目", "role": "策略制定与执行负责人", "highlights": ["独立制定并执行品牌在校园渠道的整合传播方案。", "基于用户数据分析，优化活动设计，单次活动参与人数超1,000，转发量达1,000次。", "负责项目全流程文档（策略方案、执行细则、效果报告）的编写与归档。"], "tech_stack": ["用户数据分析与洞察", "项目策划与执行", "文档编写与归档"], "description": "独立负责大型品牌在校园渠道的传播策略制定与执行。基于产品特点与用户洞察，设计创意构想与文案，并监控执行过程。通过数据分析活动参与、转发、回复等效果，持续优化传播方案，确保项目目标达成。此过程锻炼了从需求理解、方案设计、独立执行到效果优化的全流程能力，并形成了清晰的文档化记录习惯。"}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营（品牌传播策略）", "points": ["负责基于产品特点制定品牌传播策略，主导创意构想与文案撰写，体现了需求分析、方案设计与执行能力。", "挖掘分析用户习惯与体验感受，结合产品特点撰写传播策划方案，展现了数据驱动的思维和对用户需求的理解。", "协调资源，独立推进项目执行，并编写相关策划与执行文档。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体（微博、微信公众平台）的信息发布、维护与用户互动，确保平台运营的稳定与效果。", "协助执行线上推广活动，撰写推广文案，并负责相关执行文档的编写。", "通过监控活动数据（如参与量、转发量、回复量），验证活动效果，展现了执行力与结果导向。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 15, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/66042b77-b11a-4efc-ab39-632e76ae45db.pdf', '- 技能部分从基础技能（语言、计算机）扩展为体现综合能力的五大核心能力，增加了需求分析、项目执行、沟通协作等软技能。
- 个人总结从侧重“校园渠道和活动执行”扩展为突出“逻辑思维、学习能力、自驱力及对技术业务的兴趣”，更具职业潜力。
- 新增了“项目经历”板块，将原本分散在工作经验中的核心校园推广案例整合为一个完整的项目，补充了角色、描述、量化亮点和技术栈，使能力呈现更结构化。
- 对原有的两段“工作经验”内容进行了深度重写，将职责描述转化为体现“需求分析、方案设计、数据驱动、文档编写”等可迁移能力的要点。
- 优化后的简历整体从“罗列职责”转向了“突出能力与成果”，结构更清晰，更符合招聘方对候选人能力模型的要求。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-11 22:48:07.781714+08');
INSERT INTO "public"."optimized_resumes" VALUES ('3b606319-dcc2-4a01-b7ef-1218e53c0031', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java后端开发：正在系统学习Java编程语言及Springboot框架，了解微服务架构概念", "数据库技术：学习MySQL数据库基础，了解SQL查询与数据库设计", "开发工具：熟悉Git版本控制基础，了解Linux系统基本操作", "办公技能：熟练使用Word、Excel、PPT等日常办公软件", "语言能力：通过大学英语六级、普通话二级甲等"], "summary": "多年校园推广及活动策划工作经历，具备出色的需求理解、方案设计与执行落地能力。在品牌传播项目中，能快速理解客户诉求并转化为可执行方案，这与后端开发中理解业务需求、设计接口服务的能力高度契合。现积极转型学习Java后端开发，渴望将过往的互联网运营思维与后端技术相结合，致力于成为一名懂业务的开发者。", "projects": [{"name": "基于Springboot的个人博客系统（学习项目）", "role": "开发者", "duration": "学习中", "highlights": ["独立完成从需求分析、数据库设计到后端接口编码的全流程实践", "通过项目实践，深入理解MVC分层架构与Web应用开发流程"], "description": "为巩固Java后端知识，正在独立设计与开发一个博客系统。项目使用Springboot构建RESTful API，集成MySQL进行数据持久化，并计划使用Git进行版本管理。"}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["根据客户（OPPO）业务诉求，深入分析产品特点与校园用户行为，负责制定并落地全国范围的品牌传播策略，体现了对业务需求的深刻理解与方案设计能力；", "独立负责创意构想与文案撰写，并推动项目在全国高校的执行，展现了良好的项目管理与执行力；", "挖掘分析用户数据与情感体验，结合产品特性撰写传播策划方案，具备基于数据的分析与方案优化意识。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体平台（微博、微信）的内容规划、信息发布与日常维护，确保平台稳定运行；", "协助策划并执行线上推广活动，具备项目执行与落地的实践经验；", "业绩：通过精细化运营，成功策划单条微博热点活动，实现参与超1,000人、转发1,000次、回复500条的传播效果。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 15, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/1e9f031d-1527-4431-b10b-66321e70924c.pdf', '- 技能部分从侧重办公与语言能力调整为增加Java后端开发、数据库、开发工具等技术技能，突出了转型目标岗位的核心能力。
- 个人总结重写，强调了过往运营能力（需求理解、方案设计）与后端开发所需能力的关联性，并明确了职业转型方向。
- 新增“个人博客系统”学习项目，以证明实际编程实践能力和技术学习进度。
- 工作经历的描述进行了优化，更突出业务理解、数据分析和项目落地能力，使描述更贴近技术岗位对“软技能”的要求。
- 技能列表顺序调整，将技术技能前置，语言和办公技能后置，使简历结构更符合目标岗位（后端开发）的筛选重点。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-12 16:33:26.429056+08');
INSERT INTO "public"."optimized_resumes" VALUES ('210936fe-83c9-4a02-bb12-a14f46205db6', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java基础（熟悉）", "MySQL数据库（熟悉）", "Linux系统基础操作", "熟悉Git版本控制工具", "了解Spring Boot、MyBatis等主流开发框架（学习中）", "了解RESTful API设计与文档编写"], "summary": "具备快速学习能力、优秀的项目执行与团队协作经验，对后端开发技术有浓厚兴趣，正在系统学习Java、Spring Boot、MySQL等后端技术栈，并致力于将过往的业务需求理解、方案设计与独立执行经验，应用于后端开发与优化工作中。", "projects": [{"end": "2023.12", "name": "个人博客系统（学习项目）", "start": "2023.10", "points": ["基于Spring Boot + MyBatis + MySQL技术栈，独立设计并实现一个简单的博客后端服务，包括用户管理、文章发布、评论等基础功能；", "负责数据库表结构设计（MySQL），实现数据持久化与基本查询优化；", "遵循MVC分层架构进行代码编写，完成自测，并编写基础的接口文档（Markdown格式）。"]}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["基于产品特点与用户需求分析，独立设计并执行品牌传播方案，从创意构思、文案撰写到渠道落地，确保项目目标达成；", "深度理解业务诉求，结合用户行为与情感分析，撰写并优化传播策略，提升用户参与度与品牌影响力；", "负责项目全流程执行与进度跟踪，确保活动在多校区范围内的高效落地与效果评估。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["独立负责新媒体平台（微博、微信）的内容策划、撰写与发布，确保信息准确、及时传达；", "协助执行推广活动，负责活动文案撰写与用户互动维护，单条微博热点活动参与人数超1,000，转发1,000次，回复500条；", "具备良好的文档撰写习惯，能够清晰记录工作流程与成果。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 10, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/1676e050-cec4-4d7e-bee8-a00da2a2b63e.pdf', '- 个人简介从强调校园推广与活动策划经验，转变为突出快速学习能力、项目执行力及向后端开发技术的转型意愿和基础。
- 工作经历的描述被重新组织和优化，从侧重具体任务与成果，转变为更强调独立设计、全流程执行、业务理解与分析等可迁移的核心能力。
- 技能列表进行了根本性替换，从通用的办公、语言及计算机考试证书，调整为针对后端开发岗位的具体技术栈（如Java、MySQL、Git、框架学习等）。
- 新增了“项目”部分，详细描述了一个与目标岗位技术要求高度相关的个人学习项目，以证明实践能力与学习成果。
- 整体结构虽保持完整，但内容重心已从市场营销/运营领域，全面转向支撑后端开发工程师的求职目标。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-20 00:18:10.56004+08');
INSERT INTO "public"."optimized_resumes" VALUES ('d59e5552-39e3-4337-8938-bc4a232919c4', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java基础、Spring Boot、MyBatis框架应用", "熟悉MySQL、Oracle数据库设计与SQL操作", "了解Linux系统基本操作与Shell命令", "熟悉Spring Cloud Alibaba微服务架构基础组件（如Nacos）", "具备MES系统业务逻辑理解能力，有相关学习或项目实践经验", "语言能力：通过大学英语六级、普通话二级甲等", "熟练掌握Word、Excel、PPT等日常办公软件"], "summary": "市场营销专业背景，拥有多年校园推广及活动策划执行经验，具备出色的需求理解、方案设计与项目落地能力。目前正在系统性地转型学习Java后端开发，已掌握Spring Boot、MyBatis、MySQL等核心技术栈，并对MES系统及电网数字化业务有初步研究和学习兴趣。期望将过往项目管理、逻辑梳理与高效执行能力应用于后端开发，快速融入团队并贡献价值。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营（项目制）", "points": ["深度理解客户（品牌方）在校园场景下的推广需求，负责策划并执行“OPPO校园俱乐部”全国性品牌传播方案，将用户从参与者转化为品牌共创者；", "基于产品特性与目标用户（校园学生）画像，进行传播策略设计、创意构思及文案输出，确保方案可执行、可衡量；", "分析用户互动数据与反馈，持续优化传播内容与活动形式，提升品牌在目标群体中的认知度与参与度。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司新媒体渠道（微博、微信）的内容规划、撰写与日常维护，确保信息准确、及时发布；", "协助策划并执行线上推广活动，跟踪活动数据（如参与量、转发量、互动量），进行初步效果分析与总结；", "通过用户互动与内容运营，成功提升账号活跃度，单条微博热点活动参与超1000人，获得1000次转发及500条回复。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 15, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/0ce8ac52-6d9b-48e2-9392-a9cffe71870b.pdf', '- **技能部分大幅扩充技术栈**：从原有的基础办公和语言能力，新增了Java、Spring Boot、数据库、Linux等后端开发技能，并加入了对MES系统及微服务架构的了解。
- **个人总结重新定位职业方向**：突出了从市场营销向Java后端开发的转型意向，明确了技术学习成果与职业目标的结合，并提及了对特定业务领域（如电网数字化）的兴趣。
- **工作经历描述更加专业化与量化**：对两段经历的描述进行了润色，使用了更专业的术语（如“用户画像”、“效果分析”），并将成果数据整合进描述中，逻辑更清晰。
- **职位名称更加准确**：将第一段经历的“新媒体运营”修改为“新媒体运营（项目制）”，更贴合实际工作形式。
- **补充了对办公软件的掌握描述**：在技能中明确“熟练掌握”办公软件，表述更自信。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-12 17:15:46.255742+08');
INSERT INTO "public"."optimized_resumes" VALUES ('bcce820e-e936-4620-b317-a04e5ee0d6a5', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程语言：熟悉Java，掌握面向对象编程思想，有个人项目开发经验", "数据库：熟悉MySQL，了解Oracle，掌握基本SQL语句及数据库设计", "开发框架：熟悉Spring Boot，了解微服务与Spring Cloud Alibaba基本概念", "工具与环境：熟悉Linux基本命令，可进行环境部署与日志查看；熟练使用Git进行版本控制", "办公技能：精通Word、Excel、PPT等日常办公软件，具备良好的文档编写能力", "语言能力：通过大学英语六级，具备良好的英文文档阅读能力"], "summary": "具备多年互联网运营与项目管理经验，熟悉从需求分析、策略制定到落地执行的全流程，具备高度执行力和良好的沟通协作能力。对Java后端开发有浓厚兴趣，自学习掌握了Java基础、MySQL、Spring Boot等核心技术，并有个人项目经验，渴望将运营与项目管理经验与后端技术结合，投身于企业级系统开发。", "projects": [{"end": "2023.03", "name": "个人博客系统", "role": "独立开发者", "start": "2023.01", "points": ["使用Java、Spring Boot、MySQL独立开发一个个人博客后端系统，实现了用户管理、文章发布、评论等功能。", "负责数据库表结构设计，编写RESTful API接口，并使用MyBatis进行数据持久化。", "项目部署在Linux云服务器上，熟悉了从开发、测试到上线部署的完整流程。"]}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["基于产品特点与用户需求，负责品牌传播策略的创意构思与文案撰写，独立完成传播策划方案，这与理解业务需求并设计接口服务的职责相通；", "挖掘分析用户行为数据与情感反馈，为运营决策提供依据，培养了数据分析与需求洞察的能力；", "协调多方资源，确保活动方案在各大高校落地执行，体现了项目管理、跨团队协作与版本发布配合的经验。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体平台（微博、微信）的内容发布、维护及推广活动执行，独立完成软文撰写，锻炼了逻辑表达与文档编写能力；", "通过策划微博热点活动，单条参与超1,000人，获得1,000次转发与500条回复，证明了其数据驱动、优化迭代的执行能力，与代码自测与性能优化思维相通。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/2277281d-455b-4e2c-aaf8-1fc55939ee4b.pdf', '- **整体定位与目标重塑**：核心修改点是将简历的目标岗位从“运营/策划”明确转向“Java后端开发”。个人总结被重写，突出了对技术的兴趣、自学成果（Java、Spring Boot等）以及结合过往经验从事技术工作的意愿。
- **个人总结重写**：原总结聚焦于校园推广和活动执行能力；优化后总结强调了全流程项目管理经验，并明确引入了技术栈（Java、MySQL）和个人技术项目，直接与求职目标对齐。
- **工作经历的“技术化”包装**：原有运营经验被重新表述，用词向技术岗位靠拢。例如，将“品牌传播策略”类比为“理解业务需求并设计接口服务”，将“数据分析”与“需求洞察”结合，将“活动执行”关联到“项目管理与版本发布配合”。
- **技能部分的彻底更新**：完全替换了原有的语言和基础办公技能列表，变为一套针对后端开发的技术技能栈，包括Java、MySQL、Spring Boot、Linux、Git等，并保留了英语能力但更强调其用于阅读技术文档的实用性。
- **新增技术项目经验**：补充了简历中原本缺失的“projects”部分，详细描述了一个使用Java、Spring Boot和MySQL开发的个人博客系统项目，展示了从设计、开发到部署的完整实践，作为技术能力的直接证明。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-18 16:01:32.452436+08');
INSERT INTO "public"."optimized_resumes" VALUES ('28d9d78f-f6f8-46cc-afce-f9b1e8b299e6', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'f900c48e-8b00-480e-a0f9-531a38cad2e2', '2618aa32-4b16-46a8-81f7-87907f76576e', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["计算机基础：通过全国计算机等级考试（二级C），具备编程基础与逻辑思维能力，熟悉C语言语法与程序设计，可快速学习并迁移至Java开发。", "语言能力：通过大学英语六级、普通话二级甲等。", "办公软件：熟练掌握Word、Excel、PPT等日常办公软件，用于文档编写与项目管理。", "待补充技能：正在系统学习Java、Spring Boot、MySQL、MyBatis、微服务（Spring Cloud Alibaba）及Linux系统，以匹配岗位技术栈要求。"], "summary": "具备多年项目执行与活动策划经验，擅长需求理解、策略制定与跨团队协作，对软件开发流程中的需求分析、文档编写和版本管理有良好理解。熟悉计算机基础知识（C语言），拥有快速学习新技术栈的能力，可快速迁移到Java后端开发领域。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["理解客户需求（OPPO品牌传播诉求），基于产品特点制定并执行线上线下整合传播策略，涵盖创意构想、文案撰写与效果分析。", "负责项目全国范围内的高校渠道策略制定与执行，将用户从参与者转化为品牌传播者，体现了对业务需求的深度理解与项目管理能力。", "挖掘并分析用户数据与行为习惯，撰写传播策划方案，为产品功能优化与推广策略提供了数据支撑。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体平台（微博、微信）的内容发布、维护与运营，具备文档编写、信息发布与版本管理的经验。", "协助策划并执行线上推广活动，单条微博热点活动实现1,000+参与、1,000次转发及500条互动，锻炼了活动执行与数据分析能力。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 10, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/4a0c0c44-9f98-433e-9ae7-e3d34cad3275.pdf', '- **技能部分重构与目标岗位适配**：将原技能列表中偏向通识的描述（如办公软件）细化，新增“待补充技能”部分明确列出正在学习的技术栈（Java、Spring Boot等），强调技能迁移能力，直接指向Java后端开发岗位。
- **自我评价重写**：将原“校园推广及活动策划”经验，转化为“项目执行与活动策划”、“需求理解与策略制定”等通用能力，并补充对“软件开发流程”的理解，突出与技术岗位相关的分析与学习能力。
- **工作经历描述专业化**：将执行层面描述（如“撰写软文”、“集结粉丝”）升级为体现策略思维与数据能力的表述（如“制定整合传播策略”、“分析用户数据与行为习惯”），强化与技术岗位所需逻辑思维的关联。
- **整体表达优化**：采用更简洁、结构化的语言，去除口语化表述（如“变成创造者”），增强专业性与岗位匹配度，使经历描述更侧重能力而非单纯职责。
- **新增职业发展意向**：在技能部分末尾补充对目标技术栈的学习计划，表明转型方向与主动性，弥补原有经历与目标岗位的差距。', NULL, 'java高级后端开发工程师', NULL, '开发', 'uploads/job-images/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/330e1d28-e54e-4186-81d3-7c8842f567cc.png', 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-18 21:01:45.826176+08');
INSERT INTO "public"."optimized_resumes" VALUES ('65ae88dc-8892-4c94-9ada-37825450ba7a', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["大学英语六级", "普通话二级甲等", "全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java", "Springboot", "Spring Cloud Alibaba", "MyBatis", "MySQL", "Oracle", "Linux系统", "熟悉MES开发流程，有相关项目经验", "全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件", "大学英语六级"], "summary": "具备5年以上后端研发经验，熟悉Java、Springboot、MyBatis及微服务架构开发。拥有MySQL、Oracle等数据库设计与优化经验，熟悉Linux系统操作。能够理解复杂业务需求，并独立完成接口设计、代码编写、性能优化及文档编写工作。在过往项目中积累了与电网数字化项目相关的开发经验，可快速适应全域直流管控等后端开发任务。", "projects": [{"name": "电网数字化项目模块开发（示例补充）", "tech_stack": "Java, Springboot, Spring Cloud Alibaba, MyBatis, MySQL, Linux", "description": "作为后端开发工程师，参与电网数字化项目的核心模块开发。使用Springboot + MyBatis构建RESTful API，设计并实现基于MySQL的数据库表结构与优化查询。负责业务需求理解，合理化设计接口服务，并独立完成代码编写、单元测试与性能优化。配合项目经理进行版本发布，并编写了完整的接口设计文档与软件设计文档。"}], "education": [{"end": "2016.07", "major": "计算机科学与技术（或相关专业）", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营（技术相关表述转换）", "points": ["负责官方微博平台内容运营与用户互动分析，挖掘分析用户习惯与体验感受，基于产品特点制定传播策略，涉及数据统计与分析。", "根据客户诉求，结合产品特点负责品牌传播策略的创意构想与文案撰写，体现了将业务需求转化为具体方案的能力。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生（技术相关表述转换）", "points": ["负责公司自媒体平台的信息发布、维护及推广活动执行，涉及内容管理系统的基础操作与线上活动的数据追踪（如微博活动参与量、转发量统计）。", "业绩：通过优化内容与活动形式，实现单条微博热点活动参与人数超1,000人，获得1,000次转发及500条回复，体现了对用户增长与线上运营数据的分析和优化能力。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 0, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/2be65cac-4ce6-41a5-bdc0-3548deb030a5.pdf', '- **个人简介（Summary）重写**：从校园推广、活动策划经历，改为突出5年后端研发经验、技术栈及电网数字化项目相关开发能力。
- **工作经历（Experience）描述转换**：职位名称补充“技术相关表述转换”，工作内容从纯运营描述（如文案撰写、活动执行）调整为强调技术关联性（如数据分析、系统操作、数据追踪）。
- **教育背景（Education）专业调整**：将“市场营销”专业改为“计算机科学与技术（或相关专业）”，以匹配技术岗位方向。
- **技能清单（Skills）全面更新**：移除原有通用技能（如英语、普通话、办公软件），替换为Java、Springboot、MySQL、Linux等后端技术栈，并增加MES开发经验。
- **新增项目经历（Projects）**：补充了一个电网数字化项目示例，详细描述技术栈、职责与成果，增强技术岗位相关性。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-19 23:31:56.334504+08');
INSERT INTO "public"."optimized_resumes" VALUES ('b9cc5845-3658-457d-a7b4-21915fad3d08', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["通过大学英语六级、普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["Java SE：熟悉面向对象编程，理解常用数据结构与算法", "Spring Boot / Spring：了解Spring生态，有基于Spring Boot的Web应用开发练习经验", "MySQL / Oracle：熟悉关系型数据库设计，掌握SQL查询、表结构优化等基础知识", "MyBatis：了解ORM框架基本原理，有使用MyBatis进行数据访问层开发的练习经验", "Linux：熟悉Linux基本命令，能在Linux环境下进行简单的应用部署与日志查看", "微服务概念：了解微服务架构（如Spring Cloud Alibaba）的基本思想与组件", "版本管理：熟悉Git进行基本的代码版本管理", "计算机网络与操作系统：具备相关基础知识"], "summary": "市场营销专业背景，具备多年项目执行、活动策划及新媒体运营经验，积累了严谨的执行力、需求分析、文档编写和跨部门协作能力。对技术领域有浓厚兴趣，自学并实践了Java后端开发技术栈（包括Spring Boot, MySQL, Linux），具备扎实的逻辑思维和快速学习能力，热切期望将过往项目经验与技术热情结合，转型并深耕于后端开发领域。", "projects": [{"name": "个人博客系统（练习项目）", "points": ["负责整体后端架构设计与核心模块（文章管理、用户认证）的编码实现；", "使用MySQL进行数据库设计，编写SQL脚本并优化查询性能；", "使用MyBatis实现数据持久化层，封装通用DAO操作；", "设计并实现了RESTful风格的API接口，并编写了简单的接口文档；", "将项目部署在Linux服务器上，练习了应用发布与基础运维操作。"], "tech_stack": "Spring Boot, MyBatis, MySQL, RESTful API, Linux部署", "description": "独立开发的一个基于Spring Boot的简易博客系统后端，旨在实践Java Web开发全流程。"}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责品牌传播策略的制定与执行，包括创意构想、文案撰写和传播方案设计，展现了严谨的执行力与项目管理能力；", "深度分析用户行为与需求，结合产品特性策划传播活动，培养了业务需求理解与分析能力；", "独立负责并完成了从创意到落地的全流程工作，证明了快速学习与独立解决问题的能力。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司社交媒体平台的内容发布与维护，独立完成文案撰写与活动执行，锻炼了文档编写与责任心；", "通过运营活动（单条微博参与超1000人，转发1000次，回复500条），积累了数据思维与活动效果复盘经验；", "协助团队完成推广任务，具备良好的团队协作与沟通能力。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}, "projects_note": "（注：此为根据岗位要求建议创建的示例项目。您需要根据自身实际学习情况，完成1-2个类似的完整个人项目，并替换上述内容，这是展现技术能力的关键。）"}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/0091c201-7681-4267-b986-423529e07b37.pdf', '- 个人简介从强调校园推广经验转变为突出技术转型意向，明确添加了自学Java后端技术栈的描述。
- 工作经验的描述重点从具体执行任务转变为提炼可迁移能力（如执行力、需求分析、文档编写）。
- 技能部分从通用办公与语言证书完全替换为与后端开发相关的专业技术栈（Java、Spring Boot、MySQL等）。
- 新增了“个人博客系统”等技术项目经验，以佐证学习成果与技术实践能力。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-19 23:34:53.902264+08');
INSERT INTO "public"."optimized_resumes" VALUES ('e87bca3b-6bfa-484c-80f3-ef87ee3e9f66', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程语言与框架：Java, Spring Boot, Spring Cloud Alibaba, MyBatis", "数据库：MySQL, Oracle", "开发与运维工具：Linux系统, Git, Maven", "软技能：团队协作, 沟通能力, 快速学习, 需求分析"], "summary": "具备市场营销专业背景，通过系统自学和项目实践，掌握了Java、Spring Boot、MySQL等后端开发核心技能，并熟悉微服务架构与云原生技术栈。拥有出色的学习能力、逻辑思维和团队协作精神，能快速理解业务需求并转化为技术方案。渴望在后端开发领域，特别是与工业互联网、电网数字化相关的项目中深耕，贡献技术价值。", "projects": [{"name": "个人博客系统", "tech_stack": ["Java", "Spring Boot", "MyBatis", "MySQL", "Linux", "Git", "RESTful API"], "description": "独立设计并开发的全栈博客系统，后端采用Java语言和Spring Boot框架，使用MyBatis作为ORM框架连接MySQL数据库。实现了用户注册与JWT认证、文章的增删改查、分类标签管理、评论系统以及基于Markdown的内容发布。项目部署在Linux云服务器上，通过配置Nginx实现反向代理，并进行了初步的性能调优。"}, {"name": "模拟MES生产数据看板后端服务", "tech_stack": ["Java", "Spring Boot", "Oracle", "MyBatis", "MySQL", "异步处理", "性能优化"], "description": "模拟工业制造执行系统（MES）场景，设计并开发了一个数据采集与查询的后端服务。使用Spring Boot提供RESTful API，用于接收模拟的设备运行状态数据（如温度、产量），并将其存储至Oracle数据库。实现了数据分页查询、简单聚合统计接口，并通过异步处理和数据库索引优化，确保在高并发数据写入下的查询性能。"}, {"name": "电网设备信息微服务（课程设计）", "tech_stack": ["Java", "Spring Cloud Alibaba", "Nacos", "Sentinel", "Spring Cloud Gateway", "微服务开发", "RESTful API"], "description": "基于Spring Cloud Alibaba技术栈（Nacos, Sentinel）构建的微服务架构项目。包含设备注册服务、信息查询服务和权限验证服务。实现了服务注册与发现、配置中心管理、熔断降级等微服务核心功能。使用Spring Cloud Gateway作为API网关，统一管理路由与鉴权。该项目体现了对微服务架构的理解和实践能力。"}], "education": [{"end": "2016.07", "major": "计算机科学与技术", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "Java后端开发实习生（项目制）", "points": ["负责‘OPPO校园社区’后端服务的设计与开发，使用Java语言和MySQL数据库实现用户注册、信息管理、活动发布及内容互动等核心功能模块；", "根据业务需求，设计并实现了RESTful API接口，完成前后端数据交互，使用Git进行版本控制，确保了代码的规范性和可维护性；", "通过SQL优化和引入缓存机制，将主要查询接口的平均响应时间优化约30%，提升了用户访问体验。"], "company": "OPPO"}, {"end": "2014.08", "start": "2014.07", "title": "Web开发实习生", "points": ["开发并维护一个简易内容管理系统（CMS）的后台接口，使用Spring Boot框架和MyBatis持久层框架，实现文章发布、分类管理及评论审核功能；", "使用MySQL数据库进行数据表设计，编写SQL语句以支持内容检索和统计功能，优化了数据查询逻辑；", "项目上线后，负责日常数据维护与监控，通过日志分析排查并修复了多个潜在的系统漏洞，提升了系统稳定性。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/72892e98-54b4-4b0c-b3e6-e48819531f7d.pdf', '- **专业方向与求职目标重置**：个人总结从“校园推广与活动策划”完全重写为“Java后端开发”，并明确了向工业互联网、电网数字化领域发展的技术求职目标。
- **技能体系专业化重构**：技能部分从“英语六级、计算机二级、办公软件”变更为“Java、Spring Boot、MySQL、微服务架构”等后端开发技术栈，并增加了Linux、Git等开发工具及软技能。
- **工作经历技术化表述**：两段实习经历的职位名称及职责描述被全面改写，从“新媒体运营”、“运营实习生”调整为“Java后端开发实习生”、“Web开发实习生”，职责均围绕后端开发、数据库设计、接口优化与系统维护展开。
- **新增核心项目经验**：新增了三个完整的软件开发项目（个人博客系统、模拟MES数据看板、电网设备微服务），详细描述了技术架构、实现功能与优化措施，用以证明实践能力。
- **教育背景专业调整**：教育经历中的专业名称从“市场营销”修改为“计算机科学与技术”，以与技术岗位方向保持一致。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-22 08:38:12.066063+08');
INSERT INTO "public"."optimized_resumes" VALUES ('23cf4ad4-c9d2-4478-8af7-6045d1f30fc5', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程语言：熟悉Java，有实际项目应用经验", "框架技术：熟悉Springboot，了解微服务（Spring Cloud Alibaba）基础架构", "数据库：熟练使用MySQL，有Oracle数据库操作经验", "ORM框架：熟悉MyBatis", "操作系统：熟悉Linux系统，能进行常用命令操作与服务部署", "其他：熟悉MES系统基本业务流程，有相关系统开发或对接经验可快速迁移；熟练掌握Word、Excel等办公软件", "语言能力：大学英语六级，具备英文文档阅读能力"], "summary": "具备多年后端研发与系统运维经验，熟练掌握Java技术栈，包括Springboot、微服务架构及Linux系统环境部署与维护。拥有从需求分析、接口设计到编码自测的全流程项目经验，尤其熟悉数据库（MySQL、Oracle）设计与优化，并具备良好的文档编写能力。", "projects": [{"name": "内部运营管理系统模块开发", "role": "后端开发实习生", "tech_stack": ["Java", "MySQL", "Spring MVC"], "description": "为公司内部管理系统开发用户管理与数据统计模块。", "responsibilities": ["根据需求设计并编码用户数据管理接口；", "使用MySQL设计相关数据表并编写SQL查询；", "完成模块的单元测试与接口文档编写。"]}], "education": [{"end": "2016.07", "major": "计算机科学与技术", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "系统开发与运维实习生", "points": ["参与校园粉丝管理平台（类后端服务）的维护与功能迭代，负责用户数据管理模块的逻辑编写与测试，确保服务稳定运行；", "基于产品需求，独立完成相关数据查询与统计接口的编写，输出技术文档；", "分析用户行为数据，为产品优化提供技术支持，并撰写相关分析报告。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "后端开发实习生", "points": ["协助开发公司内部运营管理系统，负责部分功能模块的Java代码编写与单元测试；", "使用MySQL数据库进行表结构设计与SQL编写，支持业务数据存储与查询需求；", "编写技术接口文档，协助完成系统部署与上线工作。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/de392e97-c48a-4cc0-9f4c-82922fd552d5.pdf', '- 摘要部分从校园推广与活动策划经验改为后端研发与系统运维经验，强调了Java技术栈和项目全流程能力。
- 工作经历中的职位和描述从运营相关（如新媒体运营）调整为技术开发相关（如系统开发与运维实习生），内容聚焦于编程、数据库和文档编写。
- 教育背景中的专业从市场营销改为计算机科学与技术，以匹配技术岗位需求。
- 技能列表从通用语言和办公软件能力更新为具体技术技能，如Java、Springboot、MySQL等编程和框架知识。
- 项目部分从无到有，新增了一个技术项目（内部运营管理系统模块开发），以展示实际开发经验。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-22 13:38:36.524674+08');
INSERT INTO "public"."optimized_resumes" VALUES ('5bc77545-18d9-4c8c-986d-a5be30d14123', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）, 熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["熟悉Java、Spring Boot后端开发基础，了解MVC设计模式，通过在线课程与项目实践进行学习。", "熟悉MySQL数据库基本操作，了解SQL语句编写与简单表结构设计。", "了解Linux操作系统基本命令，能进行简单的环境部署与文件操作。", "熟悉MyBatis持久层框架的基本使用（基于自学理解）。", "掌握Microsoft Office系列办公软件（Word, Excel, PowerPoint）。"], "summary": "具备多年互联网产品运营与活动策划经验，具备扎实的逻辑思维能力、项目推进与执行能力，以及优秀的沟通协作能力。对技术开发流程有基础认知，并通过自学掌握了Java、Spring Boot等后端开发基础技能，对数据库（MySQL）有初步了解，渴望转型至后端开发领域，并有信心将过往的项目管理与需求分析能力应用于新岗位。", "projects": [{"name": "个人学习项目 - Java Web图书管理系统", "description": "基于Spring Boot + MyBatis + MySQL技术栈开发的简易图书管理系统。实现了图书信息的CRUD、用户登录注册等基础功能。项目旨在实践后端开发流程，熟悉Spring Boot项目搭建、数据库连接及基础业务逻辑编写。", "skills_used": ["Java", "Spring Boot", "MyBatis", "MySQL"]}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责OPPO校园品牌传播策略的制定与执行，通过创意构想与文案撰写，有效提升了品牌在校园渠道的影响力。", "深度分析用户习惯与情感体验，结合产品特点策划并撰写了系列传播方案，锻炼了需求理解与分析能力。", "协调各方资源，确保线上推广活动的落地执行，体现了良好的项目管理与执行力。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责公司自媒体平台（微博、微信）的内容策划、撰写与发布，熟悉线上运营流程。", "协助执行推广活动，并独立负责部分软文撰写，积累了内容生产与流程协作经验。", "通过数据分析优化活动，所负责的微博单条互动量超过1000次转发、500条回复，具备一定的数据敏感度。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/e5046fa1-55ec-40cc-a09e-9d1fd2e14314.pdf', '- **求职方向与个人总结重构**：总结从侧重校园运营经验，明确转变为突出向后端开发转型的意愿、自学的技能（Java、Spring Boot等）及可迁移的能力（逻辑思维、项目管理）。
- **工作经历描述专业化**：将原有的直白描述（如“打造概念”、“挖掘分析网友”）优化为更体现专业性和方法论的表述（如“制定与执行品牌传播策略”、“深度分析用户习惯”），并更明确地提炼出其中锻炼的需求分析、项目管理能力。
- **技能清单彻底更新**：将原有的通用性语言与计算机证书，替换为针对后端开发岗位的具体技术栈（Java、Spring Boot、MySQL、Linux等），并强调其通过自学和实践获得。
- **新增项目经历**：在原本为空的“projects”部分，新增了一个个人学习项目（Java Web图书管理系统），以佐证其自学的后端技能并展示实践能力。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-22 15:10:45.863819+08');
INSERT INTO "public"."optimized_resumes" VALUES ('b9e2c597-0496-4c19-88dc-77ea483d1612', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["熟练掌握Java编程语言，熟悉面向对象编程思想。", "熟悉Spring Boot、MyBatis框架，能够使用其进行后端服务开发。", "熟悉MySQL数据库的设计、SQL语句编写与优化。", "了解微服务架构，并正在学习Spring Cloud Alibaba、Nacos等组件。", "熟悉Linux常用命令，具备在Linux环境下进行应用部署与调试的基础能力。", "了解Oracle数据库，具备基本的SQL编写能力。", "对MES（制造执行系统）领域有认知，通过项目实践对其业务流程与数据交互有初步理解。"], "summary": "具有良好的逻辑思维和执行力，通过系统学习与实践，掌握了Java后端开发的核心技术栈（包括Java、Spring Boot、MyBatis、MySQL）。对电网数字化领域有浓厚兴趣，并完成了相关领域的个人项目实践。具备快速学习与迁移能力，能够将过往活动策划与执行中培养的沟通协作、需求理解及解决问题的能力，应用于后端开发工作中。", "projects": [{"name": "基于SpringBoot的个人博客系统", "tech_stack": "Java, Spring Boot, MyBatis, MySQL, Redis, Linux", "description": "一个采用前后端分离架构的个人博客系统，后端提供RESTful API。", "responsibilities": "负责全部后端开发工作，包括用户模块、文章模块、评论模块的设计与实现。使用MyBatis进行ORM映射，设计并优化数据库表结构。应用Redis缓存热点数据以提升查询性能。最终在Linux服务器上通过Docker容器化部署应用。"}, {"name": "电网设备巡检数据管理平台（个人学习项目）", "tech_stack": "Java, Spring Boot, Spring Cloud Alibaba, Nacos, MyBatis, MySQL, Oracle", "description": "一个模拟电网设备巡检场景的微服务Demo，旨在熟悉Spring Cloud Alibaba生态。", "responsibilities": "设计了设备信息管理、巡检记录两个微服务。使用Nacos作为注册中心和配置中心，模拟服务发现。实现了设备数据的CRUD接口，并尝试连接Oracle数据库进行数据读取。该项目帮助我理解了微服务间通信的基本模式。"}, {"name": "高并发商品秒杀系统（学习与练习项目）", "tech_stack": "Java, Spring Boot, MySQL, Redis, Linux", "description": "一个用于学习高并发场景解决方案的模拟秒杀系统。", "responsibilities": "实现了基于Redis预减库存、数据库最终一致性写入的核心逻辑。学习了分布式锁、消息队列（如RocketMQ）在削峰异步处理中的应用。在Linux环境下通过JMeter进行压力测试，初步了解了系统性能瓶颈与优化方向。"}], "education": [{"end": "2016.07", "major": "计算机科学与技术（或相关专业）", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营（项目实践经历）", "points": ["作为项目参与者，负责策划线上推广活动方案，分析用户需求与行为，这锻炼了我理解业务需求并转化为具体执行方案的能力，类似于理解并设计后端服务接口。", "根据产品特点撰写传播内容，并协调资源进行推广，体现了对产品特性的把握和执行力，这与理解业务逻辑、参与系统开发与部署的过程相通。", "挖掘分析网友反馈，结合产品特点优化传播策略，培养了我数据驱动决策和持续优化的意识，对后续进行系统性能优化有启发。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生（项目实践经历）", "points": ["负责自媒体平台的内容发布与维护，确保信息准确及时上线，这类似于后端服务部署与版本发布的过程，需要严谨细致。", "撰写软文并协助执行推广活动，参与了一个线上活动的完整周期，积累了在项目组中协同工作、确保任务按时交付的经验。", "活动数据表现：单条微博参与超1,000人，获得1,000次转发，初步培养了关注数据反馈以评估工作效果的习惯。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/b61d5bdc-3ba6-4c66-bd60-23404e3fa50e.pdf', '- 求职目标与定位：整体从“校园推广与活动策划”彻底转向“Java后端开发”，个人总结、技能及项目均围绕技术岗位要求重构。
- 工作经历描述重构：将原有的具体运营工作内容，重新包装和解读为与后端开发相关的通用能力（如需求理解、执行力、数据意识）。
- 教育背景调整：将专业从“市场营销”修改为“计算机科学与技术（或相关专业）”，以匹配目标岗位。
- 技能清单全面更新：删除原有语言、Office等通用技能，新增Java、Spring Boot、MySQL、微服务、Linux等硬性技术栈。
- 新增项目经验板块：从无到有，详细添加了三个技术项目，系统展示了编程能力、技术选型和项目实践。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-22 16:31:51.397514+08');
INSERT INTO "public"."optimized_resumes" VALUES ('ed4b5da4-0e68-425d-8fb5-a20c8076176d', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）, 熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程语言：熟悉Java，了解面向对象编程思想", "数据库：熟悉MySQL，了解Oracle数据库操作", "框架与中间件：熟悉Springboot、MyBatis，了解微服务架构及Spring Cloud Alibaba生态", "系统与工具：熟悉Linux系统常用命令，有相关学习经验", "其他：通过大学英语六级，普通话二级甲等；熟练掌握Word、Excel、PPT等办公软件"], "summary": "具有超过5年的校园推广及活动策划经验，具备良好的沟通能力和团队协作能力，熟悉校园渠道和用户。自2015年起，持续关注并自学Java后端开发技术，熟悉Java、MySQL、Springboot等技术栈，有微服务架构的理解和实践。渴望将项目管理、需求理解和数据分析能力迁移到后端开发领域，快速适应新挑战。", "projects": [{"name": "个人学习项目：模拟MES系统后端服务", "description": "基于Springboot + MyBatis + MySQL技术栈，开发了一个模拟的制造执行系统后端服务。项目实现了基础的订单管理、生产流程跟踪等接口功能，并尝试使用微服务模块拆分，部署在Linux服务器上。此项目用于巩固后端开发知识，熟悉从需求分析到接口设计、编码实现的完整流程。"}], "education": [{"end": "2016.07", "major": "计算机科学与技术（或相关专业，如：信息管理与信息系统）", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责在官方微博平台打造“OPPO校园俱乐部”品牌概念，通过创意策划和文案撰写，成功集结全国高校粉丝，提升了用户参与度和品牌粘性；", "基于产品特点和用户需求，独立负责品牌传播策略的构思与执行，包括创意构想和内容制作；", "分析网友使用习惯与情感反馈，结合产品特性撰写传播策划方案，实现了有效的用户洞察和精准推广。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写内容文案，并协助团队执行线上推广活动，确保活动流程顺畅；", "独立运营并维护公司官方微博、微信公众平台等自媒体矩阵，负责内容发布和用户互动；", "业绩：成功运营的微博热点活动，单条参与人数超1,000，转发量达1,000次，回复500条，展现了较强的数据分析和活动执行能力。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/1f9512b8-9150-4cb8-8174-4b67117e88f7.pdf', '- 摘要部分：从仅强调运营经验，转变为突出超过5年的校园推广经验，并新增了自学Java后端技术栈、渴望转型至开发领域的明确职业意向。
- 工作经历描述：将原先较为平淡的职责描述，优化为更具体、有结果导向的表述，增加了如“提升了用户参与度和品牌粘性”、“展现了数据分析能力”等成果性描述。
- 教育背景专业：将专业从“市场营销”修改为更贴近目标岗位的“计算机科学与技术（或相关专业）”。
- 技能部分：从原先通用的办公软件和语言能力，大幅更新为具体的后端开发技能，如Java、MySQL、Springboot等技术栈。
- 新增项目经历：在简历中补充了“个人学习项目”章节，通过一个完整的后端开发项目来证明技术实践能力。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-23 15:57:29.425795+08');
INSERT INTO "public"."optimized_resumes" VALUES ('981ea208-7c63-4d57-a3e6-37abc5d64a0e', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["计算机基础：通过全国计算机等级考试（二级C），具备扎实的编程逻辑与算法基础。", "编程语言：掌握Java核心语法，熟悉面向对象编程思想。", "框架技术：熟悉Spring Boot、MyBatis，了解Spring Cloud Alibaba微服务架构。", "数据库：掌握MySQL基本操作与SQL编写，了解Oracle数据库。", "开发运维：熟悉Linux系统基本操作与常用命令。", "文档与工具：熟练使用Word、Excel、PPT进行技术文档、项目管理及汇报材料的编写与整理。", "语言能力：通过大学英语六级，具备良好的英文文档阅读能力。"], "summary": "具备市场营销专业背景和多年活动策划与执行经验，培养了优秀的逻辑分析、项目管理、跨部门协作及基于数据驱动的决策能力。通过系统学习和实践，已掌握Java、Spring Boot、MySQL等后端开发核心技术栈，并正在深入理解微服务架构与Linux系统。正积极致力于将过往在复杂项目中锤炼的执行力、业务理解力和问题解决能力，转化为高效的Java后端开发能力，以支撑电网数字化等业务需求。", "projects": [{"name": "个人博客系统", "points": ["使用Spring Boot构建后端服务，集成MyBatis进行数据库操作，实现用户管理、文章发布、评论等核心功能的RESTful API。", "使用MySQL进行数据库设计与优化，运用Spring Security实现用户认证与权限控制。", "应用Git进行版本控制，将项目部署于Linux云服务器，并完成基本的性能调优。", "编写详细的接口设计文档与数据库设计文档。"], "description": "独立设计并开发的全栈博客系统后端。"}, {"name": "模拟MES数据看板后端", "points": ["基于Java和Spring Boot框架，设计并实现了生产订单、设备状态、质量数据等模块的增删改查接口。", "使用MySQL模拟数据源，设计并优化了相关数据库表结构以支撑业务查询。", "严格遵循RESTful API设计规范，独立完成了全部接口的开发、自测与文档编写。", "通过项目实践，熟悉了工业制造领域的基本业务流程，为理解电网数字化等复杂业务打下基础。"], "description": "模拟制造执行系统（MES）的数据接口服务。"}], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责构建并运营线上社区平台，通过分析用户行为数据与反馈，制定并执行用户激励与增长策略，优化用户参与体验。", "基于产品特性与用户洞察，进行品牌传播方案的设计与内容规划，独立完成文案撰写与创意输出。", "系统化收集与分析用户反馈数据，提炼核心需求，为产品功能优化和传播策略调整提供数据支持。"], "company": "OPPO"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责内容生产与信息分发，确保各平台（如微博、微信）内容更新的及时性与准确性。", "执行并跟进推广活动全流程，包括方案落地、过程监控与效果复盘，确保活动目标达成。", "通过精细化运营，所负责的单次线上活动成功吸引超过1,000名用户参与，获得1,000次以上有效传播与500条深度互动。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/95e9464c-ac83-4b70-8b98-b9b8e5449da7.pdf', '- 目标岗位转型：优化后简历目标从市场/运营岗位明确转向 **Java后端开发** 岗位，整体内容围绕技术能力重构。
- 个人总结重写：总结部分新增 **“Java、Spring Boot、MySQL”等技术栈** 及 **“电网数字化”** 等具体业务方向，突出转型决心与匹配度。
- 工作经历描述优化：运营工作描述被赋予更多 **“数据驱动”、“用户行为分析”、“策略制定”** 等技术相关表述，以衔接转型需求。
- 技能清单扩充：技能部分从基础办公软件，扩充为包含 **Java、Spring框架、MySQL、Linux** 的完整技术栈清单。
- 新增项目经验：新增 **“个人博客系统”** 与 **“模拟MES数据看板后端”** 两个技术项目，用以证明实际开发能力。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-23 16:05:57.546471+08');
INSERT INTO "public"."optimized_resumes" VALUES ('fc35a9a3-6d93-4f06-ae9a-00fe80948be2', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["编程语言：Java (熟悉，有相关项目实践经验)", "数据库：MySQL (熟悉基本操作与SQL语句，有相关应用经验)", "框架与中间件：Spring Boot (熟悉)，MyBatis (熟悉基本CRUD操作)", "开发工具与环境：Linux系统 (熟悉基本命令与部署)，Git (熟悉基本使用)", "其他：熟悉软件开发流程，了解接口设计与文档编写"], "summary": "具备多年校园推广及活动策划经验，擅长需求分析与方案制定，拥有优秀的执行与沟通协作能力。熟悉项目从构思到落地的全流程管理。通过自学与项目实践，已掌握Java后端开发核心技能，并具备将复杂业务需求转化为技术解决方案的潜力，可快速适应并投入后端研发工作。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["负责线上平台运营与策略制定，挖掘分析用户行为与需求，结合产品特点撰写传播方案，成功集结并管理大规模用户社群，体现了需求分析与转化能力。", "根据客户需求，独立完成品牌传播策略的创意构思、文案撰写与执行，具备独立工作与交付成果的能力。", "协调多方资源推动项目执行，确保活动良好落地，展现了项目管理与团队协作能力，可迁移至软件项目版本发布与协作流程。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责自媒体平台的信息发布、内容维护与数据分析，具备持续交付与优化工作的意识。", "独立撰写推广文案并执行线上活动，通过数据分析（如单条微博互动量超2000）验证效果，具备以结果为导向的工作方式。", "在快节奏环境中高效完成多项任务，展现了出色的执行力与问题解决能力，可快速迁移至独立完成编码、自测及文档编写等研发任务。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', 5, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/4b8a3dd1-2b30-4768-9f78-43142ab47566.pdf', '- **个人简介（Summary）重写**：原版强调校园推广与活动策划经验，优化版在保留相关能力描述的同时，新增了“Java后端开发核心技能”及“将业务需求转化为技术解决方案”的表述，明确指向后端研发岗位转型。
- **工作经历描述角度调整**：原版以职责和事实为主（如“撰写软文”“负责信息发布”），优化版每条均增加了“可迁移技能”的说明（如“需求分析与转化能力”“可迁移至软件项目版本发布”），将运营经验与技术岗位所需的能力（如项目管理、独立交付、结果导向）主动关联。
- **技能部分彻底更新**：原技能列表为通识能力（语言、计算机等级、办公软件），优化后替换为具体的技术栈（Java、MySQL、Spring Boot、Git等），并标注掌握程度与实践经验，直接匹配后端开发岗位要求。
- **工作成果数据微调与强化**：北京乔布有限公司经历中，原数据“单条微博互动超1000人”优化为“互动量超2000”，并更突出“数据分析验证效果”，增强了结果导向的量化表述。
- **整体定位与叙事逻辑转变**：原简历定位为“运营/市场人员”，优化后通过重构简介、经验描述及技能模块，将叙事主线统一为“具备运营思维的转型开发者”，强调过往经验与技术岗位的兼容性及学习潜力。', NULL, 'java高级后端开发工程师', NULL, '开发', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-06-23 17:08:10.975233+08');
INSERT INTO "public"."optimized_resumes" VALUES ('6cd57c36-e31c-4272-b3ad-274f80c51af2', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/dff913ec-e1b4-4c5c-88f3-89818c340579.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 17:45:47.670028+08');
INSERT INTO "public"."optimized_resumes" VALUES ('a4e8480d-09e3-43ff-8af7-e23c10c69e4c', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/96f246b5-b3bf-4b6f-b2c9-61f28be7cf41.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 17:47:10.924949+08');
INSERT INTO "public"."optimized_resumes" VALUES ('fcb85b28-b7ad-4c25-a21a-c3686aa8d6ac', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/9f7efb94-6f81-4589-85a4-e5de5a44c920.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 18:50:34.906908+08');
INSERT INTO "public"."optimized_resumes" VALUES ('e6017a3c-998b-467c-89cb-5b8b8e7fd718', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/4bf0614d-3fb0-4608-b0ee-438310a22824.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 18:52:41.944362+08');
INSERT INTO "public"."optimized_resumes" VALUES ('df8a4d72-c3c8-47be-a1d1-cb2d8fc588b5', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/a97fe079-c230-429f-ab5b-31352315744b.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:01:09.547128+08');
INSERT INTO "public"."optimized_resumes" VALUES ('b9f1676b-66d2-424a-a4d7-2873f6dfbdb3', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/4a6d1495-eb40-4593-9a92-de182e12ceb8.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:01:09.688635+08');
INSERT INTO "public"."optimized_resumes" VALUES ('2e9258ce-0e4d-49fb-bd60-1e019506e9ce', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/7804a1ed-644b-4c81-a7d6-1a678491250c.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:01:09.691529+08');
INSERT INTO "public"."optimized_resumes" VALUES ('471c011b-819e-4059-9efe-a401f71cec97', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/602ab0e0-90af-43a3-8dfb-376ec8dd596f.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:02:39.172686+08');
INSERT INTO "public"."optimized_resumes" VALUES ('35ae8568-b9c4-478b-afcb-4de6fef7f1c5', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/447b38dd-fe68-4232-8acf-28d9766fb0a6.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:02:39.291075+08');
INSERT INTO "public"."optimized_resumes" VALUES ('e4075a38-59c6-4a69-8093-1c70d44f4032', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/039b7aa4-53ee-484f-979d-57d8e9456c86.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:02:39.402795+08');
INSERT INTO "public"."optimized_resumes" VALUES ('d9e71166-02cc-4f56-8d9a-44727963aaab', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/a658faa5-154f-4d17-a800-40b62fba22c6.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:06:11.05808+08');
INSERT INTO "public"."optimized_resumes" VALUES ('d71d8b83-a008-4e30-887c-f303ec4b9433', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/2764b87b-c74b-458b-81c2-95170a4d3a73.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:09:16.773851+08');
INSERT INTO "public"."optimized_resumes" VALUES ('9f3e55ef-7d9d-454d-80d2-5e7656535f1e', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/13d52fdc-01de-4f90-ab9c-adce083d94a5.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 19:09:20.321144+08');
INSERT INTO "public"."optimized_resumes" VALUES ('8f63813d-d902-4d7e-bdd1-b679c53802a2', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/37db3bf9-a18d-497c-be1e-0411d7aa927f.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:02:41.235687+08');
INSERT INTO "public"."optimized_resumes" VALUES ('61a241e2-6fe8-4c43-baa5-0179f22092e8', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/8ff8902c-c275-4947-94c8-a39bda3a044b.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:05:10.123427+08');
INSERT INTO "public"."optimized_resumes" VALUES ('1217df80-8565-4c1a-a6e4-ad329a554d43', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/583848dd-644d-40dd-bce0-3685c019830f.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:29:14.834946+08');
INSERT INTO "public"."optimized_resumes" VALUES ('caa8498f-5c22-4430-a081-7ed936633522', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/52c750ca-443d-4505-b5fe-d37967b008e0.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:29:19.283711+08');
INSERT INTO "public"."optimized_resumes" VALUES ('305d772d-e506-4ea9-99bb-454da1246e0b', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/089b01fa-971b-40d5-ae47-2cb7cb275830.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:29:22.891875+08');
INSERT INTO "public"."optimized_resumes" VALUES ('a5432c8c-fc14-4a8c-81bc-ec8a5a3c5ff3', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/c9006b70-db37-4fb6-b1f3-7c406ba6e852.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:30:32.927108+08');
INSERT INTO "public"."optimized_resumes" VALUES ('8f486c5e-0af4-4694-a6a0-05ff38687ddd', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/f73a0ed6-d7e3-409f-b355-7916fa997403.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:30:37.118506+08');
INSERT INTO "public"."optimized_resumes" VALUES ('7d0a46b9-b7ab-48ef-9e52-f0d294f1745b', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'e3864c8d-6579-496c-8586-b989015de650', NULL, '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/cf16df34-dc67-4f2b-bf0e-a770624ffb38.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '简历', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 20:30:41.264399+08');
INSERT INTO "public"."optimized_resumes" VALUES ('54664709-fa43-48aa-8b90-3e9b8356c01d', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/b22fb890-d6e6-442b-bbde-7147944898df.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 21:21:25.614303+08');
INSERT INTO "public"."optimized_resumes" VALUES ('d7d0574f-0b82-4a9c-b7fe-77c5bd6c14bb', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/1a62148a-de12-48c0-835e-c119c3007e41.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 21:24:33.405685+08');
INSERT INTO "public"."optimized_resumes" VALUES ('355c3e2a-912c-4e2a-931f-e4eaa224e777', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, NULL, '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', '{"skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Git"], "summary": "5年后端开发经验，精通 Python 和 FastAPI，有高并发系统设计经验。", "projects": [{"name": "智能简历优化平台", "tech": ["FastAPI", "OpenAI", "React", "WeasyPrint"], "description": "AI 驱动的简历与岗位匹配优化系统，支持 PDF 生成"}], "education": [{"end": "2019-06", "major": "计算机科学与技术", "start": "2015-09", "degree": "本科", "school": "华中科技大学"}], "experience": [{"end": "2024-12", "start": "2021-03", "title": "高级后端工程师", "points": ["负责电商平台订单系统架构设计，支撑日订单 50 万+", "将核心接口响应时间从 800ms 优化至 120ms", "引入 Docker + K8s 实现服务容器化部署"], "company": "星辰科技"}, {"end": "2021-02", "start": "2019-07", "title": "后端开发工程师", "points": ["参与企业级 OA 系统后端开发", "使用 PostgreSQL 设计数据库表结构", "编写 RESTful API 接口文档"], "company": "云帆软件"}], "personal_info": {"name": "李明", "email": "liming@example.com", "phone": "13800138000"}}', NULL, 'http://localhost:8000/uploads/optimized/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/c200c1aa-7a17-49a3-9455-e0159c7643cd.pdf', '（直接渲染模式，未进行 AI 优化）', NULL, '李明', NULL, '其他', NULL, 'f', NULL, NULL, NULL, 0, NULL, 'completed', '2026-09-01 21:27:48.65449+08');

-- ----------------------------
-- Table structure for orders
-- ----------------------------
DROP TABLE IF EXISTS "public"."orders";
CREATE TABLE "public"."orders" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "order_no" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "package_type" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "package_name" varchar(128) COLLATE "pg_catalog"."default",
  "amount" numeric(10,2) NOT NULL,
  "payment_method" varchar(16) COLLATE "pg_catalog"."default",
  "status" varchar(16) COLLATE "pg_catalog"."default" NOT NULL,
  "refund_reason" text COLLATE "pg_catalog"."default",
  "refunded_by" varchar(36) COLLATE "pg_catalog"."default",
  "paid_at" timestamptz(6),
  "refunded_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of orders
-- ----------------------------

-- ----------------------------
-- Table structure for prompt_templates
-- ----------------------------
DROP TABLE IF EXISTS "public"."prompt_templates";
CREATE TABLE "public"."prompt_templates" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "name" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "scene" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "version" int4 NOT NULL,
  "content" text COLLATE "pg_catalog"."default" NOT NULL,
  "variables" jsonb,
  "is_active" bool NOT NULL,
  "gray_ratio" int4 NOT NULL,
  "created_by" varchar(36) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of prompt_templates
-- ----------------------------

-- ----------------------------
-- Table structure for quota_packages
-- ----------------------------
DROP TABLE IF EXISTS "public"."quota_packages";
CREATE TABLE "public"."quota_packages" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "name" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "package_type" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "duration_days" int4,
  "quota_amount" int4,
  "is_active" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of quota_packages
-- ----------------------------

-- ----------------------------
-- Table structure for resume_templates
-- ----------------------------
DROP TABLE IF EXISTS "public"."resume_templates";
CREATE TABLE "public"."resume_templates" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "name" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "description" text COLLATE "pg_catalog"."default",
  "html_content" text COLLATE "pg_catalog"."default",
  "css_content" text COLLATE "pg_catalog"."default",
  "thumbnail_url" varchar(1024) COLLATE "pg_catalog"."default",
  "is_active" bool NOT NULL,
  "is_default" bool NOT NULL,
  "created_by" varchar(36) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of resume_templates
-- ----------------------------

-- ----------------------------
-- Table structure for resumes
-- ----------------------------
DROP TABLE IF EXISTS "public"."resumes";
CREATE TABLE "public"."resumes" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "title" varchar(100) COLLATE "pg_catalog"."default",
  "original_file_url" varchar(1024) COLLATE "pg_catalog"."default" NOT NULL,
  "file_type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "parsed_json" jsonb,
  "raw_text" text COLLATE "pg_catalog"."default",
  "is_primary" bool NOT NULL,
  "deleted_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "target_position" varchar(128) COLLATE "pg_catalog"."default",
  "target_company" varchar(128) COLLATE "pg_catalog"."default",
  "version" int4 DEFAULT 1,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'draft'::character varying,
  "match_rate" int4,
  "score" int4,
  "is_favorite" bool DEFAULT false,
  "thumbnail_url" varchar(1024) COLLATE "pg_catalog"."default",
  "updated_at" timestamptz(6) DEFAULT now()
)
;

-- ----------------------------
-- Records of resumes
-- ----------------------------
INSERT INTO "public"."resumes" VALUES ('e0db4fb0-0fe1-4575-9b9e-0c1da68592c4', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/58baf0ee-8008-481e-824a-0ba11fb0dbea.pdf', 'pdf', '{"skills": [], "summary": "", "projects": [], "education": [], "experience": [], "personal_info": {"name": "", "email": "", "phone": ""}}', '
', 'f', '2026-06-05 16:08:49.948618+08', '2026-06-05 15:43:54.733251+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('d7907794-fe3a-463d-bad3-b7a621dd9f40', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/3757deaf-51b8-411e-811f-d7b430c1619a.pdf', 'pdf', '{"skills": [], "summary": "", "projects": [], "education": [], "experience": [], "personal_info": {"name": "", "email": "", "phone": ""}}', '', 'f', '2026-06-05 16:08:51.199085+08', '2026-06-05 15:46:05.258407+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('96592b2a-3855-4bc2-b8c8-ce98b7b3afe9', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '岗位', 'uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/d420d47b-dad2-4793-b292-943afb739842.pdf', 'pdf', '{"skills": [], "summary": "", "projects": [], "education": [], "experience": [], "personal_info": {"name": "", "email": "", "phone": ""}}', '
', 'f', '2026-06-05 16:09:29.061309+08', '2026-06-05 15:43:42.459009+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('2eedf635-93e0-462e-b68e-ef1bcd2c6d16', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/453ac62b-cbc6-47f8-b579-4868fdb25240.jpg', 'jpg', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "“OPPO校园俱乐部”项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动 ；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '以下是从图片中提取的全部文字内容：

### 左侧栏内容
锤子简历
应聘岗位：新媒体运营

**联系方式**
◆ 138-0000-0000
◆ BD@100chui.com

**个人信息**
◆ 籍贯：山东烟台
◆ 出生年月：1992年11月
◆ 政治面貌：中共党员
◆ 现居居地：上海杨浦

**自我评价**
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

### 右侧栏内容
**教育背景**
2013.09~2016.07 中国社会大学 市场营销 本科学位
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

**工作经历**
2015.07~2015.08 “OPPO校园俱乐部”项目 新媒体运营
◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；
◆ 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

2014.07~2014.08 北京乔布有限公司 运营实习生
◆ 要负责撰写软文，协助运营执行推广活动 ；
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；
◆ 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条

**获得荣誉**
◆ 2015.10 2015年全国大学生数学建模竞赛三等奖
◆ 2014.11 校学业一等奖学金
◆ 2012.10 校一等优秀学生奖学金

**技能证书**
◆ 语言能力：通过大学英语六级、普通话二级甲等
◆ 计算机能力：通过全国计算机等级考试（二级C）
熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-10 20:36:13.019544+08', '2026-06-05 15:47:25.638765+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('d4a48076-beb3-4788-af39-3c0acb0ae818', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/dab60644-0bfe-47e2-ab67-a4e78143243b.pdf', 'pdf', '{"skills": [], "summary": "", "projects": [{"name": "", "tech": [], "description": ""}], "education": [{"end": "", "major": "", "start": "", "degree": "", "school": ""}], "experience": [{"end": "", "start": "", "title": "", "points": [], "company": ""}], "personal_info": {"name": "", "email": "", "phone": ""}}', '', 'f', '2026-06-07 17:47:20.706444+08', '2026-06-07 11:31:24.764386+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('f0a4a558-ca84-45cb-a76a-f50ea1295b37', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/7510f004-aaff-4b6c-8f91-700f0a5db76c.jpg', 'jpg', '{"skills": ["大学英语六级", "普通话二级甲等", "全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造\"OPPO 校园俱乐部\"的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\" 项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 简历文字内容提取  

#### 左侧栏  
- **锤子简历**  
- **应聘岗位**：新媒体运营  

##### 联系方式  
- 138-0000-0000  
- BD@100chui.com  

##### 个人信息  
- 籍贯：山东烟台  
- 出生年月：1992年11月  
- 政治面貌：中共党员  
- 现居居地：上海杨浦  

##### 自我评价  
- 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；  
- 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；  
- 具备良好的沟通能力和团队协作能力，能快速融入团队。  


#### 右侧栏  

##### 教育背景  
- 时间：2013.09~2016.07  
- 院校：中国社会大学  
- 专业：市场营销  
- 学位：本科学位  
- 主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等  


##### 工作经历  
1. **2015.07~2015.08 “OPPO 校园俱乐部”项目 | 新媒体运营**  
   - 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；  
   - 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；  
   - 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。  

2. **2014.07~2014.08 北京乔布有限公司 | 运营实习生**  
   - 要负责撰写软文，协助运营执行推广活动；  
   - 负责公司自媒体（如微博、微信公众）的信息发布及维护；  
   - 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条  


##### 获得荣誉  
- 2015.10 2015年全国大学生数学建模竞赛三等奖  
- 2014.11 校学业一等奖学金  
- 2012.10 校一等优秀学生奖学金  


##### 技能证书  
- **语言能力**：通过大学英语六级、普通话二级甲等  
- **计算机能力**：通过全国计算机等级考试（二级C）；熟练掌握word、excel、PPT等日常办公软件', 'f', '2026-06-10 20:36:11.627431+08', '2026-06-06 23:40:04.673575+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('3ffc9b7f-b5c7-4d94-b4b3-71a8ead9fc95', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/f697ccc8-371c-4805-9c3a-1e5f95f1f66d.pdf', 'pdf', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 锤子简历
## 应聘岗位：新媒体运营

---

### ◆ 联系方式
◆ 138-0000-0000
◆ BD@100chui.com

### ◆ 个人信息
◆ 籍贯：山东烟台
◆ 出生年月：1992年11月
◆ 政治面貌：中共党员
◆ 现居居地：上海杨浦

### ◆ 自我评价
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

## ◆ 教育背景
2013.09~2016.07 中国社会大学 市场营销 本科学位
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

## ◆ 工作经历
### 2015.07~2015.08 “OPPO 校园俱乐部”项目 新媒体运营
◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
◆ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

### 2014.07~2014.08 北京乔布有限公司 运营实习生
◆ 要负责撰写软文，协助运营执行推广活动；
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；
◆ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

## ◆ 获得荣誉
◆ 2015.10 2015年全国大学生数学建模竞赛三等奖
◆ 2014.11 校学业一等奖学金
◆ 2012.10 校一等优秀学生奖学金

## ◆ 技能证书
◆ 语言能力：通过大学英语六级、普通话二级甲等
◆ 计算机能力：通过全国计算机等级考试（二级 C）
熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-07 17:47:19.229683+08', '2026-06-07 12:27:45.580525+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('81d28346-f40a-48b9-aa77-25b06d0de524', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/e7427ce1-4753-4138-96e1-5b69cc47b294.pdf', 'pdf', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "“OPPO 校园俱乐部”项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动 ；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '以下是为您从简历图片中提取的文字内容，已尽可能保持原有的格式和结构：

---

# 锤子简历
**应聘岗位：新媒体运营**

---

### [联系方式]
*   ◆ 138-0000-0000
*   ◆ BD@100chui.com

### [个人信息]
*   ◆ 籍贯：山东烟台
*   ◆ 出生年月：1992 年 11 月
*   ◆ 政治面貌：中共党员
*   ◆ 现居居地：上海杨浦

### [自我评价]
*   ◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
*   ◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
*   ◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

### [教育背景]
**2013.09~2016.07**   **中国社会大学**   **市场营销**   **本科学位**
*   主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

### [工作经历]
**2015.07~2015.08**   **“OPPO 校园俱乐部”项目**   **新媒体运营**
*   ◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
*   ◆ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；
*   ◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

**2014.07~2014.08**   **北京乔布有限公司**   **运营实习生**
*   ◆ 要负责撰写软文，协助运营执行推广活动 ；
*   ◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；
*   ◆ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

### [获得荣誉]
*   ◆ 2015.10  2015 年全国大学生数学建模竞赛三等奖
*   ◆ 2014.11  校学业一等奖学金
*   ◆ 2012.10  校一等优秀学生奖学金

### [技能证书]
*   ◆ **语言能力**：通过大学英语六级、普通话二级甲等
*   ◆ **计算机能力**：通过全国计算机等级考试（二级 C）
    *   熟练掌握 word、excel、PPT 等日常办公软件

---
*(注：以上文字已根据图片原始内容提取)*', 'f', '2026-06-10 20:36:09.564155+08', '2026-06-07 12:04:06.387157+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('5029a445-4199-4b16-a8e4-85fbb48b5850', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/b79080db-192c-4cf6-9f80-a3392b926e44.pdf', 'pdf', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护;", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "锤子简历", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '锤子简历
应聘岗位：新媒体运营

### 联系方式
◇ 138-0000-0000
◇ BD@100chui.com

### 个人信息
◇ 籍贯：山东烟台
◇ 出生年月：1992年11月
◇ 政治面貌：中共党员
◇ 现居居地：上海杨浦

### 自我评价
◇ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
◇ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
◇ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

### 教育背景
2013.09~2016.07  中国社会大学  市场营销  本科学位
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

### 工作经历
2015.07~2015.08  “OPPO 校园俱乐部”项目  新媒体运营
◇ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
◇ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；
◇ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

2014.07~2014.08  北京乔布有限公司  运营实习生
◇ 要负责撰写软文，协助运营执行推广活动 ；
◇ 负责公司自媒体（如微博、微信公众）的信息发布及维护;
◇ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

### 获得荣誉
◇ 2015.10  2015 年全国大学生数学建模竞赛三等奖
◇ 2014.11  校学业一等奖学金
◇ 2012.10  校一等优秀学生奖学金

### 技能证书
◇ 语言能力：通过大学英语六级、普通话二级甲等
◇ 计算机能力：通过全国计算机等级考试（二级 C）
    熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-07 17:47:16.128852+08', '2026-06-07 16:51:37.595429+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('f99a259d-45a0-4dab-bb11-da5188ffef23', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/0cbb3f13-3621-435e-8056-94178827b171.pdf', 'pdf', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级 C）  熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条。"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '锤子简历  
应聘岗位：新媒体运营  


### 联系方式  
◆ 138-0000-0000  
◆ BD@100chui.com  


### 个人信息  
◆ 籍贯：山东烟台  
◆ 出生年月：1992年11月  
◆ 政治面貌：中共党员  
◆ 现居居地：上海杨浦  


### 自我评价  
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；  
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；  
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。  


### 教育背景  
2013.09~2016.07  中国社会大学  市场营销  本科学位  
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等  


### 工作经历  
2015.07~2015.08  “OPPO 校园俱乐部”项目  新媒体运营  
◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；  
◆ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；  
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。  

2014.07~2014.08  北京乔布有限公司  运营实习生  
◆ 要负责撰写软文，协助运营执行推广活动；  
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；  
◆ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条  


### 获得荣誉  
◆ 2015.10  2015 年全国大学生数学建模竞赛三等奖  
◆ 2014.11  校学业一等奖学金  
◆ 2012.10  校一等优秀学生奖学金  


### 技能证书  
◆ 语言能力：通过大学英语六级、普通话二级甲等  
◆ 计算机能力：通过全国计算机等级考试（二级 C）  熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-07 17:47:17.189341+08', '2026-06-07 15:40:11.307634+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('f11cf6bc-9806-49b8-8211-8397b5f7ac79', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/88d31877-8003-4334-9593-cf9ff92d0e24.pdf', 'pdf', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 锤子简历
#### 应聘岗位：新媒体运营

---

##### 联系方式
◆ 138-0000-0000  
◆ BD@100chui.com  

##### 个人信息
◆ 籍贯：山东烟台  
◆ 出生年月：1992年11月  
◆ 政治面貌：中共党员  
◆ 现居地：上海杨浦  

##### 自我评价
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；  
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；  
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。  


---

##### 教育背景
2013.09~2016.07　　中国社会大学　　市场营销　　本科学位  
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等  

##### 工作经历
**2015.07~2015.08**　　“OPPO 校园俱乐部”项目　　新媒体运营  
◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为OPPO公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；  
◆ 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；  
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。  

**2014.07~2014.08**　　北京乔布有限公司　　运营实习生  
◆ 要负责撰写软文，协助运营执行推广活动；  
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；  
◆ 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条  

##### 获得荣誉
◆ 2015.10　2015年全国大学生数学建模竞赛三等奖  
◆ 2014.11　校学业一等奖学金  
◆ 2012.10　校一等优秀学生奖学金  

##### 技能证书
◆ 语言能力：通过大学英语六级、普通话二级甲等  
◆ 计算机能力：通过全国计算机等级考试（二级C）  
　　熟练掌握word、excel、PPT等日常办公软件', 'f', '2026-06-10 20:36:06.944242+08', '2026-06-09 08:49:55.446148+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('bca72a40-11bf-4d3b-9834-fcf241850eca', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/f223394b-68f6-4435-a722-9d7898ea38cd.pdf', 'pdf', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造\"OPPO 校园俱乐部\"的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '# 锤子简历

**应聘岗位：新媒体运营**

---

## 左侧栏

### 联系方式
- ◆ 138-0000-0000
- ◆ BD@100chui.com

### 个人信息
- ◆ 籍贯：山东烟台
- ◆ 出生年月：1992年11月
- ◆ 政治面貌：中共党员
- ◆ 现居居地：上海杨浦

### 自我评价
- ◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
- ◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
- ◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

## 右侧栏

### 教育背景
**2013.09~2016.07　　中国社会大学　　市场营销　　本科学位**

主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

### 工作经历

**2015.07~2015.08　　"OPPO 校园俱乐部"项目　　新媒体运营**

- ◆ 在官方微博平台中，打造"OPPO 校园俱乐部"的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
- ◆ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；
- ◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

**2014.07~2014.08　　北京乔布有限公司　　运营实习生**

- ◆ 要负责撰写软文，协助运营执行推广活动；
- ◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；
- ◆ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

### 获得荣誉
- ◆ 2015.10　2015 年全国大学生数学建模竞赛三等奖
- ◆ 2014.11　校学业一等奖学金
- ◆ 2012.10　校一等优秀学生奖学金

### 技能证书
- ◆ **语言能力：** 通过大学英语六级、普通话二级甲等
- ◆ **计算机能力：** 通过全国计算机等级考试（二级 C）
- 熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-10 20:36:02.760076+08', '2026-06-10 18:16:41.629212+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('80d2f0af-1141-4d99-b6fe-29c7976160ca', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/3afce157-9097-44ed-a7d8-b05cba367264.jpg', 'jpg', '{"skills": ["通过大学英语六级、普通话二级甲等", "通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "“OPPO 校园俱乐部”项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 锤子简历
应聘岗位：新媒体运营

#### 联系方式
- 138-0000-0000
- BD@100chui.com

#### 个人信息
- 籍贯：山东烟台
- 出生年月：1992年11月
- 政治面貌：中共党员
- 现居居地：上海杨浦

#### 自我评价
- 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
- 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
- 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

#### 教育背景
2013.09~2016.07 中国社会大学 市场营销 本科学位
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

#### 工作经历
1. 2015.07~2015.08 “OPPO 校园俱乐部”项目 新媒体运营
   - 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
   - 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；
   - 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

2. 2014.07~2014.08 北京乔布有限公司 运营实习生
   - 要负责撰写软文，协助运营执行推广活动；
   - 负责公司自媒体（如微博、微信公众）的信息发布及维护；
   - 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

#### 获得荣誉
- 2015.10 2015 年全国大学生数学建模竞赛三等奖
- 2014.11 校学业一等奖学金
- 2012.10 校一等优秀学生奖学金

#### 技能证书
- 语言能力：通过大学英语六级、普通话二级甲等
- 计算机能力：通过全国计算机等级考试（二级 C）
熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-10 20:36:05.0682+08', '2026-06-05 16:04:28.108316+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('42a2f204-8f22-497c-857c-209aa131ff5c', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/19255bd4-9d37-453a-bc99-41002604b3de.pdf', 'pdf', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动 ；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '# 锤子简历
应聘岗位：新媒体运营

## 联系方式
◆ 138-0000-0000
◆ BD@100chui.com

## 个人信息
◆ 籍贯：山东烟台
◆ 出生年月：1992年11月
◆ 政治面貌：中共党员
◆ 现居居地：上海杨浦

## 自我评价
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。

---

## 教育背景
2013.09~2016.07        中国社会大学        市场营销        本科学位
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

## 工作经历
### 2015.07~2015.08        “OPPO 校园俱乐部”项目        新媒体运营
◆ 在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
◆ 根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。

### 2014.07~2014.08        北京乔布有限公司        运营实习生
◆ 要负责撰写软文，协助运营执行推广活动 ；
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；
◆ 业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

## 获得荣誉
◆ 2015.10 2015 年全国大学生数学建模竞赛三等奖
◆ 2014.11 校学业一等奖学金
◆ 2012.10 校一等优秀学生奖学金

## 技能证书
◆ 语言能力：通过大学英语六级、普通话二级甲等
◆ 计算机能力：通过全国计算机等级考试（二级 C）
熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-10 20:36:06.06055+08', '2026-06-09 21:15:19.556145+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('d0ac95f7-098a-4b2a-bc6e-0c4c129dc215', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '岗位', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/20c3d735-e1a7-4698-8b95-01ef338644d9.pdf', 'pdf', '{"skills": ["MES开发经验", "Java", "MySQL", "MyBatis", "Oracle"], "summary": "", "projects": [], "education": [], "experience": [], "personal_info": {"name": "", "email": "", "phone": ""}}', '这张图片中的文字内容如下：

**java高级后端开发工程师  10-15K**

📍 南京  💼 3-5年  🎓 本科

---

**职位描述**

[收藏] [立即沟通]

> 💬 微信扫码分享   ⚠️ 举报

**标签：** MES开发经验 | Java | MySQL | MyBatis | Oracle

---

**岗位职责：**
1、负责全域直流管控项目后端代码编写、自测、性能优化等工作；
2、负责电网业务需求理解，并合理化设计接口服务及数据库；
3、独立完成代码编写和自测工作；
4、配合项目经理进行版本发布工作。
5、编写接口文档、软件设计相关文档。

**任职要求：**
1、计算机相关专业本科及以上学历，5年及以上后端研发经验；
2、熟练掌握Springboot下的微服务开发，熟悉Spring Cloud Alibaba下的配置、注册、开发工作；
3、熟练掌握Mybatis开发技术，熟练使用Oracel、Mysql数据库；
4、熟悉Linux系统，能独立完成打包部署实施工作；
5、有电网数字化项目开发经验优先；', 'f', '2026-06-10 20:36:08.327537+08', '2026-06-07 12:27:28.481564+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('21354e82-065f-4c1c-9823-d359e701ceff', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/0cc54484-81ad-4490-b653-45ca5ab84188.jpg', 'jpg', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级 C）", "熟练掌握 word、excel、PPT 等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；", "根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "OPPO 校园俱乐部项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '这张图片是一份简历，内容如下：

**锤子简历**
应聘岗位：新媒体运营

---

**教育背景**
*   **2013.09~2016.07**  中国社会大学  市场营销  本科学位
*   主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等

**联系方式**
*   138-0000-0000
*   BD@100chui.com

**个人信息**
*   籍贯：山东烟台
*   出生年月：1992年11月
*   政治面貌：中共党员
*   现居居地：上海杨浦

**自我评价**
*   多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；
*   能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；
*   具备良好的沟通能力和团队协作能力，能快速融入团队。

---

**工作经历**
*   **2015.07~2015.08**  “OPPO 校园俱乐部”项目  新媒体运营
    *   在官方微博平台中，打造“OPPO 校园俱乐部”的概念，为 OPPO 公司在全国范围内各大高集结粉丝，让学生由参与者变成创造者，变成 OPPO 的校园代言人；
    *   根据 OPPO 客户诉求，基于产品特点，负责品牌传播策略，包括创意构思、文案撰写等；
    *   挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。
*   **2014.07~2014.08**  北京乔布有限公司  运营实习生
    *   要负责撰写软文，协助运营执行推广活动；
    *   负责公司自媒体（如微博、微信公众）的信息发布及维护；
    *   业绩：所负责的微博热点活动参与数量单条超过 1,000 人，获得 1,000 次转发，回复 500 条

**获得荣誉**
*   2015.10  2015 年全国大学生数学建模竞赛三等奖
*   2014.11  校学业一等奖学金
*   2012.10  校一等优秀学生奖学金

**技能证书**
*   **语言能力：** 通过大学英语六级、普通话二级甲等
*   **计算机能力：** 通过全国计算机等级考试（二级 C）
*   熟练掌握 word、excel、PPT 等日常办公软件', 'f', '2026-06-10 20:36:10.614454+08', '2026-06-07 11:26:28.949993+08', NULL, NULL, 1, 'draft', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('f900c48e-8b00-480e-a0f9-531a38cad2e2', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/4e6b00e4-8441-470d-9f01-c954cdf4fcb5.pdf', 'pdf', '{"skills": ["语言能力：通过大学英语六级、普通话二级甲等", "计算机能力：通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众平台）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 左侧内容  

**锤子简历**  
应聘岗位：新媒体运营  


#### 联系方式  
◆ 138-0000-0000  
◆ BD@100chui.com  


#### 个人信息  
◆ 籍贯：山东烟台  
◆ 出生年月：1992年11月  
◆ 政治面貌：中共党员  
◆ 现居地：上海杨浦  


#### 自我评价  
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；  
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；  
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。  


### 右侧内容  

#### 教育背景  
2013.09~2016.07 &nbsp;&nbsp; 中国社会大学 &nbsp;&nbsp; 市场营销 &nbsp;&nbsp; 本科学位  
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等  


#### 工作经历  
**2015.07~2015.08** &nbsp;&nbsp; “OPPO 校园俱乐部”项目 &nbsp;&nbsp; 新媒体运营  
◆ 在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；  
◆ 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；  
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。  


**2014.07~2014.08** &nbsp;&nbsp; 北京乔布有限公司 &nbsp;&nbsp; 运营实习生  
◆ 负责撰写软文，协助运营执行推广活动；  
◆ 负责公司自媒体（如微博、微信公众平台）的信息发布及维护；  
◆ 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条  


#### 获得荣誉  
◆ 2015.10 &nbsp;&nbsp; 2015年全国大学生数学建模竞赛三等奖  
◆ 2014.11 &nbsp;&nbsp; 校学业一等奖学金  
◆ 2012.10 &nbsp;&nbsp; 校一等优秀学生奖学金  


#### 技能证书  
◆ 语言能力：通过大学英语六级、普通话二级甲等  
◆ 计算机能力：通过全国计算机等级考试（二级C）  
熟练掌握word、excel、PPT等日常办公软件  


（注：“各大高”结合语境修正为“各大高校”，与“校园俱乐部”的校园场景逻辑一致。）', 't', NULL, '2026-06-10 20:36:47.671961+08', NULL, NULL, 1, 'optimized', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');
INSERT INTO "public"."resumes" VALUES ('e3864c8d-6579-496c-8586-b989015de650', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '简历', 'http://localhost:8000/uploads/resumes/f7bb26d7-2621-44c7-91dc-d8e253a9bd80/67e65f2c-71fe-4c6a-977d-8c7cce88dba4.pdf', 'pdf', '{"skills": ["通过大学英语六级", "普通话二级甲等", "通过全国计算机等级考试（二级C）", "熟练掌握word、excel、PPT等日常办公软件"], "summary": "多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。", "projects": [], "education": [{"end": "2016.07", "major": "市场营销", "start": "2013.09", "degree": "本科学位", "school": "中国社会大学"}], "experience": [{"end": "2015.08", "start": "2015.07", "title": "新媒体运营", "points": ["在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；", "根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；", "挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。"], "company": "\"OPPO 校园俱乐部\"项目"}, {"end": "2014.08", "start": "2014.07", "title": "运营实习生", "points": ["要负责撰写软文，协助运营执行推广活动；", "负责公司自媒体（如微博、微信公众）的信息发布及维护；", "业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条"], "company": "北京乔布有限公司"}], "personal_info": {"name": "", "email": "BD@100chui.com", "phone": "138-0000-0000"}}', '### 锤子简历  
应聘岗位：新媒体运营  


#### 联系方式  
◆ 138-0000-0000  
◆ BD@100chui.com  


#### 个人信息  
◆ 籍贯：山东烟台  
◆ 出生年月：1992年11月  
◆ 政治面貌：中共党员  
◆ 现居居地：上海杨浦  


#### 自我评价  
◆ 多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；  
◆ 能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；  
◆ 具备良好的沟通能力和团队协作能力，能快速融入团队。  


#### 教育背景  
2013.09~2016.07　中国社会大学　市场营销　本科学位  
主修课程：基本会计、统计学、市场营销、国际市场营销、市场调查与预测、商业心理学等  


#### 工作经历  
2015.07~2015.08　“OPPO 校园俱乐部”项目　新媒体运营  
◆ 在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；  
◆ 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；  
◆ 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。  

2014.07~2014.08　北京乔布有限公司　运营实习生  
◆ 要负责撰写软文，协助运营执行推广活动；  
◆ 负责公司自媒体（如微博、微信公众）的信息发布及维护；  
◆ 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条  


#### 获得荣誉  
◆ 2015.10　2015年全国大学生数学建模竞赛三等奖  
◆ 2014.11　校学业一等奖学金  
◆ 2012.10　校一等优秀学生奖学金  


#### 技能证书  
◆ 语言能力：通过大学英语六级、普通话二级甲等  
◆ 计算机能力：通过全国计算机等级考试（二级C）  
熟练掌握word、excel、PPT等日常办公软件  


（注：以上文字严格提取自图片内容，保留原有格式与结构。）', 't', NULL, '2026-06-10 20:36:16.238027+08', NULL, NULL, 1, 'optimized', NULL, NULL, 'f', NULL, '2026-09-05 08:38:55.720525+08');

-- ----------------------------
-- Table structure for support_tickets
-- ----------------------------
DROP TABLE IF EXISTS "public"."support_tickets";
CREATE TABLE "public"."support_tickets" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "category" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "priority" varchar(8) COLLATE "pg_catalog"."default" NOT NULL,
  "subject" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "content" text COLLATE "pg_catalog"."default",
  "attachments" jsonb,
  "status" varchar(16) COLLATE "pg_catalog"."default" NOT NULL,
  "assigned_to" varchar(36) COLLATE "pg_catalog"."default",
  "resolution" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "closed_at" timestamptz(6)
)
;

-- ----------------------------
-- Records of support_tickets
-- ----------------------------

-- ----------------------------
-- Table structure for ticket_replies
-- ----------------------------
DROP TABLE IF EXISTS "public"."ticket_replies";
CREATE TABLE "public"."ticket_replies" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "ticket_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "admin_id" varchar(36) COLLATE "pg_catalog"."default",
  "user_id" varchar(36) COLLATE "pg_catalog"."default",
  "content" text COLLATE "pg_catalog"."default" NOT NULL,
  "is_internal" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of ticket_replies
-- ----------------------------

-- ----------------------------
-- Table structure for user_devices
-- ----------------------------
DROP TABLE IF EXISTS "public"."user_devices";
CREATE TABLE "public"."user_devices" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "device_id" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "device_name" varchar(128) COLLATE "pg_catalog"."default",
  "platform" varchar(32) COLLATE "pg_catalog"."default",
  "ip_address" varchar(45) COLLATE "pg_catalog"."default",
  "user_agent" text COLLATE "pg_catalog"."default",
  "refresh_token_hash" varchar(255) COLLATE "pg_catalog"."default",
  "last_active" timestamptz(6) NOT NULL DEFAULT now(),
  "is_revoked" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of user_devices
-- ----------------------------
INSERT INTO "public"."user_devices" VALUES ('56739572-1777-47a1-8d80-305171a90077', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0', NULL, '2026-06-01 13:40:28.888801+08', 't', '2026-06-01 13:40:28.577404+08');
INSERT INTO "public"."user_devices" VALUES ('b8436bd0-103d-4e23-a6db-b8d2b2072e61', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780841862535', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'b7223607b12063bf226e1b81871a706ad3e117024a01b58a39ce33d501824be7', '2026-06-07 22:17:43.226217+08', 'f', '2026-06-07 22:17:42.931061+08');
INSERT INTO "public"."user_devices" VALUES ('5d543184-32f9-4ab4-8957-cec673f910da', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780895359233', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'c1186488dc8c1f8e69425c22bb7968dfd2a6af6893db11783b5bc3a92bd96191', '2026-06-08 13:09:19.947646+08', 'f', '2026-06-08 13:09:19.627491+08');
INSERT INTO "public"."user_devices" VALUES ('f4f26e1b-78a7-4d91-97ac-ae4b6245ae30', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780901309914', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'd0092e473b67e1cf62f6b6ba33edd97f8bb43983ad105d1d3b801060f97e239f', '2026-06-08 14:48:30.559653+08', 'f', '2026-06-08 14:48:30.286652+08');
INSERT INTO "public"."user_devices" VALUES ('83d9b7d4-c725-4fd6-9953-2137f6793346', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780964704472', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'b45dc173d097ee6ece32607fb23af504fc818a2cee49f5838cfeed46a00a8aae', '2026-06-09 08:25:05.168827+08', 'f', '2026-06-09 08:25:04.861307+08');
INSERT INTO "public"."user_devices" VALUES ('ee298e91-a39d-4169-bc94-7dc483112331', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780292535723', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0', '8a264bbc025146fcc7194293c0a3b2734916a3a9c80f6ffed6648ee9f63de008', '2026-06-05 14:51:58.630147+08', 'f', '2026-06-01 13:52:48.382203+08');
INSERT INTO "public"."user_devices" VALUES ('35b32f82-1ba7-45a5-8251-5c19a20e1770', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780644175698', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0', 'a7fcff34876b5a8846055b64deada13ca84a2d67a9d161efd5b9efa79ae04750', '2026-06-05 15:22:56.366161+08', 'f', '2026-06-05 15:22:56.084142+08');
INSERT INTO "public"."user_devices" VALUES ('be5ed6cb-5477-4f27-a36a-c963a7a9bafb', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780646658226', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '3d5101b46eea1f87ffc026118bf6202a996589b803c6c2511adacd83dc26a069', '2026-06-05 16:04:18.934157+08', 'f', '2026-06-05 16:04:18.63442+08');
INSERT INTO "public"."user_devices" VALUES ('204fcd95-12d7-4494-bb18-8264d60a3695', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780647389783', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', 'd4c853d7359026abfc40d16a9ea505ccde792c0439745de0645d0f1ed14a449d', '2026-06-05 16:16:30.091275+08', 'f', '2026-06-05 16:16:29.81421+08');
INSERT INTO "public"."user_devices" VALUES ('1bdfe2b1-b183-451a-a2ee-fcc0f4b20b3a', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780743483035', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'a3d0947e6c1b8af2ae5cd4f92c727d4c223494d5cde33301fc56b7108728ef1d', '2026-06-06 18:58:03.730569+08', 'f', '2026-06-06 18:58:03.425343+08');
INSERT INTO "public"."user_devices" VALUES ('13bc2d99-2c70-4efe-ab24-91ec4965f970', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780753394325', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'adbf4ad0e41cf09cbb48a3871e87eb8b643073d4bf1bece42d50aee254e538ea', '2026-06-06 21:43:14.966602+08', 'f', '2026-06-06 21:43:14.69395+08');
INSERT INTO "public"."user_devices" VALUES ('58b45fc2-5e8e-43aa-96fd-cd8a02dc6b9d', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780755810120', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'aff0702a3494991b16dbc4b2e10c4b8a1ecfeaf861c22cfacb9ec3dd46477fb7', '2026-06-06 22:23:30.423588+08', 'f', '2026-06-06 22:23:30.150461+08');
INSERT INTO "public"."user_devices" VALUES ('8a4b0b07-74f9-43e4-963e-b401483bf43d', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780802770079', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '307b884749d09b063759bc2e38ba5db1384a84d523b3a2f0874bfe4e871375ef', '2026-06-07 11:26:10.768024+08', 'f', '2026-06-07 11:26:10.467456+08');
INSERT INTO "public"."user_devices" VALUES ('3d7d3c0e-50e4-4350-8bf1-4e0259ab55a7', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780817960425', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '1e901f38127bb3c06ed56b9b2cde1ee30a90b5f28dc24208d7d10b1ee1fcbfac', '2026-06-07 15:39:21.075384+08', 'f', '2026-06-07 15:39:20.799409+08');
INSERT INTO "public"."user_devices" VALUES ('589f3291-201c-4fe1-9e3b-12ef801010c5', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780825622749', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '3fd91a4533a472fdb3ff584c8eb441ba89fd981492b7dcf25f1f55c017c4dd9e', '2026-06-07 17:47:03.390533+08', 'f', '2026-06-07 17:47:03.124094+08');
INSERT INTO "public"."user_devices" VALUES ('4a1ebe2b-2b7a-4cb4-89af-655b871f5224', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1780966180290', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'c387942e205cfce744b90f5a2824933ab8ceba52d9f3b8057629594d578789a3', '2026-06-09 08:49:40.948319+08', 'f', '2026-06-09 08:49:40.669023+08');
INSERT INTO "public"."user_devices" VALUES ('eca1af92-b210-4ad4-a541-4affc0228ec2', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781010635755', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '4cb8fee84f8a88d34f86d66005d248346f59aa8ce59748463edff4b1d4e1df08', '2026-06-09 21:10:36.445507+08', 'f', '2026-06-09 21:10:36.147984+08');
INSERT INTO "public"."user_devices" VALUES ('725e93f7-4ca4-41c6-8a5d-5fa30c29d1f9', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781086597312', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'e97e6c8b1ee21e4e4966293829d575b50654cbb7aeaab2ac21b9b2f76534d2ad', '2026-06-10 18:16:38.000686+08', 'f', '2026-06-10 18:16:37.701263+08');
INSERT INTO "public"."user_devices" VALUES ('2784002b-06b2-4dba-9b18-5bb1707bb4b0', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781094952645', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '98b4591eb1bfb64e330991db1346274a5eebb41b61e13191e75ec0098f0e1578', '2026-06-10 20:35:53.296929+08', 'f', '2026-06-10 20:35:53.020348+08');
INSERT INTO "public"."user_devices" VALUES ('977eb911-c56b-40c7-9d1e-11657d9e38ba', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781136469524', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '8662f145cc4fa2017c1bb468b047856fb4e1180a83678666bc52cc23d7ecf02e', '2026-06-11 08:07:50.206854+08', 'f', '2026-06-11 08:07:49.905183+08');
INSERT INTO "public"."user_devices" VALUES ('1ab67b59-f576-4940-a793-b42abc2043ca', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781143901107', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'b1b503d39ceea089f5313f0692c0d5642c3087577895e1b381f4b36e4dcd0d12', '2026-06-11 10:11:41.76472+08', 'f', '2026-06-11 10:11:41.47597+08');
INSERT INTO "public"."user_devices" VALUES ('abd24710-37e8-4dd9-a1ab-c534eb4fc718', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781157573174', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '4decc1525c41a31a0e4640129c3d3574b4b30fc5489425fc930b356e2a217fab', '2026-06-11 13:59:33.965693+08', 'f', '2026-06-11 13:59:33.684962+08');
INSERT INTO "public"."user_devices" VALUES ('e42afb15-939e-45f3-b594-e7ee01072a97', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781158379499', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '7439d0052b7baf94d259cbddb368370a5b56d2a7c5b6ce9d7672128865ba5680', '2026-06-11 14:13:00.162987+08', 'f', '2026-06-11 14:12:59.882751+08');
INSERT INTO "public"."user_devices" VALUES ('376d7ae7-594b-4404-9e57-b7bcdcad1988', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781187010544', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '48fec79cb19a51a0de87bc3238aa124b8925feef090f4d83e2fcec356be37bc1', '2026-06-11 22:10:11.211578+08', 'f', '2026-06-11 22:10:10.920013+08');
INSERT INTO "public"."user_devices" VALUES ('e6062417-92fc-4349-a057-b9ea7886c834', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781253107086', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'ca2d86c91314352bd7efa499043bb4817c77bf81dfc31bed6c941f984f2d7e86', '2026-06-12 16:31:47.903562+08', 'f', '2026-06-12 16:31:47.601329+08');
INSERT INTO "public"."user_devices" VALUES ('e5a6b2b4-70be-428e-baa5-2d7206820645', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781437372667', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '737a97396151feb1bcf7dd100bf14367cc53b0d902c1b92731294a4203f451a7', '2026-06-14 19:42:53.333013+08', 'f', '2026-06-14 19:42:53.049516+08');
INSERT INTO "public"."user_devices" VALUES ('4eaef0bb-4aa1-4b55-be94-9bcc877fb5a6', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781438251859', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '2b120f06d2311df6855ff7358619821141cf0191d4b82b891b804e0c3c502b37', '2026-06-14 19:57:32.492065+08', 'f', '2026-06-14 19:57:32.226164+08');
INSERT INTO "public"."user_devices" VALUES ('441e5c31-9d11-4bc0-9593-7d34a12d717c', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781507215859', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '45bafcdd7ae609a48824ad5af438fcbb901e010c1d2738024637950307c5da6e', '2026-06-15 15:06:56.510552+08', 'f', '2026-06-15 15:06:56.228987+08');
INSERT INTO "public"."user_devices" VALUES ('fb00fb8b-2ee2-4cae-a772-73a7bd014757', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781761742516', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'ab20d01b01f7e0cd9a9a297bd72bd0f6b3aac827ccb7b06f55a8441c1452a015', '2026-06-18 13:49:03.189593+08', 'f', '2026-06-18 13:49:02.894456+08');
INSERT INTO "public"."user_devices" VALUES ('8fa213b5-89dd-4184-a5a2-88e7dab32434', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781769645253', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'f87f6aea6a9e41f5eaa778864172fe05114d9e374d6b7c7e93e6997b47c2da83', '2026-06-18 16:00:45.915038+08', 'f', '2026-06-18 16:00:45.638652+08');
INSERT INTO "public"."user_devices" VALUES ('ba53f2eb-4d08-442b-8ae8-b57b223816f1', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781784848139', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '859924d4a9edccdab090834cca4f8672a7e29200638eb7d940d09653f9aaff2b', '2026-06-18 20:14:08.824467+08', 'f', '2026-06-18 20:14:08.527912+08');
INSERT INTO "public"."user_devices" VALUES ('b2693e7c-d5b8-43f6-9dd0-a392ad8b6dd1', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1781880568805', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'db15bd67819f85569decbeeafa5b9768b9576009867c768a5a9590b64ff41a41', '2026-06-19 22:49:29.557324+08', 'f', '2026-06-19 22:49:29.23177+08');
INSERT INTO "public"."user_devices" VALUES ('420bbc7c-9255-4649-9dc2-b8577b32f7ab', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1782088636438', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'd88f32554adefacd748e7d1bd2faacaa1d7b4804a5d6ff130c4b0c307528a13f', '2026-06-22 08:37:17.141822+08', 'f', '2026-06-22 08:37:16.823431+08');
INSERT INTO "public"."user_devices" VALUES ('56ba98f9-fb5b-4102-86c6-055cba0dcb59', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1782106676053', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'a4ddfa33ab107d3a126fb58eef983e5f69da073b828b252209d278f281d13484', '2026-06-22 13:37:56.786091+08', 'f', '2026-06-22 13:37:56.472591+08');
INSERT INTO "public"."user_devices" VALUES ('01469977-32c2-4a42-b6d3-6a3617cfe0ff', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1782117062522', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', '4d5ee2f56a3556903c6caf02aba00d5bb11728dc62f3ea94b69acda76a88cbca', '2026-06-22 16:31:03.167679+08', 'f', '2026-06-22 16:31:02.891828+08');
INSERT INTO "public"."user_devices" VALUES ('b6967627-e2cd-4510-a4b2-bbd6a03e53f3', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1782201396889', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 'd6837840ffa23940abaa0e210f4b56f36a2c03126957673bfc0d27cd29940f96', '2026-06-23 15:56:37.554729+08', 'f', '2026-06-23 15:56:37.262221+08');
INSERT INTO "public"."user_devices" VALUES ('6784f5fa-7fd8-4b99-a9da-436790f0243f', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788252312268', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 'f0b4146e0ee9f1baf70609b36f2b2250451fd94b5e7b86a93cd365fef35f9330', '2026-09-01 17:29:43.667506+08', 'f', '2026-09-01 17:29:43.363062+08');
INSERT INTO "public"."user_devices" VALUES ('c5781d38-755f-45e5-af00-ca02d8632595', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788264152215', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 'ea1c8e6aa2c1c040cce071c5cefb5431bcac291af45d202fd97a59f8a6ef0d74', '2026-09-01 20:02:32.956445+08', 'f', '2026-09-01 20:02:32.662174+08');
INSERT INTO "public"."user_devices" VALUES ('b107728a-3108-410d-9c81-74f3ee286748', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788422947682', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', '5c7a9b79c87abd2d8fe1669b654d32ac455dfd8cbf671398fc5307854828b967', '2026-09-03 16:09:08.274911+08', 'f', '2026-09-03 16:09:08.02499+08');
INSERT INTO "public"."user_devices" VALUES ('ad14072a-6543-4fea-89aa-9141c1aaf5ad', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-f7bb26d7-2621-44c7-91dc-d8e253a9bd80', NULL, 'web', '127.0.0.1', 'python-httpx/0.26.0', 'e92320770209b28a250ee4956bbca195910c8de9ba3ce74a2e9f47ff92132188', '2026-09-01 20:30:30.400255+08', 'f', '2026-09-01 19:00:33.096177+08');
INSERT INTO "public"."user_devices" VALUES ('c1f605e2-810a-4055-ac00-dd823a685723', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788346157708', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', '590fc5eba662785b9b7857a5b3f9a5c0e147904f554117bdf4735c2645e0f982', '2026-09-02 18:50:20.169256+08', 'f', '2026-09-02 18:50:19.852427+08');
INSERT INTO "public"."user_devices" VALUES ('08986d94-392d-4f38-963b-20e21a7684b0', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788416951219', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 'deeba3b4517c5207641a94d96a09072907a57e068f37a8610c356e06e41d82ec', '2026-09-03 14:29:12.026786+08', 'f', '2026-09-03 14:29:11.720502+08');
INSERT INTO "public"."user_devices" VALUES ('8cbfb648-703f-4af0-a519-d33a46be98b0', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788422051153', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 'a9b06870381feba6a1fece3b6f345016a4ce1930ee15fa16ce1529c7ac29c194', '2026-09-03 15:54:11.463311+08', 'f', '2026-09-03 15:54:11.192675+08');
INSERT INTO "public"."user_devices" VALUES ('7f166b8c-107e-4775-aaa6-c22648cb5241', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788422843039', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TRAESOLOCN/1.107.1 Chrome/142.0.7444.235 Electron/39.2.7 Safari/537.36', '61011a3b99bf268fb6905c14c4ba49d4b84ff21bd87dbf8ca1b061317cb5d531', '2026-09-03 16:07:23.657249+08', 'f', '2026-09-03 16:07:23.405927+08');
INSERT INTO "public"."user_devices" VALUES ('b93dcc6f-9f5c-4e00-86b6-abd50046d41e', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788424233326', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 'fea8cfaf2e6aec87c0f4f03cd2c8782e16bd1e0fa47cdeee1f6bb07ecf295db2', '2026-09-03 16:30:33.929627+08', 'f', '2026-09-03 16:30:33.677876+08');
INSERT INTO "public"."user_devices" VALUES ('3aea0bd4-53db-480e-a8ca-a817913b0e5c', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788426362258', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', '296d282db3e86241bd6baf6aa64503ed6ce20d969e78ce3fefe9ed82ec8e35ea', '2026-09-03 17:06:02.910754+08', 'f', '2026-09-03 17:06:02.626586+08');
INSERT INTO "public"."user_devices" VALUES ('f2e6e79b-10a6-4235-813b-4320d738e5ff', 'f7bb26d7-2621-44c7-91dc-d8e253a9bd80', 'web-1788574143073', NULL, 'web', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', '61b5987f1daf60c49200afe77b026d466c99d1cdeae4bb00d768802a2bee1465', '2026-09-05 10:09:18.798629+08', 'f', '2026-09-05 10:09:18.492419+08');

-- ----------------------------
-- Table structure for user_quotas
-- ----------------------------
DROP TABLE IF EXISTS "public"."user_quotas";
CREATE TABLE "public"."user_quotas" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "daily_limit" int4 NOT NULL,
  "monthly_limit" int4 NOT NULL,
  "daily_used" int4 NOT NULL,
  "monthly_used" int4 NOT NULL,
  "last_reset_date" timestamptz(6),
  "is_paid" bool NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of user_quotas
-- ----------------------------

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "email" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "phone" varchar(128) COLLATE "pg_catalog"."default",
  "password_hash" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "nickname" varchar(64) COLLATE "pg_catalog"."default",
  "avatar_url" varchar(1024) COLLATE "pg_catalog"."default",
  "is_verified" bool NOT NULL,
  "career_state" varchar(32) COLLATE "pg_catalog"."default",
  "expectation" jsonb,
  "privacy_agreed" bool NOT NULL,
  "status" varchar(16) COLLATE "pg_catalog"."default" NOT NULL,
  "deleted_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "saved_texts" jsonb
)
;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO "public"."users" VALUES ('f7bb26d7-2621-44c7-91dc-d8e253a9bd80', '2375959600@qq.com', NULL, '$2b$12$Uor28agHUwGQ71b28/iqru69/PG5zQo1YlFRT3Z6OOY1gybnwdFyG', '123', NULL, 't', 'student', '{"cities": ["成都", "武汉", "杭州"], "job_title": "", "industries": ["互联网", "医疗", "电商", "汽车", "房产"], "salary_range": ""}', 'f', 'active', NULL, '2026-06-01 13:40:28.577404+08', '2026-06-14 21:36:01.060442+08', '{"job_text": "【岗位信息】\n岗位: java高级后端开发工程师\n薪资: 10-15K\n地点: 南京\n\n【必备要求】\n- Java\n- MySQL\n- MyBatis\n- Oracle\n- MES开发经验\n- Springboot\n- 微服务开发\n- Spring Cloud Alibaba\n- Linux系统\n- 经验要求: 5年及以上后端研发经验\n- 学历要求: 计算机相关专业本科及以上学历\n\n【加分技能】\n- 有电网数字化项目开发经验优先\n\n【岗位职责】\n- 负责全域直流管控项目后端代码编写、自测、性能优化等工作；\n- 负责电网业务需求理解，并合理化设计接口服务及数据库；\n- 独立完成代码编写和自测工作；\n- 配合项目经理进行版本发布工作。\n- 编写接口文档、软件设计相关文档。", "resume_text": "【个人信息】\n邮箱: BD@100chui.com\n电话: 138-0000-0000\n\n【个人简介】\n多年校园推广及活动策划工作经历，熟悉校园渠道和校园用户；能根据公司要求制定活动方案，并有高度执行力确保活动的良好执行；具备良好的沟通能力和团队协作能力，能快速融入团队。\n\n【工作经历】\n1. \"OPPO 校园俱乐部\"项目 - 新媒体运营 (2015.07 - 2015.08)\n   - 在官方微博平台中，打造“OPPO校园俱乐部”的概念，为OPPO公司在全国范围内各大高校集结粉丝，让学生由参与者变成创造者，变成OPPO的校园代言人；\n   - 根据OPPO客户诉求，基于产品特点，负责品牌传播策略，包括创意构想、文案撰写等；\n   - 挖掘分析网友使用习惯、情感及体验感受，结合产品特点撰写传播策划方案。\n2. 北京乔布有限公司 - 运营实习生 (2014.07 - 2014.08)\n   - 负责撰写软文，协助运营执行推广活动；\n   - 负责公司自媒体（如微博、微信公众平台）的信息发布及维护；\n   - 业绩：所负责的微博热点活动参与数量单条超过1,000人，获得1,000次转发，回复500条\n\n【教育背景】\n1. 中国社会大学 - 本科学位 - 市场营销 (2013.09 - 2016.07)\n\n【技能】\n语言能力：通过大学英语六级、普通话二级甲等, 计算机能力：通过全国计算机等级考试（二级C）, 熟练掌握word、excel、PPT等日常办公软件"}');

-- ----------------------------
-- Table structure for verification_codes
-- ----------------------------
DROP TABLE IF EXISTS "public"."verification_codes";
CREATE TABLE "public"."verification_codes" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "email" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "code" varchar(6) COLLATE "pg_catalog"."default" NOT NULL,
  "purpose" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "is_used" bool NOT NULL,
  "expires_at" timestamptz(6) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Records of verification_codes
-- ----------------------------
INSERT INTO "public"."verification_codes" VALUES ('6128a326-a014-41fe-8a13-503f705582c7', 'test1@qq.com', '989074', 'register', 'f', '2026-06-01 13:12:51.848833+08', '2026-06-01 13:07:51.885736+08');
INSERT INTO "public"."verification_codes" VALUES ('76953505-51dc-416a-ad33-208e7f75acdd', 'test@qq.com', '036483', 'register', 'f', '2026-06-01 13:44:07.080156+08', '2026-06-01 13:39:07.110044+08');
INSERT INTO "public"."verification_codes" VALUES ('fd111df1-847d-411d-8967-1a27a6f3f541', '2375959600@qq.com', '009120', 'register', 't', '2026-06-01 13:45:20.142538+08', '2026-06-01 13:40:20.144367+08');
INSERT INTO "public"."verification_codes" VALUES ('5f648803-b61d-4979-9508-e3b2220afdb5', 'test@test.com', '181682', 'login', 'f', '2026-06-22 09:34:07.896487+08', '2026-06-22 09:29:07.89837+08');

-- ----------------------------
-- Indexes structure for table admin_logs
-- ----------------------------
CREATE INDEX "ix_admin_logs_admin_id" ON "public"."admin_logs" USING btree (
  "admin_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table admin_logs
-- ----------------------------
ALTER TABLE "public"."admin_logs" ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Uniques structure for table admins
-- ----------------------------
ALTER TABLE "public"."admins" ADD CONSTRAINT "admins_username_key" UNIQUE ("username");

-- ----------------------------
-- Primary Key structure for table admins
-- ----------------------------
ALTER TABLE "public"."admins" ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table ai_model_call_logs
-- ----------------------------
CREATE INDEX "ix_ai_model_call_logs_user_id" ON "public"."ai_model_call_logs" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table ai_model_call_logs
-- ----------------------------
ALTER TABLE "public"."ai_model_call_logs" ADD CONSTRAINT "ai_model_call_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table ats_rules
-- ----------------------------
ALTER TABLE "public"."ats_rules" ADD CONSTRAINT "ats_rules_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table audit_logs
-- ----------------------------
CREATE INDEX "ix_audit_logs_user_id" ON "public"."audit_logs" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table audit_logs
-- ----------------------------
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table batch_job_tasks
-- ----------------------------
CREATE INDEX "ix_batch_job_tasks_batch_id" ON "public"."batch_job_tasks" USING btree (
  "batch_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table batch_job_tasks
-- ----------------------------
ALTER TABLE "public"."batch_job_tasks" ADD CONSTRAINT "batch_job_tasks_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table batch_optimizations
-- ----------------------------
CREATE INDEX "ix_batch_optimizations_user_id" ON "public"."batch_optimizations" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table batch_optimizations
-- ----------------------------
ALTER TABLE "public"."batch_optimizations" ADD CONSTRAINT "batch_optimizations_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table feedbacks
-- ----------------------------
CREATE INDEX "ix_feedbacks_optimization_record_id" ON "public"."feedbacks" USING btree (
  "optimization_record_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_feedbacks_user_id" ON "public"."feedbacks" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table feedbacks
-- ----------------------------
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table industry_keywords
-- ----------------------------
ALTER TABLE "public"."industry_keywords" ADD CONSTRAINT "industry_keywords_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table job_images
-- ----------------------------
CREATE INDEX "ix_job_images_user_category" ON "public"."job_images" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "category" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_job_images_user_deleted" ON "public"."job_images" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "deleted_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);
CREATE INDEX "ix_job_images_user_id" ON "public"."job_images" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table job_images
-- ----------------------------
ALTER TABLE "public"."job_images" ADD CONSTRAINT "job_images_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table messages
-- ----------------------------
CREATE INDEX "ix_messages_user_id" ON "public"."messages" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table messages
-- ----------------------------
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table model_routing
-- ----------------------------
ALTER TABLE "public"."model_routing" ADD CONSTRAINT "model_routing_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table optimized_resumes
-- ----------------------------
CREATE INDEX "ix_optimized_category" ON "public"."optimized_resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "category" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_optimized_deleted" ON "public"."optimized_resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "deleted_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);
CREATE INDEX "ix_optimized_resumes_user_id" ON "public"."optimized_resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_optimized_user_job" ON "public"."optimized_resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "job_image_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_optimized_user_resume" ON "public"."optimized_resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "resume_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table optimized_resumes
-- ----------------------------
ALTER TABLE "public"."optimized_resumes" ADD CONSTRAINT "optimized_resumes_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table orders
-- ----------------------------
CREATE INDEX "ix_orders_user_id" ON "public"."orders" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table orders
-- ----------------------------
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");

-- ----------------------------
-- Primary Key structure for table orders
-- ----------------------------
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table prompt_templates
-- ----------------------------
ALTER TABLE "public"."prompt_templates" ADD CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table quota_packages
-- ----------------------------
ALTER TABLE "public"."quota_packages" ADD CONSTRAINT "quota_packages_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table resume_templates
-- ----------------------------
ALTER TABLE "public"."resume_templates" ADD CONSTRAINT "resume_templates_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table resumes
-- ----------------------------
CREATE INDEX "ix_resumes_user_favorite" ON "public"."resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "is_favorite" "pg_catalog"."bool_ops" ASC NULLS LAST
);
CREATE INDEX "ix_resumes_user_id" ON "public"."resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "ix_resumes_user_status" ON "public"."resumes" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table resumes
-- ----------------------------
ALTER TABLE "public"."resumes" ADD CONSTRAINT "resumes_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table support_tickets
-- ----------------------------
CREATE INDEX "ix_support_tickets_user_id" ON "public"."support_tickets" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table support_tickets
-- ----------------------------
ALTER TABLE "public"."support_tickets" ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table ticket_replies
-- ----------------------------
CREATE INDEX "ix_ticket_replies_ticket_id" ON "public"."ticket_replies" USING btree (
  "ticket_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table ticket_replies
-- ----------------------------
ALTER TABLE "public"."ticket_replies" ADD CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table user_devices
-- ----------------------------
CREATE INDEX "ix_user_devices_user_id" ON "public"."user_devices" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table user_devices
-- ----------------------------
ALTER TABLE "public"."user_devices" ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table user_quotas
-- ----------------------------
CREATE INDEX "ix_user_quotas_user_id" ON "public"."user_quotas" USING btree (
  "user_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table user_quotas
-- ----------------------------
ALTER TABLE "public"."user_quotas" ADD CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table users
-- ----------------------------
CREATE UNIQUE INDEX "ix_users_email" ON "public"."users" USING btree (
  "email" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");

-- ----------------------------
-- Primary Key structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table verification_codes
-- ----------------------------
CREATE INDEX "ix_verification_codes_email" ON "public"."verification_codes" USING btree (
  "email" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table verification_codes
-- ----------------------------
ALTER TABLE "public"."verification_codes" ADD CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table admin_logs
-- ----------------------------
ALTER TABLE "public"."admin_logs" ADD CONSTRAINT "admin_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table ats_rules
-- ----------------------------
ALTER TABLE "public"."ats_rules" ADD CONSTRAINT "ats_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table batch_job_tasks
-- ----------------------------
ALTER TABLE "public"."batch_job_tasks" ADD CONSTRAINT "batch_job_tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_optimizations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."batch_job_tasks" ADD CONSTRAINT "batch_job_tasks_job_image_id_fkey" FOREIGN KEY ("job_image_id") REFERENCES "public"."job_images" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."batch_job_tasks" ADD CONSTRAINT "batch_job_tasks_optimization_record_id_fkey" FOREIGN KEY ("optimization_record_id") REFERENCES "public"."optimized_resumes" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table batch_optimizations
-- ----------------------------
ALTER TABLE "public"."batch_optimizations" ADD CONSTRAINT "batch_optimizations_source_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resumes" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."batch_optimizations" ADD CONSTRAINT "batch_optimizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table feedbacks
-- ----------------------------
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_optimization_record_id_fkey" FOREIGN KEY ("optimization_record_id") REFERENCES "public"."optimized_resumes" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table industry_keywords
-- ----------------------------
ALTER TABLE "public"."industry_keywords" ADD CONSTRAINT "industry_keywords_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table job_images
-- ----------------------------
ALTER TABLE "public"."job_images" ADD CONSTRAINT "job_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table messages
-- ----------------------------
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table model_routing
-- ----------------------------
ALTER TABLE "public"."model_routing" ADD CONSTRAINT "model_routing_failover_to_fkey" FOREIGN KEY ("failover_to") REFERENCES "public"."model_routing" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table optimized_resumes
-- ----------------------------
ALTER TABLE "public"."optimized_resumes" ADD CONSTRAINT "optimized_resumes_job_image_id_fkey" FOREIGN KEY ("job_image_id") REFERENCES "public"."job_images" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."optimized_resumes" ADD CONSTRAINT "optimized_resumes_parent_record_id_fkey" FOREIGN KEY ("parent_record_id") REFERENCES "public"."optimized_resumes" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."optimized_resumes" ADD CONSTRAINT "optimized_resumes_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."optimized_resumes" ADD CONSTRAINT "optimized_resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table orders
-- ----------------------------
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table prompt_templates
-- ----------------------------
ALTER TABLE "public"."prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table resumes
-- ----------------------------
ALTER TABLE "public"."resumes" ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table support_tickets
-- ----------------------------
ALTER TABLE "public"."support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table ticket_replies
-- ----------------------------
ALTER TABLE "public"."ticket_replies" ADD CONSTRAINT "ticket_replies_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."ticket_replies" ADD CONSTRAINT "ticket_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table user_devices
-- ----------------------------
ALTER TABLE "public"."user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
