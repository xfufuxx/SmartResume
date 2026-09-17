# -*- coding: utf-8 -*-
"""生成「智能简历」项目的演示测试数据 SQL。

用途
----
产出一份可重复导入的 SQL（演示测试数据.sql）以及配套的清理 SQL
（演示测试数据-清理.sql）。数据全部挂在一个独立的演示账号下，
不污染现有真实账号，随时可整账号删除。

运行
----
    backend/.venv/Scripts/python.exe scripts/gen_demo_seed.py

说明
----
- 所有 id 由固定随机种子生成，重复运行结果稳定。
- 时间戳用 now() - interval 'N day'，导入后总是「最近一个月内」，
  首页趋势图 / 「超 14 天未优化」等逻辑都能被触发。
- JSONB 字段由 json.dumps 生成，单引号已转义，可直接被 psql 执行。
"""
import json
import random
import uuid

SEED = 20260916
random.seed(SEED)

OUT_SEED = "演示测试数据.sql"
OUT_CLEAN = "演示测试数据-清理.sql"

DEMO_EMAIL = "demo@smart-resume.com"
DEMO_PASSWORD = "Demo@123456"
# passlib bcrypt.hash('Demo@123456') 的结果（后端 security.hash_password 同款方案）
DEMO_PASSWORD_HASH = "$2b$12$PmptK.pdUMAZfsz/mb5a4OvwhqkKDRFjmVzeqUn13GKRBktZ8zuGi"


# ──────────────────────────── 基础工具 ────────────────────────────
def uid() -> str:
    return str(uuid.UUID(int=random.getrandbits(128), version=4))


class Raw(str):
    """原样拼进 SQL 的片段（例如 now() - interval '3 day'）。"""


def js(v) -> str:
    if isinstance(v, Raw):
        return str(v)
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'"
    return "'" + str(v).replace("'", "''") + "'"


def days(n: int) -> Raw:
    return Raw("(now() - interval '%d day')" % n)


def hours(n: int) -> Raw:
    return Raw("(now() - interval '%d hour')" % n)


def insert(table: str, cols, rows) -> str:
    head = 'INSERT INTO "public"."%s" (%s) VALUES' % (table, ", ".join('"%s"' % c for c in cols))
    body = ",\n".join(
        "(" + ", ".join(js(x) for x in r) + ")" for r in rows
    )
    return head + "\n" + body + ";"


blocks = []


def add(title: str, sql: str):
    blocks.append("-- ---------- %s ----------\n%s" % (title, sql))


# ──────────────────────────── 实体 id ────────────────────────────
UID = uid()
R1, R2, R3, R4, R5 = (uid() for _ in range(5))          # 简历
J1, J2, J3, J4, J5 = (uid() for _ in range(5))          # 岗位
O1, O2, O3, O4, O5, O6, O7 = (uid() for _ in range(7))  # 优化记录
IS1, IS2 = uid(), uid()                                  # 面试会话
BATCH1, BATCH2 = uid(), uid()                            # 批量优化
TICKET1, TICKET2 = uid(), uid()                          # 工单
ADMIN_ID = "f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e"        # 已有管理员（public.sql 中已存在）

# ──────────────────────────── 1. 用户 ────────────────────────────
saved_resume_text = (
    "【个人信息】\n姓名：张伟\n邮箱：zhangwei.demo@example.com\n电话：138-1234-5678\n\n"
    "【个人简介】\n6 年 Java 后端开发经验，主导过高并发交易与监控平台的架构设计与落地，"
    "熟悉分布式、微服务与容器化部署。\n\n"
    "【工作经历】\n1. 某互联网科技有限公司 - 高级后端开发工程师（2021.03 - 至今）\n"
    "2. 某软件股份有限公司 - Java 开发工程师（2019.07 - 2021.02）\n\n"
    "【教育背景】\n南京邮电大学 - 计算机科学与技术 - 本科（2015.09 - 2019.06）\n\n"
    "【技能】\nJava、Spring Boot、Spring Cloud Alibaba、MyBatis、MySQL、Oracle、Redis、Kafka、Docker、Kubernetes、Linux"
)
saved_job_text = (
    "【岗位信息】\n岗位：java 高级后端开发工程师\n薪资：25-40K\n地点：北京\n\n"
    "【必备要求】\n- Java\n- Spring Boot\n- 微服务开发\n- MySQL / Oracle\n- 5 年及以上后端研发经验\n\n"
    "【岗位职责】\n- 负责核心交易链路的后端设计与开发；\n- 负责接口性能优化与线上问题排查。"
)

user_cols = [
    "id", "email", "phone", "password_hash", "nickname", "avatar_url", "is_verified",
    "career_state", "expectation", "saved_texts", "privacy_agreed", "status",
    "deleted_at", "created_at", "updated_at",
]
add("用户 users", insert("users", user_cols, [[
    UID, DEMO_EMAIL, None, DEMO_PASSWORD_HASH, "演示用户", None, True,
    "experienced",
    {"cities": ["北京", "上海", "杭州"], "job_title": "Java 高级后端开发工程师",
     "industries": ["互联网", "金融"], "salary_range": "25-40K"},
    {"resume_text": saved_resume_text, "job_text": saved_job_text},
    True, "active", None, days(45), days(1),
]]))

