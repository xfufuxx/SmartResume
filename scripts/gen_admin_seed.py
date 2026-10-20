# -*- coding: utf-8 -*-
"""生成「管理后台」专用测试数据 SQL。

用途
----
为管理后台（/admin）的各个功能模块提供真实、合理的测试数据，覆盖：
- 用户管理：多状态用户（正常/封禁）、求职状态、VIP/免费、简历与优化计数、日额度
- 数据大屏：近 30 天优化记录（匹配分/满意度趋势）、岗位趋势、行业分布、DAU、付费转化
- 内容管理：12 套简历模板、48 个行业关键词、8 条 ATS 规则
- AI 模型管理：3 个 Prompt（各 2 个版本）、模型调用日志（成功/失败、token、耗时、费用）
- 任务监控：今日调用统计、失败原因、模型健康度
- 工单反馈：8 张工单（各状态/优先级/分类）+ 回复记录、用户满意度评价
- 财务管理：订单（成功/待支付/已退款）、套餐、每日营收
- 审计日志：20 条管理员操作记录

设计约定（与 gen_demo_seed.py 一致）
----------------------------------
- 所有 id 由固定随机种子生成，重复运行结果稳定，清理 SQL 按 id 精确删除。
- 时间戳用 now() - interval 'N day'，导入后数据总是分布在「最近 30 天」内，
  首页趋势图、任务监控（今日）、营收趋势等都能被真实触发。
- 账号：admin.demo1@smart-resume.com ~ admin.demo8@smart-resume.com，密码统一 Demo@123456。
- JSONB 由 json.dumps 生成，单引号已转义，可被 psql 直接执行。
- 整个文件自带 BEGIN/COMMIT，任一步失败整体回滚。

运行
----
    backend/.venv/Scripts/python.exe scripts/gen_admin_seed.py
    backend/.venv/Scripts/python.exe scripts/apply_seed.py 管理后台测试数据.sql
    backend/.venv/Scripts/python.exe scripts/apply_seed.py 管理后台测试数据-清理.sql
"""
import datetime
import json
import random
import uuid

SEED = 20261019
random.seed(SEED)

OUT_SEED = "管理后台测试数据.sql"
OUT_CLEAN = "管理后台测试数据-清理.sql"
# ASCII 名副本（同上：规避 tar/中文文件名编码坑）
OUT_SEED_ASCII = "admin_seed.sql"
OUT_CLEAN_ASCII = "admin_seed_cleanup.sql"


def days_str_hint() -> str:
    """订单号里的日期片段（本地生成时固定为今天，避免依赖数据库时区）。"""
    return datetime.date.today().strftime("%Y%m%d")

DEMO_PASSWORD_HASH = "$2b$12$PmptK.pdUMAZfsz/mb5a4OvwhqkKDRFjmVzeqUn13GKRBktZ8zuGi"  # Demo@123456
ADMIN_ID = "f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e"  # superadmin（与 public.sql / 历史部署一致）
ADMIN_HASH = "$2b$12$i8bfWcMmFH5X1P3QAZmfle8qR0toc6rRBTGd/gtFSYINVyacqU5re"      # admin123


class Raw(str):
    """原样拼进 SQL 的片段（例如 now() - interval '3 day'）。"""


ADMIN_SUBQUERY = Raw("(SELECT id FROM admins WHERE username = 'superadmin')")

MODELS = ["qwen3.8-max", "qwen3.7-flash", "qwen3.7-max"]
PROMPT_NAMES = ["工作经历优化", "个人总结优化", "项目经验优化"]
PROMPT_SCENES = {"工作经历优化": "work_experience", "个人总结优化": "summary", "项目经验优化": "project"}
SCENE_LABELS_CN = {"工作经历优化": "工作经历", "个人总结优化": "个人总结", "项目经验优化": "项目经验"}

TEMPLATES = [
    ("简约蓝", "经典单栏布局，适合互联网/国企投递"),
    ("商务灰", "双栏结构，突出项目与技能，适合外企"),
    ("科技黑", "深色主题单栏，适合研发/算法岗"),
    ("学术风", "重视教育与论文发表，适合科研/高校"),
    ("创意橙", "左右分栏+色块强调，适合设计/运营"),
    ("严谨律政", "衬线字体正式版式，适合法律/金融"),
    ("产品经理", "项目卡片式排版，突出需求与数据"),
    ("数据分析", "技能矩阵+指标高亮，适合数分/数仓"),
    ("市场投放", "增长案例前置，适合市场/增长岗"),
    ("人力资源", "模块齐全节奏平稳，适合 HR/行政"),
    ("应届生", "教育背景前置，适合在校/应届"),
    ("管理岗", "管理规模与业绩前置，适合主管/经理"),
]

KEYWORD_SEED = {
    "互联网": ["Python", "Go", "Java", "Spring Boot", "微服务", "Kubernetes", "Redis", "Kafka",
               "React", "TypeScript", "A/B 测试", "增长黑客", "SQL", "分布式系统"],
    "金融": ["风险管理", "量化分析", "估值建模", "CFA", "FRM", "Python", "Wind", "Bloomberg",
             "信贷审核", "投资组合", "财务报表分析", "合规"],
    "教育": ["课程设计", "教学管理", "学情分析", "教师资格证", "教研", "家校沟通", "课件制作"],
    "医疗健康": ["临床研究", "病历管理", "GCP", "执业医师资格", "医疗器械注册", "健康管理"],
    "制造业": ["工艺优化", "质量管理", "六西格玛", "AutoCAD", "PLC", "供应链管理", "精益生产"],
    "电子商务": ["店铺运营", "直通车", "直播带货", "用户分层", "GMV", "复购率", "选品"],
}
KEYWORD_CATEGORIES = ["hard_skill", "soft_skill", "tool", "certificate"]

