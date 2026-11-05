"""内置行业证书 & 学习资源库（静态目录，人工整理，供 /certs 页浏览与 AI 推荐参考）。

数据来源：整理的多行业证书/课程清单（名称、机构、类型、说明、官网链接）。
type: certificate=证书 / course=学习课程。
"""

CertCatalogItem = dict  # {category, name, issuer, type, link, desc}

CERT_CATALOG: list[CertCatalogItem] = [
    # ── IT互联网 / 云计算 / 开发运维 ──
    {"category": "IT互联网/云计算/开发运维", "name": "华为认证 HCIA/HCIP/HCIE（数通/云/鸿蒙）", "issuer": "华为", "type": "certificate", "link": "https://e.huawei.com/cn/talent", "desc": "网络与云方向厂商认证体系，ICT 岗位通用加分"},
    {"category": "IT互联网/云计算/开发运维", "name": "阿里云 ACA/ACP/ACE 认证", "issuer": "阿里云", "type": "certificate", "link": "https://edu.aliyun.com/certification", "desc": "云计算厂商认证，国内互联网企业认可度高"},
    {"category": "IT互联网/云计算/开发运维", "name": "腾讯云 TCA/TCP/TCE 认证", "issuer": "腾讯云", "type": "certificate", "link": "https://cloud.tencent.com/edu/certification", "desc": "云开发、小程序、音视频方向厂商认证"},
    {"category": "IT互联网/云计算/开发运维", "name": "AWS Certification（CLF/DVA/SAA 等）", "issuer": "AWS", "type": "certificate", "link": "https://aws.amazon.com/certification/", "desc": "亚马逊云认证体系，外企、出海项目岗位加分"},
    {"category": "IT互联网/云计算/开发运维", "name": "AWS Skill Builder 备考课程", "issuer": "AWS", "type": "course", "link": "https://skillbuilder.aws/", "desc": "AWS 官方备考课程与动手实验"},
    {"category": "IT互联网/云计算/开发运维", "name": "Microsoft Azure 认证（AZ-204/AZ-400/AI-102 等）", "issuer": "Microsoft", "type": "certificate", "link": "https://learn.microsoft.com/credentials/", "desc": "云原生、DevOps、AI 工程师方向"},
    {"category": "IT互联网/云计算/开发运维", "name": "Google Professional Cloud 认证", "issuer": "Google Cloud", "type": "certificate", "link": "https://www.cloudskillsboost.google/", "desc": "GCP 云开发方向，配套 Skills Boost 学习路径"},
    {"category": "IT互联网/云计算/开发运维", "name": "CKA（Kubernetes 管理员）", "issuer": "CNCF/Linux 基金会", "type": "certificate", "link": "https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/", "desc": "云原生容器运维核心认证"},
    {"category": "IT互联网/云计算/开发运维", "name": "CNCF 认证体系（KCNA/CKAD/CKS）", "issuer": "CNCF", "type": "certificate", "link": "https://www.cncf.io/training/certification/", "desc": "云原生认证家族，覆盖入门到安全专家"},
    {"category": "IT互联网/云计算/开发运维", "name": "RHCE 红帽认证工程师", "issuer": "Red Hat", "type": "certificate", "link": "https://www.redhat.com/en/services/training", "desc": "Linux 运维方向经典厂商认证"},
    {"category": "IT互联网/云计算/开发运维", "name": "CCNA/CCNP 认证", "issuer": "Cisco", "type": "certificate", "link": "https://learningnetwork.cisco.com/", "desc": "网络工程方向厂商认证"},
    {"category": "IT互联网/云计算/开发运维", "name": "Oracle 认证（OCP/Java）", "issuer": "Oracle", "type": "certificate", "link": "https://education.oracle.com/", "desc": "DBA 与 Java 后端方向厂商认证"},
    {"category": "IT互联网/云计算/开发运维", "name": "软考（软件设计师/系统架构设计师/信息系统项目管理师）", "issuer": "人社部+工信部", "type": "certificate", "link": "https://www.ruankao.org.cn/", "desc": "国企/事业单位职称、部分城市落户加分"},
    {"category": "IT互联网/云计算/开发运维", "name": "LeetCode 刷题 / 剑指 Offer", "issuer": "—", "type": "course", "link": "https://leetcode.cn/", "desc": "算法面试备战，研发岗求职刚需"},
    {"category": "IT互联网/云计算/开发运维", "name": "极客时间工程类专栏", "issuer": "极客时间", "type": "course", "link": "https://time.geekbang.org/", "desc": "工程能力进阶课程"},
    {"category": "IT互联网/云计算/开发运维", "name": "拉勾教育岗位进阶课", "issuer": "拉勾", "type": "course", "link": "https://edu.lagou.com/", "desc": "面向求职的岗位技能进阶课程"},
    {"category": "IT互联网/云计算/开发运维", "name": "Postman 官方 API 测试课程", "issuer": "Postman", "type": "course", "link": "https://www.postman.com/training/", "desc": "接口自动化测试官方学习资源"},

    # ── 数据 / AI / 算法 ──
    {"category": "数据/AI/算法", "name": "HCIA/HCIP-AI 华为人工智能认证", "issuer": "华为", "type": "certificate", "link": "https://e.huawei.com/cn/talent", "desc": "AI 应用开发方向入门到进阶厂商认证"},
    {"category": "数据/AI/算法", "name": "HCIP-Big Data 华为大数据高级工程师", "issuer": "华为云", "type": "certificate", "link": "https://edu.huaweicloud.com/certificationindex.html", "desc": "Hive、Spark 生态能力考核"},
    {"category": "数据/AI/算法", "name": "阿里云大数据分析师（ACP-BigData）", "issuer": "阿里云", "type": "certificate", "link": "https://edu.aliyun.com/certification", "desc": "大数据方向厂商认证"},
    {"category": "数据/AI/算法", "name": "TensorFlow Developer Certificate", "issuer": "Google/TensorFlow", "type": "certificate", "link": "https://www.tensorflow.org/certificate", "desc": "深度学习框架官方开发者认证"},
    {"category": "数据/AI/算法", "name": "AWS Machine Learning Specialty", "issuer": "AWS", "type": "certificate", "link": "https://aws.amazon.com/certification/", "desc": "机器学习方向专业级厂商认证"},
    {"category": "数据/AI/算法", "name": "CDA 数据分析师（Level Ⅰ/Ⅱ/Ⅲ）", "issuer": "CDA Institute", "type": "certificate", "link": "https://www.cdaglobal.com/", "desc": "国内商业数据分析主流行业认证（课程网校 edu.cda.cn）"},
    {"category": "数据/AI/算法", "name": "Tableau Certified Data Analyst", "issuer": "Tableau", "type": "certificate", "link": "https://www.tableau.com/zh-cn/training/certification", "desc": "BI 可视化数据分析厂商认证"},
    {"category": "数据/AI/算法", "name": "吴恩达机器学习/深度学习专项课程", "issuer": "DeepLearning.AI × Coursera", "type": "course", "link": "https://www.coursera.org/specializations/machine-learning-introduction", "desc": "数据科学/算法岗经典入门课程"},
    {"category": "数据/AI/算法", "name": "Kaggle Learn / 竞赛", "issuer": "Google（Kaggle）", "type": "course", "link": "https://www.kaggle.com/learn", "desc": "免费微课程与实战竞赛，数据岗作品集利器"},
    {"category": "数据/AI/算法", "name": "华为云开发者学堂云原生系列课程", "issuer": "华为云", "type": "course", "link": "https://edu.huaweicloud.com/learningpath", "desc": "K8s 容器技术官方学习路径"},

    # ── 项目管理 / 产品 ──
    {"category": "项目管理/产品", "name": "PMP 项目管理专业人士认证", "issuer": "PMI", "type": "certificate", "link": "https://www.pmi.org/", "desc": "项目管理通用认证（大陆中文报名 exam.chinapmp.cn）"},
    {"category": "项目管理/产品", "name": "ACP（PMI 敏捷管理）", "issuer": "PMI", "type": "certificate", "link": "https://www.pmi.org/", "desc": "敏捷开发管理方向认证"},
    {"category": "项目管理/产品", "name": "软考高级·信息系统项目管理师", "issuer": "人社部+工信部", "type": "certificate", "link": "https://www.ruankao.org.cn/", "desc": "国家级项目管理职称认证"},
    {"category": "项目管理/产品", "name": "NPDP 产品经理国际资格认证", "issuer": "PDMA", "type": "certificate", "link": "https://www.pdma.org/", "desc": "产品经理方向国际认证"},
    {"category": "项目管理/产品", "name": "PRINCE2 项目管理认证", "issuer": "PeopleCert", "type": "certificate", "link": "https://www.peoplecert.org/", "desc": "欧洲体系项目管理方法论认证"},
    {"category": "项目管理/产品", "name": "Scrum.org PSM I", "issuer": "Scrum.org", "type": "certificate", "link": "https://www.scrum.org/", "desc": "Scrum 敏捷实践认证，性价比高"},
    {"category": "项目管理/产品", "name": "Google Project Management 职业证书", "issuer": "Google × Coursera", "type": "course", "link": "https://www.coursera.org/professional-certificates/google-project-management", "desc": "零基础项目管理入门课程"},

    # ── 金融 / 财会 ──
    {"category": "金融/财会", "name": "CFA 特许金融分析师", "issuer": "CFA Institute", "type": "certificate", "link": "https://www.cfainstitute.org/", "desc": "金融分析与投资管理高含金量国际认证"},
    {"category": "金融/财会", "name": "CPA 注册会计师", "issuer": "中注协", "type": "certificate", "link": "https://cpaexam.cicpa.org.cn/", "desc": "财会领域高含金量证书，审计/财务高级岗位"},
    {"category": "金融/财会", "name": "ACCA 国际注册会计师", "issuer": "ACCA", "type": "certificate", "link": "https://www.accaglobal.com/", "desc": "国际化财会认证，外企/出海方向"},
    {"category": "金融/财会", "name": "初级/中级会计专业技术资格", "issuer": "财政部会计资格评价中心", "type": "certificate", "link": "https://kzp.mof.gov.cn/", "desc": "财会入门国家职称与中级职称"},
    {"category": "金融/财会", "name": "CMA 美国注册管理会计师", "issuer": "IMA（中国）", "type": "certificate", "link": "https://www.imachina.org.cn/", "desc": "管理会计方向：财务分析、预算管理"},
    {"category": "金融/财会", "name": "税务师证书", "issuer": "中税协", "type": "certificate", "link": "https://ksbm.ecctaa.cn/", "desc": "税务方向专业证书，企业财税岗加分"},
    {"category": "金融/财会", "name": "证券从业资格", "issuer": "中国证券业协会", "type": "certificate", "link": "https://www.sac.net.cn/", "desc": "证券行业准入类证书"},
    {"category": "金融/财会", "name": "基金从业资格", "issuer": "中国证券投资基金业协会", "type": "certificate", "link": "https://www.amac.org.cn/", "desc": "基金行业准入类证书"},
    {"category": "金融/财会", "name": "银行从业资格", "issuer": "中国银行业协会", "type": "certificate", "link": "https://www.china-cba.net/", "desc": "银行业准入类证书"},
    {"category": "金融/财会", "name": "FRM 金融风险管理师", "issuer": "GARP", "type": "certificate", "link": "https://www.garp.org/", "desc": "金融风险管理国际认证，风控岗位加分"},

    # ── 语言 / 外贸 ──
    {"category": "语言/外贸", "name": "大学英语四六级（CET-4/6）", "issuer": "教育部教育考试院", "type": "certificate", "link": "https://cet-bm.neea.edu.cn/", "desc": "国内企业通用英语能力凭证"},
    {"category": "语言/外贸", "name": "雅思 IELTS", "issuer": "教育部考试院/英文化协", "type": "certificate", "link": "https://ielts.neea.edu.cn/", "desc": "出国/外企通用英语水平认证"},
    {"category": "语言/外贸", "name": "托福 TOEFL", "issuer": "ETS", "type": "certificate", "link": "https://toefl.neea.edu.cn/", "desc": "北美方向英语水平认证"},
    {"category": "语言/外贸", "name": "CATTI 全国翻译专业资格证", "issuer": "人社部", "type": "certificate", "link": "https://www.catticenter.com/", "desc": "笔译口译认证，外贸/跨境/翻译岗位"},
    {"category": "语言/外贸", "name": "BEC 商务英语（初/中/高级）", "issuer": "教育部考试院/剑桥", "type": "certificate", "link": "https://bec.neea.edu.cn/", "desc": "外贸商务场景英语证书"},
    {"category": "语言/外贸", "name": "日语 JLPT（N5-N1）", "issuer": "教育部考试院", "type": "certificate", "link": "https://jlpt.neea.edu.cn/", "desc": "日语能力水平认证，日企/对日外包方向"},
    {"category": "语言/外贸", "name": "韩语 TOPIK", "issuer": "教育部考试院", "type": "certificate", "link": "https://topik.neea.edu.cn/", "desc": "韩语能力认证，韩企方向"},

    # ── 设计 / 创意 ──
    {"category": "设计/创意", "name": "Adobe Certified Professional（PS/AI 等）", "issuer": "Adobe", "type": "certificate", "link": "https://www.adobe.com/certification.html", "desc": "视觉设计方向官方认证"},
    {"category": "设计/创意", "name": "Figma Certified Professional", "issuer": "Figma", "type": "certificate", "link": "https://www.figma.com/certification/", "desc": "UI 交互设计官方专业认证"},
    {"category": "设计/创意", "name": "站酷高高手 UI 全链路课程", "issuer": "站酷", "type": "course", "link": "https://www.gogoup.com/", "desc": "国内 UI 交互商业实战线上课程"},
    {"category": "设计/创意", "name": "Google UX Design 职业证书", "issuer": "Google × Coursera", "type": "course", "link": "https://www.coursera.org/professional-certificates/google-ux-design", "desc": "交互/体验设计系统化入门"},
    {"category": "设计/创意", "name": "Autodesk / SolidWorks 认证", "issuer": "Autodesk/Dassault", "type": "certificate", "link": "https://www.autodesk.com/certification", "desc": "CAD/工业设计软件官方认证"},

    # ── 市场 / 运营 / 电商 ──
    {"category": "市场/运营/电商", "name": "阿里巴巴电商运营认证", "issuer": "阿里巴巴", "type": "certificate", "link": "https://alicert.taobao.com/", "desc": "淘宝天猫运营官方认证"},
    {"category": "市场/运营/电商", "name": "腾讯课堂短视频运营实战课程", "issuer": "腾讯课堂", "type": "course", "link": "https://ke.qq.com/", "desc": "短视频、新媒体运营体系化课程"},
    {"category": "市场/运营/电商", "name": "Google Digital Marketing & E-commerce 职业证书", "issuer": "Google × Coursera", "type": "course", "link": "https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce", "desc": "数字营销与电商运营入门"},
    {"category": "市场/运营/电商", "name": "Google Data Analytics 职业证书", "issuer": "Google × Coursera", "type": "course", "link": "https://www.coursera.org/professional-certificates/google-data-analytics", "desc": "数据分析思维与工具入门"},
    {"category": "市场/运营/电商", "name": "Meta Social Media Marketing 职业证书", "issuer": "Meta × Coursera", "type": "course", "link": "https://www.coursera.org/professional-certificates/facebook-social-media-marketing", "desc": "海外社媒营销方向"},

    # ── 人力资源 / 行政 ──
    {"category": "人力资源/行政", "name": "企业人力资源管理师（四级~一级）", "issuer": "人社部备案评价机构", "type": "certificate", "link": "https://www.mohrss.gov.cn/", "desc": "HR 招聘/绩效/薪酬岗位通用职业技能等级证书"},
    {"category": "人力资源/行政", "name": "钉钉 HR 数字化官方课程", "issuer": "钉钉", "type": "course", "link": "https://ke.dingtalk.com/", "desc": "HR 数字化、人事系统实操课程"},

    # ── 教育 / 法律 / 体制内 ──
    {"category": "教育/法律/体制内", "name": "中小学教师资格证（NTCE）", "issuer": "教育部教育考试院", "type": "certificate", "link": "https://ntce.neea.edu.cn/", "desc": "教师岗位准入证书"},
    {"category": "教育/法律/体制内", "name": "法律职业资格考试（法考）", "issuer": "司法部", "type": "certificate", "link": "https://www.moj.gov.cn/", "desc": "法律职业准入证书"},
    {"category": "教育/法律/体制内", "name": "医师资格考试", "issuer": "国家医学考试中心", "type": "certificate", "link": "https://www.nmec.org.cn/", "desc": "执业医师/助理医师准入"},
    {"category": "教育/法律/体制内", "name": "普通话水平测试", "issuer": "国家语委", "type": "certificate", "link": "https://www.cltt.org/", "desc": "教师/播音等岗位语言要求"},
    {"category": "教育/法律/体制内", "name": "中国大学 MOOC", "issuer": "网易/高教社", "type": "course", "link": "https://www.icourse163.org/", "desc": "浙大/北大等高校公开课，覆盖计算机/经管/统计"},
    {"category": "教育/法律/体制内", "name": "国家高等教育智慧教育平台", "issuer": "教育部", "type": "course", "link": "https://higher.smartedu.cn/", "desc": "国内高校课程官方汇总平台"},
    {"category": "教育/法律/体制内", "name": "哈佛 CS50 计算机导论", "issuer": "Harvard × edX", "type": "course", "link": "https://www.edx.org/course/cs50s-introduction-to-computer-science", "desc": "全球最受欢迎的计算机入门课（免费旁听）"},

    # ── 工程 / 建筑 / 制造 ──
    {"category": "工程/建筑/制造", "name": "一级/二级建造师", "issuer": "住建部（各省人事考试网）", "type": "certificate", "link": "https://www.cpta.com.cn/", "desc": "建筑施工注册证书，项目经理岗位必备"},
    {"category": "工程/建筑/制造", "name": "一级造价工程师", "issuer": "住建部", "type": "certificate", "link": "https://www.cpta.com.cn/", "desc": "工程造价注册证书，造价咨询高认可"},
    {"category": "工程/建筑/制造", "name": "华为 HCIP-5G / 通信认证", "issuer": "华为", "type": "certificate", "link": "https://e.huawei.com/cn/talent", "desc": "5G 与通信工程方向厂商认证"},
    {"category": "工程/建筑/制造", "name": "西门子 SCE 工业自动化认证", "issuer": "西门子", "type": "certificate", "link": "https://sce.siemens.com.cn/", "desc": "PLC、工业自动化厂商认证，智能制造岗位"},
    {"category": "工程/建筑/制造", "name": "工业机器人操作与运维职业技能等级证", "issuer": "人社部备案评价机构", "type": "certificate", "link": "https://www.mohrss.gov.cn/", "desc": "工业机器人调试运维岗位技能证书"},

    # ── 网络安全 ──
    {"category": "网络安全", "name": "HCIA-Security 华为网络安全助理认证", "issuer": "华为", "type": "certificate", "link": "https://edu.huaweicloud.com/certificationindex.html", "desc": "网络安全入门厂商认证，安全运维岗位"},
    {"category": "网络安全", "name": "CISP 注册信息安全专业人员", "issuer": "中国信息安全测评中心", "type": "certificate", "link": "https://www.cisp.org.cn/", "desc": "国内政企安全岗位主流行业认证"},
    {"category": "网络安全", "name": "CISSP 国际注册信息安全专家", "issuer": "ISC2", "type": "certificate", "link": "https://www.isc2.org/Certifications/CISSP", "desc": "信息安全高端国际认证（另：ISC2 CC 入门免费）"},

    # ── 测试 / 软件质量 ──
    {"category": "测试/软件质量", "name": "ISTQB 软件测试工程师基础级", "issuer": "ISTQB", "type": "certificate", "link": "https://www.istqb.org.cn/", "desc": "国际软件测试通用认证，功能测试岗位加分"},

    # ── 物流 / 供应链 ──
    {"category": "物流/供应链", "name": "CPLM 物流职业经理证书", "issuer": "中物联", "type": "certificate", "link": "http://www.cplm.org.cn/", "desc": "国内物流供应链行业认证"},
    {"category": "物流/供应链", "name": "注册供应链管理师", "issuer": "中国物流与采购联合会体系", "type": "certificate", "link": "https://www.chinascm.org.cn/", "desc": "供应链计划、采购方向职业认证"},

    # ── 医药 / 生物 ──
    {"category": "医药/生物", "name": "执业药师", "issuer": "人社部/药监局", "type": "certificate", "link": "https://www.cpta.com.cn/", "desc": "医药零售、药企合规岗位必备执业证书"},
    {"category": "医药/生物", "name": "GMP 内审员证书", "issuer": "重庆药协体系", "type": "certificate", "link": "https://www.cqpa.org.cn/", "desc": "制药企业质量合规岗位行业认证"},
]

CATEGORIES: list[str] = []
for _it in CERT_CATALOG:
    if _it["category"] not in CATEGORIES:
        CATEGORIES.append(_it["category"])