add("设备 user_devices", insert("user_devices", [
    "id", "user_id", "device_id", "device_name", "platform", "ip_address",
    "user_agent", "refresh_token_hash", "last_active", "is_revoked", "created_at",
], [
    [uid(), UID, "demo-web-device", "Chrome on Windows", "web", "127.0.0.1",
     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", None, hours(1), False, days(40)],
    [uid(), UID, "demo-ios-device", "iPhone 15", "ios", "10.0.0.8",
     "SmartResume/1.0 (iOS 17)", None, days(6), True, days(30)],
]))

# ──────────────────────────── 2. 简历 ────────────────────────────
r1_json = {
    "personal_info": {"name": "张伟", "email": "zhangwei.demo@example.com", "phone": "138-1234-5678"},
    "summary": "6 年 Java 后端开发经验，主导过高并发交易与监控平台的架构设计与落地，熟悉分布式、微服务与容器化部署。",
    "experience": [
        {"company": "某互联网科技有限公司", "title": "高级后端开发工程师", "start": "2021.03", "end": "至今",
         "points": [
             "主导核心交易链路重构，QPS 从 3k 提升到 12k，平均响应时间下降 45%。",
             "设计基于 Spring Cloud Alibaba 的微服务体系，落地服务注册、配置中心与灰度发布。",
             "推动 MySQL 慢查询治理与分库分表，慢 SQL 数量下降 80%。",
         ]},
        {"company": "某软件股份有限公司", "title": "Java 开发工程师", "start": "2019.07", "end": "2021.02",
         "points": [
             "负责 MES 系统后端模块开发，支撑 8 条产线的生产数据采集。",
             "编写接口文档与单元测试，模块缺陷率低于 1%。",
         ]},
    ],
    "education": [
        {"school": "南京邮电大学", "major": "计算机科学与技术", "degree": "本科", "start": "2015.09", "end": "2019.06"},
    ],
    "skills": ["Java", "Spring Boot", "Spring Cloud Alibaba", "MyBatis", "MySQL", "Oracle",
               "Redis", "Kafka", "Docker", "Kubernetes", "Linux", "微服务"],
    "projects": [
        {"name": "全域直流管控平台", "role": "后端负责人", "start": "2022.03", "end": "2023.08",
         "points": ["负责后端代码编写、自测与性能优化，支撑日均 200 万条监测数据处理。",
                    "设计接口服务与数据库模型，输出接口文档与软件设计文档。"]},
    ],
}
r2_json = {
    "personal_info": {"name": "李娜", "email": "lina.demo@example.com", "phone": "139-2222-3333"},
    "summary": "4 年前端开发经验，擅长 React / Vue 技术栈与前端工程化，关注性能与可访问性。",
    "experience": [
        {"company": "某科技有限责任公司", "title": "前端开发工程师", "start": "2022.05", "end": "至今",
         "points": [
             "负责中后台体系前端架构，沉淀 40+ 业务组件，页面开发效率提升 35%。",
             "完成首屏性能优化，LCP 从 3.2s 降到 1.4s。",
         ]},
        {"company": "某信息技术有限公司", "title": "前端开发", "start": "2020.07", "end": "2022.04",
         "points": ["使用 Vue2 完成 10+ 活动页与小程序页面开发。"],
         },
    ],
    "education": [
        {"school": "成都信息工程大学", "major": "软件工程", "degree": "本科", "start": "2016.09", "end": "2020.06"},
    ],
    "skills": ["JavaScript", "TypeScript", "React", "Vue3", "Next.js", "Webpack", "Vite", "Node.js", "ECharts", "CSS3"],
    "projects": [
        {"name": "可视化运营看板", "role": "前端负责人", "start": "2023.01", "end": "2023.10",
         "points": ["基于 ECharts 实现多维度经营看板，支撑 20+ 指标实时刷新。"]},
    ],
}
r3_json = {
    "personal_info": {"name": "王强", "email": "wangqiang.demo@example.com", "phone": "137-8888-9999"},
    "summary": "5 年互联网产品经理经验，擅长需求分析、数据驱动与跨团队协作，主导过 0-1 产品线。",
    "experience": [
        {"company": "某网络科技有限公司", "title": "高级产品经理", "start": "2021.08", "end": "至今",
         "points": [
             "负责 SaaS 产品从 0 到 1，上线 6 个月付费转化率 4.2%。",
             "搭建用户反馈闭环，需求交付周期缩短 30%。",
         ]},
        {"company": "某电子商务有限公司", "title": "产品经理", "start": "2019.09", "end": "2021.07",
         "points": ["负责营销活动产品，双十一活动 GMV 同比提升 55%。"]},
    ],
    "education": [
        {"school": "武汉大学", "major": "信息管理与信息系统", "degree": "本科", "start": "2015.09", "end": "2019.06"},
    ],
    "skills": ["需求分析", "原型设计", "Axure", "SQL", "数据分析", "项目管理", "用户研究", "PRD 撰写"],
    "projects": [
        {"name": "会员增长体系", "role": "产品负责人", "start": "2022.06", "end": "2023.03",
         "points": ["设计会员分层与权益体系，会员复购率提升 18%。"]},
    ],
}
# R4 故意留空 parsed_json —— 用于验证「未解析 / 解析中」空状态与首页告警
r4_json = None
# R5 为软删除简历 —— 用于「回收站」
r5_json = {
    "personal_info": {"name": "赵敏", "email": "zhaomin.demo@example.com", "phone": "135-6666-7777"},
    "summary": "3 年测试开发经验。",
    "experience": [], "education": [], "skills": ["Python", "Pytest", "Selenium"], "projects": [],
}

resume_cols = [
    "id", "user_id", "title", "original_file_url", "file_type", "parsed_json", "raw_text",
    "is_primary", "deleted_at", "created_at", "target_position", "target_company",
    "version", "status", "match_rate", "score", "is_favorite", "thumbnail_url", "updated_at",
]
add("简历 resumes", insert("resumes", resume_cols, [
    [R1, UID, "张伟-Java后端开发（6年）", "uploads/resumes/demo/zhangwei.pdf", "pdf", r1_json,
     saved_resume_text, True, None, days(20), "Java 高级后端开发工程师", "某互联网科技有限公司",
     3, "optimized", 88, 91, True, None, days(2)],
    [R2, UID, "李娜-前端工程师（4年）", "uploads/resumes/demo/lina.pdf", "pdf", r2_json,
     "李娜 前端开发工程师 4 年经验 ……", False, None, days(15), "前端开发工程师", "某科技有限责任公司",
     2, "optimized", 76, 80, False, None, days(5)],
    [R3, UID, "王强-高级产品经理（5年）", "uploads/resumes/demo/wangqiang.docx", "docx", r3_json,
     "王强 高级产品经理 5 年经验 ……", False, None, days(9), "高级产品经理", "某网络科技有限公司",
     1, "optimized", 64, 72, False, None, days(4)],
    # 未解析：parsed_json 为空，用于验证首页「N 份简历尚未解析完成」与详情页空状态
    [R4, UID, "陈静-数据分析师（待解析）", "uploads/resumes/demo/chenjing.pdf", "pdf", r4_json,
     "", False, None, days(3), None, None, 1, "draft", None, None, False, None, days(3)],
    # 已删除：进回收站
    [R5, UID, "赵敏-测试开发（旧版）", "uploads/resumes/demo/zhaomin.pdf", "pdf", r5_json,
     "赵敏 测试开发 3 年经验 ……", False, days(6), days(25), None, None,
     1, "draft", None, None, False, None, days(6)],
]))

# ──────────────────────────── 3. 岗位 ────────────────────────────
j1_json = {
    "title": "java高级后端开发工程师", "company": "某互联网科技有限公司", "industry": "互联网",
    "location": "北京", "salary_range": "25-40K",
    "must_have": {"skills": ["Java", "Spring Boot", "Spring Cloud Alibaba", "MyBatis", "MySQL", "Oracle",
                             "微服务开发", "Linux系统"],
                  "experience": "5年及以上后端研发经验", "education": "计算机相关专业本科及以上学历"},
    "soft_skills": ["沟通能力", "团队协作"],
    "nice_to_have": {"skills": ["Kafka", "Kubernetes"], "qualifications": ["有电网数字化项目开发经验优先"]},
    "responsibilities": ["负责核心交易链路后端代码编写、自测、性能优化等工作；",
                         "负责业务需求理解，并合理化设计接口服务及数据库；",
                         "配合项目经理进行版本发布工作。"],
    "original_text": "java高级后端开发工程师 25-40K 北京 5-10年 本科 ……",
}
j2_json = {
    "title": "前端开发工程师", "company": "某科技有限责任公司", "industry": "互联网",
    "location": "成都", "salary_range": "18-28K",
    "must_have": {"skills": ["JavaScript", "TypeScript", "React", "Vue3", "Webpack", "CSS3"],
                  "experience": "3年及以上前端开发经验", "education": "本科及以上学历"},
    "soft_skills": ["沟通能力"],
    "nice_to_have": {"skills": ["Next.js", "Node.js"], "qualifications": ["有中后台系统经验优先"]},
    "responsibilities": ["负责中后台系统前端开发与组件沉淀；", "负责前端性能优化与体验提升。"],
    "original_text": "前端开发工程师 18-28K 成都 3-5年 本科 ……",
}
j3_json = {
    "title": "高级产品经理", "company": "某网络科技有限公司", "industry": "互联网",
    "location": "上海", "salary_range": "25-40K",
    "must_have": {"skills": ["需求分析", "原型设计", "数据分析", "项目管理"],
                  "experience": "5年及以上产品经验", "education": "本科及以上学历"},
    "soft_skills": ["沟通能力", "抗压能力"],
    "nice_to_have": {"skills": ["SQL", "Axure"], "qualifications": ["有 SaaS 产品经验优先"]},
    "responsibilities": ["负责产品规划与需求落地；", "负责数据分析与效果复盘。"],
    "original_text": "高级产品经理 25-40K 上海 5-10年 本科 ……",
}
j4_json = {
    "title": "数据分析师", "company": "某金融科技有限公司", "industry": "金融",
    "location": "杭州", "salary_range": "20-30K",
    "must_have": {"skills": ["SQL", "Python", "Excel", "数据分析", "报表搭建"],
                  "experience": "3年及以上数据分析经验", "education": "本科及以上学历"},
    "soft_skills": ["商业敏感度"],
    "nice_to_have": {"skills": ["Tableau", "Power BI"], "qualifications": ["有金融风控分析经验优先"]},
    "responsibilities": ["负责经营指标体系搭建与日常数据分析；", "输出分析报告支撑业务决策。"],
    "original_text": "数据分析师 20-30K 杭州 3-5年 本科 ……",
}
j5_json = {
    "title": "测试开发工程师", "company": "某软件股份有限公司", "industry": "互联网",
    "location": "南京", "salary_range": "15-25K",
    "must_have": {"skills": ["Python", "Pytest", "Selenium", "接口测试"], "experience": "3年及以上", "education": "本科"},
    "soft_skills": [], "nice_to_have": {"skills": [], "qualifications": []},
    "responsibilities": ["负责自动化测试框架搭建。"], "original_text": "测试开发工程师 ……",
}

job_cols = [
    "id", "user_id", "image_url", "parsed_job_json", "ocr_text", "created_at",
    "title", "company", "category", "is_primary", "is_favorite", "user_remark", "deleted_at",
]
add("岗位 job_images", insert("job_images", job_cols, [
    [J1, UID, "uploads/job-images/demo/java.png", j1_json, None, days(18),
     "java高级后端开发工程师", "某互联网科技有限公司", "开发", True, True, "目标岗位，已重点优化", None],
    [J2, UID, "uploads/job-images/demo/fe.png", j2_json, None, days(14),
     "前端开发工程师", "某科技有限责任公司", "开发", False, False, None, None],
    [J3, UID, "uploads/job-images/demo/pm.png", j3_json, None, days(8),
     "高级产品经理", "某网络科技有限公司", "产品", False, False, None, None],
    [J4, UID, "uploads/job-images/demo/da.png", j4_json, None, days(5),
     "数据分析师", "某金融科技有限公司", "其他", False, False, None, None],
    [J5, UID, "uploads/job-images/demo/qa.png", j5_json, None, days(22),
     "测试开发工程师", "某软件股份有限公司", "开发", False, False, None, days(7)],
]))


# ──────────────────────────── 4. 优化记录 ────────────────────────────
def opt_json(base: dict, extra_skills, summary: str):
    d = json.loads(json.dumps(base, ensure_ascii=False))
    d["skills"] = list(dict.fromkeys(extra_skills + d.get("skills", [])))
    d["summary"] = summary
    return d


o1_opt = opt_json(r1_json, ["Spring Cloud Alibaba", "Kubernetes", "Kafka"],
                  "6 年 Java 后端开发经验，主导高并发交易与监测平台的架构设计与落地；"
                  "熟悉 Spring Cloud Alibaba 微服务体系、MySQL 分库分表与容器化部署，"
                  "对电网数字化项目有实际交付经验。")
o2_opt = opt_json(r2_json, ["Next.js", "Node.js"],
                  "4 年前端开发经验，精通 TypeScript 与 React/Vue3 技术栈，"
                  "具备中后台体系架构与前端工程化能力，主导过多维度可视化看板。")
o3_opt = opt_json(r3_json, ["SaaS", "增长", "A/B 测试"],
                  "5 年互联网产品经理经验，主导 SaaS 产品 0-1 与会员增长体系，"
                  "擅长需求分析、数据驱动决策与跨团队协作。")
o4_opt = opt_json(r1_json, ["SQL", "Python", "Tableau"],
                  "6 年 Java 后端开发经验，具备扎实的数据处理与指标体系搭建能力，"
                  "熟悉 SQL、Python 数据分析与报表可视化。")
o5_opt = opt_json(r1_json, ["Docker", "Kubernetes", "服务治理", "灰度发布"],
                  "6 年 Java 后端开发经验，深度参与微服务治理与云原生改造，"
                  "主导过服务注册、配置中心与灰度发布体系建设。")
o7_opt = opt_json(r2_json, ["Spring Boot"],
                  "4 年前端开发经验，正在向全栈方向发展。")

opt_cols = [
    "id", "user_id", "resume_id", "job_image_id", "original_json", "optimized_json",
    "match_score", "pdf_url", "changes_description", "custom_instructions", "job_title",
    "company", "category", "thumbnail_url", "is_favorite", "satisfaction_score",
    "feedback_text", "parent_record_id", "refine_count", "deleted_at", "status", "created_at",
]
add("优化记录 optimized_resumes", insert("optimized_resumes", opt_cols, [
    [O1, UID, R1, J1, r1_json, o1_opt, 88,
     "uploads/optimized/demo/o1.pdf",
     "1. 将「校园推广」类经历改写为后端研发项目描述；\n2. 补充 Spring Cloud Alibaba、Kubernetes 等岗位关键词；\n3. 用量化数据强化成果（QPS、响应时间、慢 SQL 下降比例）。",
     "目标职位：Java 高级后端开发工程师", "java高级后端开发工程师", "某互联网科技有限公司",
     "开发", None, True, 5, "关键词覆盖很到位，面试邀约明显变多。", None, 0, None, "completed", days(16)],

    [O2, UID, R2, J2, r2_json, o2_opt, 76,
     "uploads/optimized/demo/o2.pdf",
     "1. 突出中后台体系与组件沉淀经验；\n2. 补充 Next.js、Node.js 等加分技能；\n3. 首屏性能优化成果量化。",
     None, "前端开发工程师", "某科技有限责任公司",
     "开发", None, False, 4, "整体不错，希望再突出可视化经验。", None, 0, None, "completed", days(12)],

    # 低分记录：用于验证首页「匹配度低于 70 → 去优化」的待办建议
    [O3, UID, R3, J3, r3_json, o3_opt, 64,
     None,
     "1. 补充 SaaS 增长与 A/B 测试相关关键词；\n2. 结果指标需再具体（转化率、复购率）。\n提示：当前匹配度偏低，建议补充岗位要求的量化成果。",
     None, "高级产品经理", "某网络科技有限公司",
     "产品", None, False, None, None, None, 0, None, "completed", days(6)],

    [O4, UID, R1, J4, r1_json, o4_opt, 81,
     "uploads/optimized/demo/o4.pdf",
     "1. 从后端经历中提炼数据相关能力；\n2. 补充 SQL / Python / Tableau 关键词。",
     "重点体现关键词：SQL、Python、数据分析", "数据分析师", "某金融科技有限公司",
     "其他", None, False, 3, "跨岗位转型的包装思路有帮助。", None, 0, None, "completed", days(3)],

    # 精修链：O5 是 O1 的子版本（parent_record_id 指向 O1）
    [O5, UID, R1, J1, r1_json, o5_opt, 92,
     "uploads/optimized/demo/o5.pdf",
     "基于上一版继续精修：\n1. 强化微服务治理与云原生改造描述；\n2. 补充灰度发布与配置中心实践细节。",
     "在第一版基础上强化微服务治理", "java高级后端开发工程师", "某互联网科技有限公司",
     "开发", None, False, None, None, O1, 1, None, "completed", days(1)],

    [O7, UID, R2, J1, r2_json, o7_opt, 58,
     None,
     "跨岗位匹配度较低：建议优先补充 Java / Spring Boot 后端技术栈后再尝试。",
     None, "java高级后端开发工程师", "某互联网科技有限公司",
     "开发", None, False, None, None, None, 0, None, "completed", days(4)],

    # 软删除记录：进回收站
    [O6, UID, R3, J3, r3_json, o3_opt, 70, None,
     "早期版本，已被新版替代。", None, "高级产品经理", "某网络科技有限公司",
     "产品", None, False, None, None, None, 0, days(10), "completed", days(11)],
]))

# ──────────────────────────── 5. 消息 ────────────────────────────
add("消息 messages", insert("messages", [
    "id", "user_id", "msg_type", "title", "content", "ref_id", "is_read", "created_at",
], [
    [uid(), UID, "optimize", "简历优化完成", "「java高级后端开发工程师」优化完成，匹配度 88 分。", O1, True, days(16)],
    [uid(), UID, "optimize", "精修版本已生成", "您的精修版本已生成，匹配度提升至 92 分。", O5, False, hours(20)],
    [uid(), UID, "score", "简历评分结果", "《张伟-Java后端开发（6年）》综合评分 91 分。", R1, True, days(15)],
    [uid(), UID, "warning", "简历尚未解析完成", "《陈静-数据分析师（待解析）》解析失败，请重新上传文字版 PDF。", R4, False, days(3)],
    [uid(), UID, "job", "职位动态更新", "您关注的「java高级后端开发工程师」有新动态。", J1, False, hours(6)],
    [uid(), UID, "interview", "面试押题已生成", "为您生成了 8 道面试预测题，快去查看吧。", IS1, False, hours(2)],
    [uid(), UID, "system", "欢迎使用智能简历", "欢迎使用智能简历系统，开始优化您的第一份简历吧。", None, True, days(45)],
    [uid(), UID, "vip", "会员即将到期", "您的月度会员将在 3 天后到期。", None, False, hours(30)],
]))

# ──────────────────────────── 6. 面试押题 ────────────────────────────
questions_is1 = [
    ("技术能力", "中等", "请介绍 Spring Cloud Alibaba 中 Nacos 作为注册中心和配置中心的工作原理。",
     "考察对微服务基础设施的理解深度，是否只是会用。",
     ["Nacos 同时承担服务注册发现与配置管理", "客户端通过心跳上报健康状态", "配置变更通过长轮询/推送生效", "与 Eureka/Config 的差异"],
     "Nacos 的注册中心基于心跳与临时实例模型……（参考回答要点完整展开）"),
    ("项目深挖", "困难", "你提到交易链路 QPS 从 3k 提升到 12k，具体做了哪些优化？",
     "考察性能优化是否真实落地、数据是否经得起追问。",
     ["瓶颈定位手段（监控/火焰图/慢日志）", "缓存与异步化改造", "数据库分库分表与索引优化", "压测与容量评估"],
     "首先通过 APM 与火焰图定位到数据库连接池与热点行锁瓶颈……"),
    ("技术能力", "困难", "MySQL 分库分表后，如何解决跨库分页与全局唯一 ID 问题？",
     "考察分库分表方案的真实性与细节掌握。",
     ["ShardingSphere 等中间件", "雪花算法生成全局 ID", "跨库分页的归并排序与深分页限制", "一致性哈希与扩容"],
     "全局唯一 ID 使用雪花算法，分片键选择 user_id……"),
    ("项目深挖", "中等", "全域直流管控平台中，日均 200 万条监测数据是如何存储和查询的？",
     "考察大数据量场景下的存储选型与查询优化。",
     ["时序/宽表存储选型", "冷热数据分离", "预聚合与物化视图", "查询性能保障"],
     "监测数据按时序表存储，冷数据归档至对象存储……"),
    ("行为面试", "中等", "讲一次你和产品/前端就需求实现产生分歧并最终推进的经历。",
     "考察沟通协作与推动能力。",
     ["冲突背景与双方立场", "如何用数据/成本论证", "最终方案与结果", "复盘与改进"],
     "在一个灰度发布需求上，前端希望……"),
    ("行为面试", "简单", "你平时是如何保持技术学习的？最近在学习什么？",
     "考察学习习惯与技术热情。",
     ["学习渠道与节奏", "是否有输出（博客/开源）", "最近学习内容与产出", "如何应用到工作"],
     "我通常通过官方文档与源码学习，最近在深入 K8s 的 Operator 开发……"),
    ("职业规划", "简单", "未来 2-3 年你的职业规划是什么？",
     "考察稳定性与目标感。",
     ["短期目标（技术纵深）", "中期目标（架构/技术负责人）", "与岗位的匹配度", "期望公司提供的支持"],
     "短期希望在后端架构方向继续深耕，中期希望成长为技术负责人……"),
    ("岗位匹配", "中等", "你有电网数字化相关项目经验吗？如何看待这个行业的业务复杂度？",
     "考察与岗位 JD 的匹配度（JD 明确「有电网数字化项目经验优先」）。",
     ["是否有相关经验（诚实回答）", "对行业业务复杂度的理解", "快速学习与迁移能力", "入职后的补齐计划"],
     "我有 MES 与监测平台经验，业务复杂度与电网类似……"),
]
q_rows_is1 = [[uid(), IS1, UID, i, c, d, q, intent, outline, ans, (i in (0, 2)), None, hours(2)]
              for i, (c, d, q, intent, outline, ans) in enumerate(questions_is1)]
add("面试会话 interview_sessions", insert("interview_sessions", [
    "id", "user_id", "resume_id", "job_image_id", "job_title", "company", "status",
    "error_message", "overall_advice", "question_count", "created_at",
], [
    [IS1, UID, R1, J1, "java高级后端开发工程师", "某互联网科技有限公司", "completed", None,
     "整体技术基础扎实，项目数据经得起追问。建议重点准备「分库分表」「微服务治理」两个深水区，"
     "并把电网行业背景与 MES 经验做迁移式表述。回答时多用量化结果开场。", 8, hours(2)],
    # 进行中/空的会话：用于验证「生成中」状态与 question_count=0 的空列表
    [IS2, UID, R2, J2, "前端开发工程师", "某科技有限责任公司", "processing", None, None, 0, hours(1)],
]))
add("面试题目 interview_questions", insert("interview_questions", [
    "id", "session_id", "user_id", "order_index", "category", "difficulty", "question",
    "intent", "answer_outline", "sample_answer", "is_bookmarked", "note", "created_at",
], q_rows_is1))

# ──────────────────────────── 7. 反馈 / 批量 / 配额 / 订单 / 工单 ────────────────────────────
add("优化反馈 feedbacks", insert("feedbacks", [
    "id", "user_id", "optimization_record_id", "outcome", "created_at",
], [
    [uid(), UID, O1, "satisfied", days(16)],
    [uid(), UID, O2, "needs_improvement", days(12)],
    [uid(), UID, O5, "satisfied", hours(18)],
]))

add("批量优化 batch_optimizations", insert("batch_optimizations", [
    "id", "user_id", "source_resume_id", "status", "total_jobs", "completed_jobs",
    "created_at", "completed_at",
], [
    [BATCH1, UID, R1, "completed", 2, 2, days(16), days(16)],
    [BATCH2, UID, R1, "pending", 3, 0, hours(3), None],
]))
add("批量任务 batch_job_tasks", insert("batch_job_tasks", [
    "id", "batch_id", "job_image_id", "optimization_record_id", "status", "error_message", "created_at",
], [
    [uid(), BATCH1, J1, O1, "completed", None, days(16)],
    [uid(), BATCH1, J4, O4, "completed", None, days(16)],
    [uid(), BATCH2, J2, None, "pending", None, hours(3)],
    [uid(), BATCH2, J3, None, "failed", "岗位解析失败：图片清晰度过低", hours(3)],
]))

add("用量配额 user_quotas", insert("user_quotas", [
    "id", "user_id", "daily_limit", "monthly_limit", "daily_used", "monthly_used",
    "last_reset_date", "is_paid", "created_at", "updated_at",
], [
    [uid(), UID, 5, 300, 2, 37, days(0), True, days(45), hours(2)],
]))

add("订单 orders", insert("orders", [
    "id", "user_id", "order_no", "package_type", "package_name", "amount", "payment_method",
    "status", "refund_reason", "refunded_by", "paid_at", "refunded_at", "created_at",
], [
    [uid(), UID, "DEMO20260901001", "yearly", "年度会员", 299.00, "alipay", "paid",
     None, None, days(35), None, days(35)],
    [uid(), UID, "DEMO20260910002", "package", "简历优化次卡 50 次", 99.00, "wechat", "completed",
     None, None, days(20), None, days(20)],
    # 待支付订单：用于验证未支付态展示
    [uid(), UID, "DEMO20260916003", "monthly", "月度会员", 29.90, None, "pending",
     None, None, None, None, hours(30)],
]))

add("工单 support_tickets", insert("support_tickets", [
    "id", "user_id", "category", "priority", "subject", "content", "attachments",
    "status", "assigned_to", "resolution", "created_at", "closed_at",
], [
    [TICKET1, UID, "功能咨询", "medium", "优化后的 PDF 在哪里下载？",
     "请问优化完成后如何下载 PDF 文件？", None, "open", None, None, hours(6), None],
    [TICKET2, UID, "故障反馈", "high", "导出的 PDF 出现空白页",
     "使用「深色科技」模板导出时，第二页整页空白。", {"files": ["uploads/tickets/demo/blank-page.png"]},
     "processing", ADMIN_ID, None, days(2), None],
]))
add("工单回复 ticket_replies", insert("ticket_replies", [
    "id", "ticket_id", "admin_id", "user_id", "content", "is_internal", "created_at",
], [
    [uid(), TICKET2, ADMIN_ID, None, "已定位问题，正在修复中，预计今天内给出结论。", False, hours(12)],
    [uid(), TICKET2, ADMIN_ID, None, "内部备注：疑似分页高度计算错误导致。", True, hours(11)],
    [uid(), TICKET1, None, UID, "我的问题已自行解决，谢谢。", False, hours(4)],
]))

# ──────────────────────────── 8. 审计 / AI 日志 ────────────────────────────
add("审计日志 audit_logs", insert("audit_logs", [
    "id", "user_id", "action", "target_type", "target_id", "detail", "ip_address", "user_agent", "created_at",
], [
    [uid(), UID, "upload_resume", "resume", R1, "上传简历", "127.0.0.1", "Mozilla/5.0", days(20)],
    [uid(), UID, "create_optimization", "optimized_resume", O1, "发起简历优化", "127.0.0.1", "Mozilla/5.0", days(16)],
    [uid(), UID, "generate_interview", "interview_session", IS1, "生成面试押题", "127.0.0.1", "Mozilla/5.0", hours(2)],
    [uid(), UID, "delete_resume", "resume", R5, "删除简历（进回收站）", "127.0.0.1", "Mozilla/5.0", days(6)],
]))

add("AI 调用日志 ai_model_call_logs", insert("ai_model_call_logs", [
    "id", "user_id", "model_name", "prompt_template_name", "prompt_version", "input_tokens",
    "output_tokens", "latency_ms", "is_success", "error_message", "cost_usd", "created_at",
], [
    [uid(), UID, "qwen3.7-flash", "简历优化", 1, 2100, 2600, 3800, True, None, 0.0118, days(16)],
    [uid(), UID, "qwen3.7-flash", "简历评分", 1, 1400, 900, 2200, True, None, 0.0040, days(15)],
    [uid(), UID, "qwen3.7-flash", "面试押题", 1, 2600, 3400, 5200, True, None, 0.0151, hours(2)],
    # 失败调用：用于验证失败率/错误信息展示
    [uid(), UID, "qwen3.7-flash", "岗位解析", 2, 600, 0, 15000, False, "upstream timeout", 0.0, days(3)],
]))


# ──────────────────────────── 清理片段 ────────────────────────────
def delete_block() -> str:
    u = js(UID)
    return f"""-- 演示账号 id
--   {UID}
-- 按外键依赖逆序清理，可单独执行以彻底移除演示数据
DELETE FROM "public"."interview_questions" WHERE user_id = {u};
DELETE FROM "public"."interview_sessions"  WHERE user_id = {u};
DELETE FROM "public"."batch_job_tasks"
  WHERE batch_id IN (SELECT id FROM "public"."batch_optimizations" WHERE user_id = {u});
DELETE FROM "public"."batch_optimizations" WHERE user_id = {u};
DELETE FROM "public"."feedbacks"           WHERE user_id = {u};
DELETE FROM "public"."ticket_replies"
  WHERE ticket_id IN (SELECT id FROM "public"."support_tickets" WHERE user_id = {u});
DELETE FROM "public"."support_tickets"     WHERE user_id = {u};
UPDATE "public"."optimized_resumes" SET parent_record_id = NULL WHERE user_id = {u};
DELETE FROM "public"."optimized_resumes"   WHERE user_id = {u};
DELETE FROM "public"."messages"            WHERE user_id = {u};
DELETE FROM "public"."audit_logs"          WHERE user_id = {u};
DELETE FROM "public"."ai_model_call_logs"  WHERE user_id = {u};
DELETE FROM "public"."user_quotas"         WHERE user_id = {u};
DELETE FROM "public"."orders"              WHERE user_id = {u};
DELETE FROM "public"."user_devices"        WHERE user_id = {u};
DELETE FROM "public"."resumes"             WHERE user_id = {u};
DELETE FROM "public"."job_images"          WHERE user_id = {u};
DELETE FROM "public"."users"               WHERE id = {u};"""


HEADER = """-- =============================================================
-- 智能简历 · 演示测试数据（可重复导入 / 可一键清除）
-- -------------------------------------------------------------
-- 演示账号：{email}
-- 登录密码：{pwd}
-- 账号 id ：{uid}
--
-- 特点：
--   1. 全部数据挂在独立演示账号下，不影响现有真实账号；
--   2. 脚本开头会先清空该账号的旧数据，因此可反复执行（幂等）；
--   3. 覆盖：简历 / 岗位 / 优化记录 / 面试押题 / 消息 / 行为日志 /
--      配额 / 订单 / 工单 / 批量优化 / 回收站（软删除）等；
--   4. 刻意包含若干「边界样本」，便于直观复现问题：
--        - 1 份未解析简历（parsed_json 为空）
--        - 1 条 64 分、1 条 58 分的低匹配优化记录（触发首页告警）
--        - 1 条 status=failed 的批量任务
--        - 1 个 status=processing 且题目数为 0 的面试会话
--        - 1 条调用失败（upstream timeout）的 AI 日志
--        - 若干软删除的简历 / 岗位 / 优化记录（回收站）
--
-- 导入方式（任选其一）：
--   psql -U postgres -d smart_resume -1 -f "演示测试数据.sql"
--   或在数据库客户端里整段执行。
--
-- 清除方式：执行「演示测试数据-清理.sql」，或删除演示账号：
--   DELETE FROM users WHERE id = '{uid}';  -- 注意外键，建议用清理脚本
-- =============================================================

BEGIN;

{clean}

"""
FOOTER = """

COMMIT;

-- =============================================================
-- 导入后校验（可选）：
--   SELECT count(*) FROM resumes            WHERE user_id = '{uid}';
--   SELECT count(*) FROM optimized_resumes  WHERE user_id = '{uid}';
--   SELECT count(*) FROM interview_questions WHERE user_id = '{uid}';
-- =============================================================
"""

seed_sql = HEADER.format(email=DEMO_EMAIL, pwd=DEMO_PASSWORD, uid=UID, clean=delete_block())
seed_sql += "\n\n".join(blocks)
seed_sql += FOOTER.format(uid=UID)

clean_sql = """-- =============================================================
-- 智能简历 · 清除演示测试数据
-- 说明：仅删除演示账号（{uid}）名下的数据，不影响其他账号。
-- =============================================================

BEGIN;

{clean}

COMMIT;
""".format(uid=UID, clean=delete_block())

with open(OUT_SEED, "w", encoding="utf-8") as f:
    f.write(seed_sql)
with open(OUT_CLEAN, "w", encoding="utf-8") as f:
    f.write(clean_sql)

print("已生成: %s (%d 字符)" % (OUT_SEED, len(seed_sql)))
print("已生成: %s (%d 字符)" % (OUT_CLEAN, len(clean_sql)))
print("演示账号: %s / %s" % (DEMO_EMAIL, DEMO_PASSWORD))
print("演示账号 id: %s" % UID)