ATS_RULES = [
    ("敏感信息-年龄", r"\b\d{2}\s*岁\b", "warning", "简历中暴露具体年龄可能引发歧视风险"),
    ("敏感信息-性别", r"\b(男|女)\b(?=\s*[|·,，])", "warning", "性别字段建议移除"),
    ("敏感信息-婚姻", r"(已婚|未婚|离异)", "warning", "婚姻状况属敏感信息"),
    ("联系方式缺失", r"^(?!.*(1[3-9]\d{9}|@)).*$", "error", "未检测到手机号或邮箱"),
    ("量化成果缺失", r"^(?!.*(\d+%|\d+万|\d+亿|\d+\+)).*$", "warning", "工作经历缺少量化成果"),
    ("错别字-的得地", r"(的的|地地|得得)", "info", "可能存在叠词错误"),
    ("超长段落", r"[^\n]{120,}", "warning", "单段超过 120 字，不利于 ATS 解析"),
    ("特殊符号", r"[★●◆■]", "info", "装饰符号可能影响 ATS 文本提取"),
]

ERROR_MESSAGES = [
    "RateLimitError: RPM limit exceeded",
    "ReadTimeout: upstream connect error or disconnect",
    "upstream 502 Bad Gateway",
    "context length exceeded",
    "content filter triggered",
]

USERS = [
    # (昵称, 求职状态, 目标职位, 行业, 城市, 薪资, 状态, VIP)
    ("林晓航", "experienced", "Java 高级后端工程师", ["互联网"], ["北京", "杭州"], "25-40K", "active", True),
    ("苏芮", "experienced", "产品经理", ["互联网", "电子商务"], ["上海"], "20-35K", "active", False),
    ("陈默", "career_change", "数据分析师", ["互联网", "金融"], ["深圳", "广州"], "18-30K", "active", False),
    ("赵一鸣", "student", "前端开发实习生", ["互联网"], ["北京"], "200-300/天", "active", False),
    ("何静怡", "fresh", "人力资源管理专员", ["教育", "制造业"], ["成都"], "8-13K", "active", False),
    ("罗启帆", "experienced", "量化研究员", ["金融"], ["上海", "北京"], "30-60K", "active", True),
    ("吴天宇", "experienced", "市场投放经理", ["电子商务"], ["杭州"], "20-35K", "frozen", False),
    ("郑凯文", "fresh", "临床研究员", ["医疗健康"], ["上海"], "10-18K", "active", False),
]

JOBS = [
    ("Java 高级后端开发工程师", "某互联网科技有限公司", "开发", "北京", "25-40K", ["Java", "Spring Boot", "微服务", "MySQL", "Redis"]),
    ("产品经理-支付方向", "某金融科技集团", "产品", "上海", "25-45K", ["支付清结算", "产品设计", "SQL", "项目管理"]),
    ("数据分析师", "某零售集团", "运营", "深圳", "18-30K", ["SQL", "Python", "用户分层", "BI 看板"]),
    ("前端开发工程师", "某智能硬件公司", "开发", "北京", "18-30K", ["React", "TypeScript", "Next.js", "工程化"]),
    ("HR 专员-招聘方向", "某教育科技公司", "职能", "成都", "8-13K", ["招聘交付", "员工关系", "社保公积金"]),
    ("量化研究员-CTA", "某私募基金", "研究", "上海", "30-60K", ["Python", "因子挖掘", "时序模型", "C++"]),
    ("市场投放经理", "某电商品牌", "市场", "杭州", "20-35K", ["信息流投放", "ROI 优化", "品牌营销"]),
    ("临床研究员(CRA)", "某CRO公司", "研究", "上海", "10-18K", ["GCP", "临床试验", "伦理递交"]),
    ("后端开发实习生", "某云计算公司", "开发", "北京", "200-300/天", ["Java", "数据结构", "Git"]),
    ("用户增长运营", "某内容社区", "运营", "北京", "15-25K", ["增长策略", "活动运营", "数据分析"]),
]

TICKETS = [
    ("bug", "high", "open", "上传 PDF 简历后解析乱码", "我上传了一份用 WPS 导出的 PDF，解析出来的文字全是乱码，换了一份 Word 版就正常。"),
    ("bug", "medium", "in_progress", "优化结果下载的 PDF 字体缺失", "Windows 上打开下载的 PDF 显示方框，像是缺字体。"),
    ("content_error", "medium", "open", "AI 优化把我的工作经历写错了", "优化后的经历里出现了一家我没待过的公司，疑似模型幻觉。"),
    ("refund", "low", "resolved", "重复扣费申请退款", "月度套餐被扣了两次费，订单号在附件里，希望退回一笔。"),
    ("other", "low", "closed", "如何删除账号", "想注销账号并删除全部简历数据，请问流程是什么？"),
    ("bug", "medium", "in_progress", "批量优化卡在 80%", "选了 5 个岗位做批量优化，进度条卡在 80% 十分钟了。"),
    ("content_error", "high", "resolved", "匹配分与实际感受不符", "同一份简历对两个相似岗位匹配分差了 20 分，想确认评分维度。"),
    ("other", "medium", "open", "希望增加深色模式", "晚上用网站太亮了，建议加一个深色模式切换。"),
]

TICKET_REPLIES = [
    (0, "admin", "您好，方便提供一下那份 PDF 吗？我们想在本地复现。已通过站内私信联系您。", False),
    (0, "user", "已经发您邮箱了，注意查收。", False),
    (1, "admin", "已定位：服务器缺少中文字体，正在打包字体层，预计本周修复。", True),
    (2, "admin", "非常抱歉，这是模型幻觉问题。我们已将该案例加入回归测试集，并会对受影响的优化记录免费重做。", False),
    (3, "admin", "重复扣费已核实，退款将在 1-3 个工作日原路退回。", False),
    (4, "admin", "注销路径：设置 → 账号安全 → 注销账号，7 天冷静期后数据彻底删除。", False),
    (5, "admin", "Worker 队列有积压，已手动清理，请重试批量优化。", True),
    (6, "admin", "匹配分主要由关键词覆盖率与经历相关性决定，两个岗位 JD 差异会导致分差，属于正常现象。", False),
    (7, "admin", "感谢建议！深色模式已在需求池中，排期后上线。", False),
]


# ──────────────────────────── 基础工具 ────────────────────────────
def uid() -> str:
    return str(uuid.UUID(int=random.getrandbits(128), version=4))


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


def days(n: int, hours: int = 0) -> Raw:
    if hours:
        return Raw("(now() - interval '%d day' + interval '%d hour')" % (n, hours))
    return Raw("(now() - interval '%d day')" % n)


def hours(n: int) -> Raw:
    return Raw("(now() - interval '%d hour')" % n)


def insert(table: str, cols, rows) -> str:
    head = 'INSERT INTO "public"."%s" (%s) VALUES' % (table, ", ".join('"%s"' % c for c in cols))
    body = ",\n".join("(" + ", ".join(js(x) for x in r) + ")" for r in rows)
    return head + "\n" + body + ";"


blocks = []
cleanup_ids: dict[str, list[str]] = {}


def add(title: str, sql: str, table: str | None = None, ids: list[str] | None = None):
    blocks.append("-- ---------- %s ----------\n%s" % (title, sql))
    if table and ids:
        cleanup_ids.setdefault(table, []).extend(ids)


# ──────────────────────────── 1. 管理员 ────────────────────────────
add("管理员（确保 superadmin 存在）", insert("admins",
    ["id", "username", "password_hash", "role", "email", "is_active", "created_at"],
    [[ADMIN_ID, "superadmin", ADMIN_HASH, "super_admin", "admin@example.com", True, days(60)]]
).replace(";", "\nON CONFLICT (username) DO NOTHING;"))

# ──────────────────────────── 2. 用户 ────────────────────────────
user_ids = []
user_rows = []
for i, (nick, career, job_title, industries, cities, salary, status, vip) in enumerate(USERS):
    uidv = uid()
    user_ids.append(uidv)
    user_rows.append([
        uidv, "admin.demo%d@smart-resume.com" % (i + 1), None, DEMO_PASSWORD_HASH, nick, None, True,
        career,
        {"cities": cities, "job_title": job_title, "industries": industries, "salary_range": salary},
        {"resume_text": "【个人信息】\n姓名：%s\n\n【个人简介】\n多年行业经验，求职方向：%s。" % (nick, job_title),
         "job_text": "【岗位信息】\n岗位：%s\n薪资：%s\n地点：%s" % (job_title, salary, "/".join(cities))},
        True, status, None, days(40 - i * 3), days(1),
    ])
add("用户 users", insert("users", [
    "id", "email", "phone", "password_hash", "nickname", "avatar_url", "is_verified",
    "career_state", "expectation", "saved_texts", "privacy_agreed", "status",
    "deleted_at", "created_at", "updated_at",
], user_rows), "users", user_ids)

# ──────────────────────────── 3. 用户额度 ────────────────────────────
quota_ids, quota_rows = [], []
for i, uidv in enumerate(user_ids):
    vip = USERS[i][7]
    quota_ids.append(uid())
    quota_rows.append([
        quota_ids[-1], uidv,
        20 if vip else 3,            # daily_limit
        400 if vip else 50,          # monthly_limit
        random.randint(0, 5),        # daily_used
        random.randint(5, 60),       # monthly_used
        days(0), vip, days(40 - i * 3), days(0),
    ])
add("用户额度 user_quotas", insert("user_quotas", [
    "id", "user_id", "daily_limit", "monthly_limit", "daily_used", "monthly_used",
    "last_reset_date", "is_paid", "created_at", "updated_at",
], quota_rows), "user_quotas", quota_ids)

# ──────────────────────────── 4. 简历 ────────────────────────────
resume_ids, resume_rows = [], []
resume_of_user: dict[int, list[str]] = {}
for i, uidv in enumerate(user_ids):
    resume_of_user[i] = []
    for v in range(1 if i % 2 else 2):
        rid = uid()
        resume_ids.append(rid)
        resume_of_user[i].append(rid)
        job_title = USERS[i][2]
        resume_rows.append([
            rid, uidv, "%s的简历-v%d" % (USERS[i][0], v + 1),
            "/uploads/resumes/%s.pdf" % rid[:8], "pdf",
            {"personal_info": {"name": USERS[i][0], "email": "admin.demo%d@smart-resume.com" % (i + 1), "phone": "138****%04d" % (1000 + i)},
             "summary": "%s，%s 年经验，求职方向：%s。" % (USERS[i][1], random.randint(2, 8), job_title),
             "experience": [{"company": "某%s公司" % USERS[i][4][0], "title": job_title,
                             "start": "2021.03", "end": "至今",
                             "points": ["负责核心模块设计与落地，QPS 提升 %d%%" % random.randint(30, 90),
                                        "主导 %s 专项，覆盖 %d 万用户" % (job_title, random.randint(5, 50))]}],
             "education": [{"school": "某大学", "major": "相关专业", "degree": "本科"}],
             "skills": ["沟通协作", "项目管理", "数据分析"]},
            "【个人信息】姓名：%s ..." % USERS[i][0],
            v == 0, None, days(35 - i * 3),
            job_title, "某%s公司" % USERS[i][4][0], v + 1,
            "optimized" if v else "draft", random.randint(60, 95), random.randint(65, 92),
            i == 0, None, days(1),
        ])
add("简历 resumes", insert("resumes", [
    "id", "user_id", "title", "original_file_url", "file_type", "parsed_json", "raw_text",
    "is_primary", "deleted_at", "created_at", "target_position", "target_company", "version",
    "status", "match_rate", "score", "is_favorite", "thumbnail_url", "updated_at",
], resume_rows), "resumes", resume_ids)

# ──────────────────────────── 5. 岗位图片 ────────────────────────────
job_ids, job_rows = [], []
job_of_user: dict[int, list[str]] = {}
for i, uidv in enumerate(user_ids):
    job_of_user[i] = []
    for j in range(2 + (i % 2)):
        jid = uid()
        job_ids.append(jid)
        job_of_user[i].append(jid)
        title, company, category, city, salary, reqs = JOBS[(i * 2 + j) % len(JOBS)]
        job_rows.append([
            jid, uidv, "/uploads/jobs/%s.png" % jid[:8],
            {"title": title, "company": company, "city": city, "salary": salary,
             "requirements": reqs, "responsibilities": ["负责%s相关核心工作" % title[:6], "参与跨部门协作"]},
            "OCR: %s @ %s %s" % (title, company, city),
            days(random.randint(0, 29), random.randint(1, 20)),
            title, company, category, j == 0, j == 1, None, None,
        ])
add("岗位 job_images", insert("job_images", [
    "id", "user_id", "image_url", "parsed_job_json", "ocr_text", "created_at",
    "title", "company", "category", "is_primary", "is_favorite", "user_remark", "deleted_at",
], job_rows), "job_images", job_ids)

# ──────────────────────────── 6. 优化记录（含微调链） ────────────────────────────
opt_ids, opt_rows = [], []
opt_parents: list[tuple[str, str]] = []  # (parent_id, user_idx) 用于生成微调子记录
for i, uidv in enumerate(user_ids):
    rlist = resume_of_user[i]
    jlist = job_of_user[i]
    n = 4 + (i % 2)
    for k in range(n):
        oid = uid()
        opt_ids.append(oid)
        title, company, category, city, salary, reqs = JOBS[(i * 2 + k) % len(JOBS)]
        created = days(random.randint(0, 29), random.randint(1, 22))
        scored = random.random() < 0.75
        score = random.choice([5, 5, 4, 4, 4, 3, 2]) if scored else None
        feedback = None
        if scored and score <= 3:
            feedback = random.choice([
                "优化后的描述有点模板化，希望更贴合我的实际经历。",
                "关键词堆砌感明显，读起来不通顺。",
                "项目经历的 STAR 结构没写出来。",
            ])
        elif scored and score >= 4:
            feedback = random.choice([
                "比原版清晰很多，匹配度也上去了。",
                "关键词覆盖到位，已经用来投递了。",
                None,
            ])
        opt_rows.append([
            oid, uidv, rlist[k % len(rlist)], jlist[k % len(jlist)],
            {"personal_info": {"name": USERS[i][0]}, "summary": "优化前摘要"},
            {"personal_info": {"name": USERS[i][0]}, "summary": "优化后摘要：%s 方向，%d 年经验" % (title, random.randint(2, 8))},
            random.randint(55, 95),
            "/api/files/%s?exp=0&sig=mock" % oid[:8],
            "重写了 %d 条经历描述，补充 %d 个岗位关键词" % (random.randint(2, 6), random.randint(3, 12)),
            None, title, company, category, None, False,
            score, feedback, None, 0, None, "completed", created,
        ])
        if k == 0 and i in (0, 3, 5):
            opt_parents.append((oid, i))

# 微调子记录（parent_record_id 非空 →「微调修改」功能计数）
child_rows = []
for parent_id, i in opt_parents:
    cid = uid()
    opt_ids.append(cid)
    child_rows.append([
        cid, user_ids[i], resume_of_user[i][0], job_of_user[i][0],
        None, None, random.randint(60, 98), None,
        "在原优化基础上微调了摘要与技能顺序", "请把项目经历放到前面",
        JOBS[(i * 2) % len(JOBS)][0], JOBS[(i * 2) % len(JOBS)][1], JOBS[(i * 2) % len(JOBS)][2],
        None, False, random.choice([4, 5]), "微调后效果更好", parent_id, 0, None, "completed",
        days(random.randint(0, 5)),
    ])
opt_rows.extend(child_rows)
add("优化记录 optimized_resumes", insert("optimized_resumes", [
    "id", "user_id", "resume_id", "job_image_id", "original_json", "optimized_json", "match_score",
    "pdf_url", "changes_description", "custom_instructions", "job_title", "company", "category",
    "thumbnail_url", "is_favorite", "satisfaction_score", "feedback_text", "parent_record_id",
    "refine_count", "deleted_at", "status", "created_at",
], opt_rows), "optimized_resumes", opt_ids)

# 父记录 refine_count 更新（微调次数）
for parent_id, _ in opt_parents:
    blocks.append('UPDATE "public"."optimized_resumes" SET "refine_count" = 1 WHERE "id" = \'%s\';' % parent_id)

# ──────────────────────────── 7. 投递申请 ────────────────────────────
app_ids, app_rows = [], []
app_specs = [
    (0, 0, "submitted", "email", "sent", "已投递，等待回复"),
    (1, 1, "interview", "email", "sent", "一面已通过，约了二面"),
    (2, 0, "rejected", None, None, "遗憾未通过"),
    (3, 1, "offer", "form", "not_applicable", "已发 offer"),
    (4, 0, "viewed", "email", "sent", "HR 已查看"),
    (5, 1, "submitted", "manual", None, "引导去官网投递"),
]
for ui, ji, status, channel, dstatus, note in app_specs:
    aid = uid()
    app_ids.append(aid)
    app_rows.append([
        aid, user_ids[ui], job_of_user[ui][ji % len(job_of_user[ui])], resume_of_user[ui][0],
        USERS[ui][0], "admin.demo%d@smart-resume.com" % (ui + 1), "138%08d" % (10000000 + ui),
        USERS[ui][5], days(random.randint(1, 20)), note, status, channel,
        "https://careers.example.com/apply" if channel == "form" else None,
        "hr@example.com" if channel == "email" else None,
        dstatus,
        days(random.randint(0, 19)) if channel == "email" else None,
        "<msg-%s@example.com>" % aid[:8] if channel == "email" else None,
        days(random.randint(0, 20)) if channel else None,
        days(random.randint(0, 20)), days(0),
    ])
add("投递申请 applications", insert("applications", [
    "id", "user_id", "job_image_id", "resume_id", "applicant_name", "email", "phone",
    "expected_salary", "available_from", "cover_letter", "status", "channel", "apply_url",
    "recipient_email", "delivery_status", "sent_at", "provider_message_id", "consent_at",
    "created_at", "updated_at",
], app_rows), "applications", app_ids)

# ──────────────────────────── 8. 批量优化 ────────────────────────────
batch_ids, batch_rows = [], []
for i in (0, 2):
    bid = uid()
    batch_ids.append(bid)
    batch_rows.append([bid, user_ids[i], resume_of_user[i][0],
                       "completed" if i == 0 else "running",
                       3, 3 if i == 0 else 1,
                       days(random.randint(1, 10)), days(random.randint(0, 9)) if i == 0 else None])
add("批量优化 batch_optimizations", insert("batch_optimizations", [
    "id", "user_id", "source_resume_id", "status", "total_jobs", "completed_jobs",
    "created_at", "completed_at",
], batch_rows), "batch_optimizations", batch_ids)

bt_ids, bt_rows = [], []
for bi, bid in enumerate(batch_ids):
    for k in range(3):
        tid = uid()
        bt_ids.append(tid)
        jlist = job_of_user[0 if bi == 0 else 2]
        bt_rows.append([tid, bid, jlist[k % len(jlist)],
                        opt_ids[k] if bi == 0 else None,
                        "completed" if (bi == 0 or k == 0) else "processing", None, days(9 - k)])
add("批量任务 batch_job_tasks", insert("batch_job_tasks", [
    "id", "batch_id", "job_image_id", "optimization_record_id", "status", "error_message", "created_at",
], bt_rows), "batch_job_tasks", bt_ids)

# ──────────────────────────── 9. 站内消息 ────────────────────────────
msg_ids, msg_rows = [], []
for i, uidv in enumerate(user_ids):
    for k in range(3):
        mid = uid()
        msg_ids.append(mid)
        msg_rows.append([mid, uidv, ["system", "optimization", "ticket"][k],
                         ["系统公告", "优化完成通知", "工单回复提醒"][k],
                         ["您的账号已完成实名认证。", "针对「%s」的优化已完成，匹配度 %d 分。" % (USERS[i][2], random.randint(65, 95)),
                          "您的工单已收到回复，请查看。"][k],
                         None, k == 2, days(random.randint(0, 15))])
add("站内消息 messages", insert("messages", [
    "id", "user_id", "msg_type", "title", "content", "ref_id", "is_read", "created_at",
], msg_rows), "messages", msg_ids)

# ──────────────────────────── 10. 审计日志（登录/业务行为 → DAU） ────────────────────────────
audit_ids, audit_rows = [], []
for i, uidv in enumerate(user_ids):
    # 近 30 天登录记录（大屏 DAU 趋势）
    for d in sorted(random.sample(range(30), 6)):
        aid = uid()
        audit_ids.append(aid)
        audit_rows.append([aid, uidv, "login", "user", uidv, "邮箱验证码登录",
                           "111.55.79.%d" % (10 + i), "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                           days(d, random.randint(8, 22))])
    for action, ttype in [("resume_upload", "resume"), ("optimize", "optimized_resume"), ("job_upload", "job_image")]:
        aid = uid()
        audit_ids.append(aid)
        audit_rows.append([aid, uidv, action, ttype, uid(), None,
                           "111.55.79.%d" % (10 + i), None, days(random.randint(0, 29))])
add("用户审计日志 audit_logs", insert("audit_logs", [
    "id", "user_id", "action", "target_type", "target_id", "detail", "ip_address", "user_agent", "created_at",
], audit_rows), "audit_logs", audit_ids)

# ──────────────────────────── 11. 订单与套餐 ────────────────────────────
pkg_ids, pkg_rows = [], []
pkg_specs = [
    ("体验包", "trial", 9.9, 7, 20),
    ("月度会员", "monthly", 29.9, 30, 500),
    ("年度会员", "yearly", 299.0, 365, 8000),
]
for name, ptype, price, dur, quota in pkg_specs:
    pid = uid()
    pkg_ids.append(pid)
    pkg_rows.append([pid, name, ptype, price, dur, quota, True, days(60)])
add("套餐 quota_packages", insert("quota_packages", [
    "id", "name", "package_type", "price", "duration_days", "quota_amount", "is_active", "created_at",
], pkg_rows), "quota_packages", pkg_ids)

order_ids, order_rows = [], []
order_specs = [
    (0, "月度会员", 29.9, "success", "wechat"),
    (1, "体验包", 9.9, "success", "alipay"),
    (2, "月度会员", 29.9, "pending", None),
    (3, "年度会员", 299.0, "success", "alipay"),
    (4, "月度会员", 29.9, "success", "wechat"),
    (5, "体验包", 9.9, "refunded", "alipay"),
    (6, "月度会员", 29.9, "success", "wechat"),
    (7, "年度会员", 299.0, "success", "alipay"),
    (2, "月度会员", 29.9, "success", "wechat"),
    (4, "体验包", 9.9, "pending", None),
]
for i, (ui, pkg, amount, status, method) in enumerate(order_specs):
    oid = uid()
    order_ids.append(oid)
    created = days(random.randint(0, 29), random.randint(9, 21))
    order_rows.append([
        oid, user_ids[ui], "AD%s%04d" % (days_str_hint(), i), "monthly" if "月" in pkg or "年" in pkg else "trial",
        pkg, amount, method, status,
        "用户申请退款" if status == "refunded" else None,
        ADMIN_SUBQUERY if status == "refunded" else None,
        created if status != "pending" else None,
        days(random.randint(0, 5)) if status == "refunded" else None,
        created,
    ])
add("订单 orders", insert("orders", [
    "id", "user_id", "order_no", "package_type", "package_name", "amount", "payment_method",
    "status", "refund_reason", "refunded_by", "paid_at", "refunded_at", "created_at",
], order_rows), "orders", order_ids)


# ──────────────────────────── 12. 工单与回复 ────────────────────────────
ticket_ids, ticket_rows = [], []
for i, (cat, pri, status, subject, content) in enumerate(TICKETS):
    tid = uid()
    ticket_ids.append(tid)
    ticket_rows.append([
        tid, user_ids[i % len(user_ids)], cat, pri, subject, content,
        None, status,
        ADMIN_SUBQUERY if status in ("in_progress", "resolved", "closed") else None,
        "问题已确认并修复" if status == "resolved" else ("已引导至帮助中心" if status == "closed" else None),
        days(random.randint(0, 20), random.randint(9, 20)),
        days(random.randint(0, 3)) if status == "closed" else None,
    ])
add("工单 support_tickets", insert("support_tickets", [
    "id", "user_id", "category", "priority", "subject", "content", "attachments", "status",
    "assigned_to", "resolution", "created_at", "closed_at",
], ticket_rows), "support_tickets", ticket_ids)

tr_ids, tr_rows = [], []
for ti, author, content, internal in TICKET_REPLIES:
    rid = uid()
    tr_ids.append(rid)
    tr_rows.append([
        rid, ticket_ids[ti],
        ADMIN_SUBQUERY if author == "admin" else None,
        None if author == "admin" else user_ids[ti % len(user_ids)],
        content, internal, days(random.randint(0, 3), random.randint(10, 18)),
    ])
add("工单回复 ticket_replies", insert("ticket_replies", [
    "id", "ticket_id", "admin_id", "user_id", "content", "is_internal", "created_at",
], tr_rows), "ticket_replies", tr_ids)

# ──────────────────────────── 13. AI 调用日志（近 30 天） ────────────────────────────
call_ids, call_rows = [], []
for d in range(30):
    n = random.randint(4, 9)
    for k in range(n):
        cid = uid()
        call_ids.append(cid)
        model = random.choices(MODELS, weights=[5, 3, 2])[0]
        success = random.random() < 0.92
        pname = random.choice(PROMPT_NAMES)
        call_rows.append([
            cid, random.choice(user_ids), model, pname, 2,
            random.randint(800, 3500), random.randint(200, 1800),
            random.randint(900, 6500) if success else random.randint(200, 900),
            success,
            None if success else random.choice(ERROR_MESSAGES),
            round(random.uniform(0.0008, 0.0120), 6),
            days(d, random.randint(8, 22)),
        ])
add("AI 调用日志 ai_model_call_logs", insert("ai_model_call_logs", [
    "id", "user_id", "model_name", "prompt_template_name", "prompt_version", "input_tokens",
    "output_tokens", "latency_ms", "is_success", "error_message", "cost_usd", "created_at",
], call_rows), "ai_model_call_logs", call_ids)

# ──────────────────────────── 14. 管理员操作日志 ────────────────────────────
alog_ids, alog_rows = [], []
alog_specs = [
    ("user_ban", "user", {"reason": "发布违规广告"}),
    ("user_unban", "user", None),
    ("set_vip", "user", {"is_paid": True}),
    ("add_quota", "user", {"amount": 20, "reason": "投诉补偿"}),
    ("create_template", "template", None),
    ("create_prompt", "prompt", {"version": 2}),
    ("deploy_prompt", "prompt", {"gray_ratio": 20}),
    ("rollback_prompt", "prompt", None),
    ("refund_order", "order", {"reason": "重复扣费"}),
]
for i, (action, ttype, detail) in enumerate(alog_specs * 2 + [("create_prompt", "prompt", {"version": 3})]):
    lid = uid()
    alog_ids.append(lid)
    alog_rows.append([lid, ADMIN_SUBQUERY, action, ttype, uid(), detail,
                      "111.55.79.%d" % (20 + i % 5), days(random.randint(0, 25), random.randint(9, 21))])
add("管理员日志 admin_logs", insert("admin_logs", [
    "id", "admin_id", "action", "target_type", "target_id", "details", "ip_address", "created_at",
], alog_rows), "admin_logs", alog_ids)

# ──────────────────────────── 15. 简历模板 ────────────────────────────
tpl_ids, tpl_rows = [], []
for i, (name, desc) in enumerate(TEMPLATES):
    tid = uid()
    tpl_ids.append(tid)
    tpl_rows.append([tid, name, desc,
                     "<div class='resume %s'>模板占位</div>" % name,
                     ".resume { font-family: 'PingFang SC'; }", None, True, i == 0,
                     ADMIN_SUBQUERY, days(60 - i), days(60 - i)])
add("简历模板 resume_templates", insert("resume_templates", [
    "id", "name", "description", "html_content", "css_content", "thumbnail_url", "is_active",
    "is_default", "created_by", "created_at", "updated_at",
], tpl_rows), "resume_templates", tpl_ids)

# ──────────────────────────── 16. 行业关键词 ────────────────────────────
kw_ids, kw_rows = [], []
for industry, words in KEYWORD_SEED.items():
    for w in words:
        kid = uid()
        kw_ids.append(kid)
        kw_rows.append([kid, w, industry, random.choice(KEYWORD_CATEGORIES), True,
                        ADMIN_SUBQUERY, days(random.randint(1, 50))])
add("行业关键词 industry_keywords", insert("industry_keywords", [
    "id", "keyword", "industry", "category", "is_active", "created_by", "created_at",
], kw_rows), "industry_keywords", kw_ids)

# ──────────────────────────── 17. ATS 规则 ────────────────────────────
ats_ids, ats_rows = [], []
for name, pattern, severity, desc in ATS_RULES:
    aid = uid()
    ats_ids.append(aid)
    ats_rows.append([aid, name, pattern, desc, severity, True, ADMIN_SUBQUERY, days(random.randint(1, 40))])
add("ATS 规则 ats_rules", insert("ats_rules", [
    "id", "name", "pattern", "description", "severity", "is_active", "created_by", "created_at",
], ats_rows), "ats_rules", ats_ids)

# ──────────────────────────── 18. Prompt 模板（各 2 版） ────────────────────────────
pt_ids, pt_rows = [], []
for name in PROMPT_NAMES:
    scene = PROMPT_SCENES[name]
    for version in (1, 2):
        pid = uid()
        pt_ids.append(pid)
        pt_rows.append([
            pid, name, scene, version,
            "你是资深简历顾问，请针对「%s」场景优化以下内容，保留事实、突出量化成果：\n{content}" % SCENE_LABELS_CN[name],
            {"content": "待优化文本"}, version == 2, 20 if version == 2 else 0,
            ADMIN_SUBQUERY, days(30 - version * 10),
        ])
add("Prompt 模板 prompt_templates", insert("prompt_templates", [
    "id", "name", "scene", "version", "content", "variables", "is_active", "gray_ratio",
    "created_by", "created_at",
], pt_rows), "prompt_templates", pt_ids)

# ──────────────────────────── 19. 模型路由（仅空表时兜底） ────────────────────────────
mr_rows = []
mr_ids = []
mr_specs = [
    ("qwen3.8-max", "通义千问3.8 Max", 5, 60),
    ("qwen3.7-max", "通义千问3.7 Max", 3, 60),
    ("qwen3.7-flash", "通义千问3.7 Flash", 2, 120),
]
for name, display, weight, rpm in mr_specs:
    mid = uid()
    mr_ids.append(mid)
    mr_rows.append([
        mid, name, display, "https://dashscope.aliyuncs.com/compatible-mode/v1", None,
        weight, rpm, 1000, 5, 0, None, True, "free", days(60),
    ])
mr_sql = ('INSERT INTO "public"."model_routing" '
          '("id", "model_name", "display_name", "api_endpoint", "api_key_encrypted", "weight", '
          '"rate_limit_per_minute", "rate_limit_per_hour", "max_consecutive_failures", '
          '"consecutive_failures", "failover_to", "is_enabled", "tier", "created_at")\n'
          'SELECT * FROM (VALUES\n  ' + ',\n  '.join("(" + ", ".join(js(x) for x in r) + ")" for r in mr_rows) + '\n'
          ') AS v(id, model_name, display_name, api_endpoint, api_key_encrypted, weight, '
          'rate_limit_per_minute, rate_limit_per_hour, max_consecutive_failures, '
          'consecutive_failures, failover_to, is_enabled, tier, created_at)\n'
          'WHERE NOT EXISTS (SELECT 1 FROM model_routing);')
add("模型路由 model_routing（仅空表时兜底）", mr_sql, "model_routing", mr_ids)

# ═══════════════════════════════════════ 输出 ═══════════════════════════════════════
header = """-- ============================================================
-- 智能简历 · 管理后台测试数据
-- 生成脚本：scripts/gen_admin_seed.py（固定随机种子，结果稳定）
-- 覆盖模块：用户管理 / 数据大屏 / 内容管理 / AI模型管理 /
--           任务监控 / 工单反馈 / 财务管理 / 审计日志
-- 账号：admin.demo1@smart-resume.com ~ admin.demo8@smart-resume.com
-- 密码：Demo@123456（其中 admin.demo7 为封禁状态）
-- 导入：backend/.venv/Scripts/python.exe scripts/apply_seed.py 管理后台测试数据.sql
-- 清理：backend/.venv/Scripts/python.exe scripts/apply_seed.py 管理后台测试数据-清理.sql
-- ============================================================
BEGIN;
"""

footer = "\nCOMMIT;\n"

with open(OUT_SEED, "w", encoding="utf-8") as f:
    f.write(header + "\n\n".join(blocks) + footer)
# 同步一份 ASCII 文件名副本：Windows tar 会把中文文件名按 GBK 存字节，
# 服务器（UTF-8 locale）解压后变成乱码名，导致部署时按中文名找不到文件
with open(OUT_SEED_ASCII, "w", encoding="utf-8") as f:
    f.write(header + "\n\n".join(blocks) + footer)

# ── 清理 SQL（按 id 精确删除，子表先删） ──
clean_order = [
    "ticket_replies", "support_tickets", "orders", "applications", "batch_job_tasks",
    "batch_optimizations", "messages", "ai_model_call_logs", "audit_logs", "user_quotas",
    "optimized_resumes", "resumes", "job_images", "users",
    "admin_logs", "industry_keywords", "ats_rules", "resume_templates", "prompt_templates",
    "quota_packages", "model_routing",
]
# 运行时产生的子表（种子不写入，但登录/使用后会引用种子用户，FK 无级联，需先按 user_id 清）
runtime_children = [
    ("delivery_events", "application_id IN (SELECT id FROM applications WHERE user_id IN ({uids}))"),
    ("communications", "user_id IN ({uids}) OR application_id IN (SELECT id FROM applications WHERE user_id IN ({uids}))"),
    ("feedbacks", "user_id IN ({uids}) OR optimization_record_id IN (SELECT id FROM optimized_resumes WHERE user_id IN ({uids}))"),
    ("interview_questions", "user_id IN ({uids})"),
    ("interview_sessions", "user_id IN ({uids})"),
    ("interview_tracks", "user_id IN ({uids})"),
    ("capability_assessments", "user_id IN ({uids})"),
    ("user_devices", "user_id IN ({uids})"),
    ("email_suppressions", "user_id IN ({uids})"),
    ("email_templates", "user_id IN ({uids})"),
]
clean_lines = [
    "-- ============================================================",
    "-- 智能简历 · 管理后台测试数据清理（按 id 精确删除，不动其他数据）",
    "-- ============================================================",
    "BEGIN;",
]
# 先清运行时子表（此时 applications/optimized_resumes/users 还在，可被子查询引用）
_uids = ", ".join("'%s'" % x for x in cleanup_ids.get("users", []))
for _tbl, _cond in runtime_children:
    clean_lines.append('DELETE FROM "public"."%s" WHERE %s;' % (_tbl, _cond.format(uids=_uids)))
# 验证码表无 FK，按邮箱模式清
clean_lines.append("DELETE FROM \"public\".\"verification_codes\" WHERE \"email\" LIKE 'admin.demo%@smart-resume.com';")
for table in clean_order:
    ids = cleanup_ids.get(table)
    if not ids:
        continue
    id_list = ", ".join("'%s'" % x for x in ids)
    clean_lines.append('DELETE FROM "public"."%s" WHERE "id" IN (%s);' % (table, id_list))
# 演示账号一并清掉（级联不到 user_quotas/audit_logs/ai_model_call_logs，已在上面显式删除）
clean_lines.append("DELETE FROM \"public\".\"users\" WHERE \"email\" LIKE 'admin.demo%@smart-resume.com';")
clean_lines.append("COMMIT;")
with open(OUT_CLEAN, "w", encoding="utf-8") as f:
    f.write("\n".join(clean_lines) + "\n")
with open(OUT_CLEAN_ASCII, "w", encoding="utf-8") as f:
    f.write("\n".join(clean_lines) + "\n")

total_rows = sum(len(v) for v in cleanup_ids.values())
print("已生成：")
print("  %s（%d 个实体，共 %d 行）" % (OUT_SEED, len(cleanup_ids), total_rows))
print("  %s" % OUT_CLEAN)
for t in clean_order:
    if cleanup_ids.get(t):
        print("    %-24s %d 行" % (t, len(cleanup_ids[t])))
