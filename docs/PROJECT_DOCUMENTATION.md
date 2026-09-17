# 智能简历优化系统 · 项目文档

> 本文档基于真实代码、配置与现存文档整理而成。代码为唯一事实来源（source of truth）；凡文档与代码冲突，以代码为准并已标注。
> 编写日期：2026-09-12 ｜ 适用读者：新入职开发 / 维护者 / 测试 / 运维
> 项目根目录：`D:\下载\智能简历 - 副本 (2)`

---

## 目录

1. [项目概述](#1-项目概述)
2. [快速开始](#2-快速开始)
3. [技术栈](#3-技术栈)
4. [目录结构](#4-目录结构)
5. [系统架构](#5-系统架构)
6. [模块说明](#6-模块说明)
7. [核心流程](#7-核心流程)
8. [数据模型](#8-数据模型)
9. [API 接口](#9-api-接口)
10. [配置与环境变量](#10-配置与环境变量)
11. [构建 / 测试 / 部署](#11-构建--测试--部署)
12. [开发指南](#12-开发指南)
13. [可观测性](#13-可观测性)
14. [安全](#14-安全)
15. [常见问题（FAQ）](#15-常见问题faq)
16. [已知限制与技术债](#16-已知限制与技术债)
17. [附录](#17-附录)

---

## 1. 项目概述

**智能简历优化系统**是一套面向求职者的简历智能优化平台：用户上传简历（PDF / 图片 / 文档），系统解析内容、结合目标岗位 JD 调用大语言模型（LLM）进行优化与匹配分析，并渲染生成精美排版的优化后简历（PDF / Word）。系统同时提供 ATS 兼容性检测、面试模拟、岗位匹配度评分、批量优化、反馈闭环等能力。

- **定位**：SaaS 化的个人简历优化工具（含管理员后台、配额/套餐、工单支持）。
- **形态**：前后端分离。后端 FastAPI（Python 3.12），前端 Next.js 14（React 18 + Ant Design 5）。
- **存储**：PostgreSQL 16（JSONB 承载半结构化字段）、Redis 7（任务状态 + 限流计数器）。
- **智能层**：OpenAI 兼容协议的 LLM API（文本与视觉共用同一模型）。

### 1.1 核心能力一览

| 能力 | 入口模块（代码依据） | 状态 |
| --- | --- | --- |
| 简历解析（PDF/图片/文档 → 结构化文本） | `app/services/resume_parser.py` | 已接入（视觉模型 + PaddleOCR 兜底） |
| 简历智能优化 | `app/api/optimization.py` + `app/services/agent_optimizer.py` | 已接入 |
| 岗位 JD 解析 | `app/services/job_parser.py` | 已接入 |
| 人岗匹配度分析 | `app/api/matching.py` | 已接入（前端 `match/page.tsx` 调用） |
| ATS 兼容性检测 | `app/api/ats.py` | 已接入 |
| 面试模拟 | `app/api/interview.py` | 已接入 |
| 批量优化 | `app/api/batch.py` | 已接入（前端 `batch/page.tsx` 调用） |
| 优化后 PDF/Word 渲染 | `app/services/pdf_generator.py`（三档降级） | 已接入 |
| 模型路由 / 提示词模板（管理员配置） | `app/services/model_router.py`、`prompt_templates` 表 | **已建表但未接入优化链路** |
| CI/CD | — | **未发现** |

### 1.2 成熟度评估

参考 `诊断与优化方案.md`（2026-09-11，自评成熟度 3.5/10）。其中部分结论已过时，本文档在第 16 节据代码实际状态做了更正：

- 仍准确：无 CI/CD；可观测性仅日志（无指标/链路/告警/APM）；`.env.example` 含真实密钥（见 §10.5）。
- 已更正：优化链路 `temperature` 实际已设为 `0.2`（`agent_optimizer.py`）；PII 加密已接入（`resumes.py` 对 `raw_text` 加密）；前端实际已调用优化/批量/匹配接口（见 §9、§7）。

---

## 2. 快速开始

### 2.1 前置依赖

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Python | 3.12 | 后端运行时（Windows 开发用 `.venv`） |
| Node.js | 18+（实测 22.22.2 可用） | 前端运行时 |
| PostgreSQL | 16（建议 `postgres:16-alpine`） | 主库，库名 `smart_resume` |
| Redis | 7（建议 `redis:7-alpine`） | 任务状态 / 限流 |
| Redis（Windows 本地） | 3.0.504 | 见 §2.3 本地开发说明 |

### 2.2 方式 A：Docker Compose（推荐，零本地依赖）

```bash
# 1) 在项目根目录准备环境变量
cp backend/.env.example backend/.env
#   ⚠️ 见 §10.5：.env.example 内含真实密钥，请立即替换为自己的密钥后再提交

# 2) 启动全套服务（db / redis / backend / celery_worker / frontend）
docker compose -f docker/docker-compose.yml up -d --build

# 3) 健康检查
curl http://127.0.0.1:8000/health
```

默认暴露端口：后端 `8000`，前端 `3000`（以 `frontend/next.config.js` 的 rewrites 与 compose 端口映射为准）。

### 2.3 方式 B：本地手动启动（Windows 开发机）

> 注意：本机为 Windows，没有 Redis Windows 服务也没有 Docker。需手动启动 Redis 后再启动后端。

```bash
# ① 启动 Redis（手动，不要后台 & 启动，否则 shell 退出后被回收）
"D:\Redis-x64-3.0.504\redis-server.exe" --port 6379

# ② 后端虚拟环境（Python 3.12）
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# ③ 配置环境变量
cp .env.example .env        # 同样需替换真实密钥

# ④ 启动后端（已处理 Windows ProactorEventLoop）
python run.py               # 监听 127.0.0.1:8000

# ⑤ 另开终端启动前端
cd ../frontend
npm install
npm run dev                 # 默认 3000
```

> 便捷脚本：仓库根目录 `restart_backend.bat` 封装了「启动 Redis → 启动后端」流程，可直接双击或命令行调用。健康检查：`GET /health`。

### 2.4 最小验证

```bash
# 健康检查
curl -s http://127.0.0.1:8000/health

# 注册 → 登录 → 上传简历（示例，详见 §9）
curl -s -X POST http://127.0.0.1:8000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"phone":"13800000000","code":"123456","password":"test1234"}'
```

---

## 3. 技术栈

### 3.1 后端

| 类别 | 选型 | 代码依据 |
| --- | --- | --- |
| Web 框架 | FastAPI | `backend/app/main.py` |
| 应用服务器 | Uvicorn | `backend/run.py` |
| ORM | SQLAlchemy 2.0（async） | `backend/requirements.txt` / `app/db/session.py` |
| DB 驱动 | asyncpg | `requirements.txt` |
| 数据库 | PostgreSQL 16（JSONB） | `docker/docker-compose.yml` `db` 服务 |
| 缓存 / 队列状态 | Redis 7 | `app/core/deps.py` `get_redis` |
| 异步任务 | Celery（已声明，API 未使用） | `backend/celery_worker.py` |
| 鉴权 | JWT（python-jose，HS256） | `app/core/security.py` |
| 密码哈希 | bcrypt / passlib | `app/core/security.py` |
| LLM SDK | openai（AsyncOpenAI，兼容协议） | `app/services/agent_optimizer.py` |
| PDF 渲染 | Playwright/Chromium → WeasyPrint → ReportLab（三档降级） | `app/services/pdf_generator.py` |
| PDF 解析 | PyMuPDF | `requirements.txt` |
| OCR | PaddleOCR（默认关闭 `USE_LOCAL_OCR=false`） | `app/services/resume_parser.py` |
| 加密 | AES-256-CBC（密钥派生自 `SECRET_KEY`） | `app/core/crypto.py` |
| 模版 | Jinja2 | `requirements.txt` |
| 迁移 | Alembic | `alembic.ini` / `backend/alembic/` |

### 3.2 前端

| 类别 | 选型 | 代码依据 |
| --- | --- | --- |
| 框架 | Next.js 14（App Router） | `frontend/package.json` `next: 14.2` |
| UI | Ant Design 5.17 | `package.json` `antd` |
| 语言 | React 18.3 + TypeScript | `package.json` |
| 请求 | axios 1.7 | `frontend/src/lib/api.ts` |
| 图表 | echarts | `package.json` |
| Diff | diff | 优化前后对比 |
| 上传 | react-dropzone | `package.json` |
| 构建 | `output: 'standalone'` | `frontend/next.config.js` |

### 3.3 大模型

- 接入方式：OpenAI 兼容协议（`base_url` + `api_key`）。
- 默认模型（运行时实际值）：文本与视觉共用 `mimo-v2.5-pro`（小米 MiMo，经 `token-plan-cn.xiaomimimo.com/v1`）。
- 配置默认值（见 `app/config.py`）：`LLM_MODEL_TEXT="gpt-4o-mini"`、`LLM_MODEL_VISION="gpt-4o"`（仅默认值，真实部署以 `.env` 覆盖）。
- 温度：**`temperature=0.2`**（硬编码于 `agent_optimizer.py` 的 `_call_with_retry`）。

---

## 4. 目录结构

```
智能简历 - 副本 (2)/
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── main.py              # 入口，注册 18 个路由前缀
│   │   ├── config.py            # Settings(BaseSettings)，env_file=".env"
│   │   ├── run.py               # 启动入口（Windows ProactorEventLoop 处理）
│   │   ├── db/                  # 连接、会话、基类
│   │   ├── models/              # ORM 模型（23+ 表）
│   │   ├── schemas/             # Pydantic 请求/响应模型
│   │   ├── api/                 # 路由层（auth/resumes/jobs/optimization/...）
│   │   ├── services/            # 业务服务（解析/优化/存储/模型路由/...）
│   │   ├── core/                # security / deps / crypto / errors / file_security / log_filter
│   │   └── templates/           # PDF 渲染 Jinja2 模板
│   ├── celery_worker.py         # Celery app + process_optimization 任务（API 未调用）
│   ├── requirements.txt
│   ├── Dockerfile               # python:3.12-slim，安装 pango/cairo，HEALTHCHECK /health
│   ├── .env.example             # ⚠️ 含真实密钥（见 §10.5）
│   └── alembic/                 # 迁移脚本
├── frontend/                    # Next.js 14 前端
│   ├── src/
│   │   ├── lib/api.ts           # axios 客户端 + 全部接口封装
│   │   ├── app/                 # 页面（resumes/jobs/match/batch/...）
│   │   └── components/
│   ├── package.json
│   └── next.config.js           # output:'standalone'，/api 反向代理
├── docker/
│   ├── docker-compose.yml       # db/redis/backend/celery_worker/frontend
│   └── *.conf
├── public.sql                   # 数据库初始化 SQL（含 23+ 表）
├── 补充测试数据.sql
├── docs/                        # 本文档
├── README.md / spec.md          # 设计文档（部分与代码冲突，以代码为准）
├── 现有功能.md / 诊断与优化方案.md / 项目功能总结.md / 运行与完善.md / 智能简历优化系统功能概述.md
└── restart_backend.bat          # Windows 一键启动脚本
```

> 扫描时已忽略 `node_modules/`、`.git/`、`dist/`、`build/`、`vendor/`、`target/`、`coverage/`、`.venv/`（含 pip 包，不计入源码分析）。

---

## 5. 系统架构

### 5.1 分层架构

```mermaid
flowchart TB
    subgraph Client["客户端"]
        FE[Next.js 14 前端<br/>Ant Design 5 + axios]
    end
    subgraph API["API 层 (FastAPI)"]
        GW[main.py 路由网关<br/>JWT 鉴权 / 限流]
        AUTH[auth]
        RES[resumes/jobs]
        OPT[optimization]
        MATCH[matching/batch/ats]
        ADM[admin/files/export]
    end
    subgraph SVC["服务层"]
        PARSER[resume_parser / job_parser<br/>视觉+OCR]
        AGENT[agent_optimizer<br/>LLM 优化/匹配]
        PDF[pdf_generator<br/>三档降级]
        STORE[storage<br/>签名代理 URL]
        MR[model_router ⚠️未接入]
    end
    subgraph EXT["外部 / 基础设施"]
        LLM[(LLM API<br/>mimo-v2.5-pro)]
        PG[(PostgreSQL 16)]
        RD[(Redis 7<br/>任务状态/限流)]
        UP[本地 uploads/<br/>或 S3]
    end

    FE -->|HTTPS /api| GW
    GW --> AUTH & RES & OPT & MATCH & ADM
    RES --> PARSER --> LLM
    OPT --> AGENT --> LLM
    OPT --> PDF
    ADM --> STORE
    SVC --> PG
    SVC --> RD
    STORE --> UP
```

### 5.2 关键架构决策

- **异步优先**：API 全面 async（SQLAlchemy async + asyncpg + `AsyncOpenAI`），避免阻塞事件循环。
- **任务执行**：`optimization.py` 的 `/async` 走 `asyncio.create_task` + Redis 轮询返回状态，**未走 Celery**（`celery_worker.py` 的 `process_optimization` 任务已定义但 API 未调用）。
- **PII 保护**：后端**不挂载** `/uploads` 静态目录；文件通过 `storage.py` 生成 HMAC 签名代理 URL（`/api/files/{key}?exp=&sig=`）访问，`raw_text` 入库前 AES 加密，日志经 `log_filter.py` 脱敏。
- **本地优先**：默认存储 `uploads/`（S3 未配置）；默认 OCR 关闭（`USE_LOCAL_OCR=false`）。
- **自愈降级**：无有效 LLM Key 时 `agent_optimizer.py` 走 Mock 兜底；PDF 渲染 Playwright→WeasyPrint→ReportLab 三档降级。

---

## 6. 模块说明

### 6.1 入口与生命周期

- `app/main.py`：`lifespan` 启动时 `Base.metadata.create_all` 建表（开发期自动建表，生产建议用 Alembic）+ 安装敏感日志过滤器；注册 18 个路由前缀（auth / user / messages / resumes / jobs / optimization / scoring / feedback / matching / batch / refine / admin / files / export / ats / insights / interview / search）。**不挂载 `/uploads` 静态目录**。
- `app/run.py`：Uvicorn 启动，处理 Windows `ProactorEventLoop`。

### 6.2 鉴权与用户（`auth` / `user`）

- `app/core/security.py`：bcrypt 哈希；`create_access_token` / `create_refresh_token`（JWT HS256，载荷含 `sub`/`type`/`device_id`）。
- `app/core/deps.py`：`get_current_user`（HTTPBearer）、`RateLimiter`（Redis 滑动窗口）、`get_redis`（单例，max_connections=50）。
- `app/api/auth.py`：send-code / register / login / refresh / logout / forgot-password / change-password / devices（设备管理）/ bind-phone / delete-account（30 天冻结）。
- `user_quotas` 控制配额（默认每用户最多 `MAX_RESUMES=10` 份简历，`resumes.py`）。

### 6.3 简历与岗位（`resumes` / `jobs`）

- 上传流程：文件魔数校验（`file_security.validate_file_magic`，支持 PDF/DOCX/PNG/JPG/WEBP）→ 页数上限（`validate_pdf_pages`，≤50）→ 解析（`resume_parser`）→ `raw_text` AES 加密入库（`crypto.encrypt_field`）。
- 列表 / 统计 / 收藏 / 回收站（trash/restore）/ CRUD。
- `jobs`：JD 图片解析（`job_parser.py`，视觉模型 + PaddleOCR 兜底）。

### 6.4 优化与匹配（`optimization` / `matching` / `batch` / `ats` / `scoring`）

- `app/api/optimization.py`：
  - `POST /` 同步优化
  - `POST /async` 返回 `task_id`，`asyncio.create_task` + Redis 轮询
  - `POST /quick` 快速优化
  - `POST /render` 渲染 PDF
  - `GET /{id}/diff` 前后对比
  - `GET /{id}/content` 编辑器内容
  - `POST /{id}/feedback` 反馈
  - `POST /{id}/reexport` 重新导出
  - `POST /test-template` Mock 数据（测试用）
- `app/services/agent_optimizer.py`：`analyze_match` / `optimize_resume` / `generate_changes_description`；`_call_with_retry`（3 次重试，`response_format` 自动降级）；无 Key 走 Mock。
- `matching` / `batch` / `ats` / `scoring`：匹配度、批量优化、ATS 检测、评分（详情见 §9）。

### 6.5 存储与文件（`files` / `storage`）

- `app/services/storage.py`：`upload_bytes` → `_sign_key(key)` 生成 HMAC 签名代理 URL（`{BACKEND_URL}/api/files/{key}?exp=&sig=`）。本地 `uploads/` 默认；S3 未配置。

### 6.6 管理与支撑（`admin` / `feedback` / `insights` / `interview` / `search` / `export`）

- 管理员：提示词模板、模型路由、行业关键词、ATS 规则、工单（support_tickets / ticket_replies）、订单（orders）、配额套餐（quota_packages）管理。
- 审计：`audit_logs` / `admin_logs` / `ai_model_call_logs`。
- 面试：`interview_sessions` / `interview_questions`。

### 6.7 已建但未接入（技术债，详见 §16）

- `app/services/model_router.py`（`route_model` / `record_model_call` / 熔断）→ 优化/解析链路直接用 `settings.LLM_MODEL_TEXT`，**未调用** `model_router`。
- 提示词模板（`prompt_templates` 表 + `prompt_service`）→ **未接入**优化链路。

---

## 7. 核心流程

### 7.1 上传 → 解析 → 优化 → 渲染

```mermaid
sequenceDiagram
    participant U as 用户(前端)
    participant A as optimization/resumes API
    participant P as resume_parser
    participant LLM as LLM API
    participant C as crypto/storage
    participant DB as PostgreSQL
    participant R as Redis
    participant G as pdf_generator

    U->>A: POST /api/resumes/upload (文件)
    A->>A: validate_file_magic + validate_pdf_pages
    A->>P: 解析(PyMuPDF/视觉/OCR)
    P->>LLM: 视觉理解(图片/扫描件)
    P-->>A: 结构化文本
    A->>C: encrypt_field(raw_text)
    A->>DB: 写入 resumes(加密)
    U->>A: POST /api/optimization/async (resume_id, job_id)
    A->>R: 写入 task 状态=processing
    A->>LLM: agent_optimizer.optimize_resume(temperature=0.2)
    LLM-->>A: 优化结果
    A->>DB: 写入 optimized_resumes
    A->>R: task 状态=done
    U->>A: 轮询/GET 状态
    U->>A: POST /api/optimization/render
    A->>G: 三档降级渲染 PDF
    G-->>U: 签名代理 URL 下载
```

### 7.2 鉴权流程（双 Token）

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as /api/auth
    participant S as security(JWT)
    participant DB as PostgreSQL
    U->>A: send-code → register → login
    A->>S: create_access_token(2h) + create_refresh_token(7d)
    S-->>U: access + refresh
    U->>A: 携带 Bearer access 调用业务接口
    A->>A: get_current_user 校验
    Note over U,A: access 过期 → refresh 换取新 access
    U->>A: logout / devices 解绑(设备管理)
```

### 7.3 异步优化任务

- `POST /api/optimization/async` 立即返回 `task_id`。
- 服务端 `asyncio.create_task` 执行优化，状态写 Redis（processing → done / failed）。
- 前端轮询（或据实现拉取）任务状态，完成后调用 `/render` 生成 PDF/Word。
- ⚠️ 注意：此处**未使用 Celery**（`celery_worker.py` 的 `process_optimization` 仅声明，未被 API 引用）。

---

## 8. 数据模型

> 依据 `public.sql` + ORM 模型，共 **23+** 张表。以下为关键表与职责（字段以 `public.sql` 为准，本文不逐字段罗列，避免与表结构漂移）。

| 表名 | 职责 | 关联模块 |
| --- | --- | --- |
| `users` | 用户账户（手机/密码哈希/状态） | auth / user |
| `user_devices` | 设备管理与绑定 | auth |
| `messages` | 站内消息 | messages |
| `audit_logs` | 用户操作审计 | 全局 |
| `resume_templates` | 简历模板 | 渲染 |
| `user_quotas` | 用户配额 | resumes / quotas |
| `resumes` | 简历主表（`raw_text` 加密） | resumes |
| `job_images` | 岗位 JD 图片 | jobs |
| `optimized_resumes` | 优化结果 | optimization |
| `verification_codes` | 验证码 | auth |
| `feedbacks` | 优化反馈 | feedback |
| `batch_optimizations` | 批量任务 | batch |
| `batch_job_tasks` | 批量子任务 | batch |
| `admins` | 管理员 | admin |
| `admin_logs` | 管理员操作日志 | admin |
| `prompt_templates` | 提示词模板（**未接入**） | admin / model_router |
| `model_routing` | 模型路由规则（**未接入**） | admin / model_router |
| `ai_model_call_logs` | LLM 调用日志 | observability |
| `industry_keywords` | 行业关键词 | admin / scoring |
| `ats_rules` | ATS 规则 | ats |
| `orders` | 订单 | admin / 支付 |
| `support_tickets` / `ticket_replies` | 工单 / 回复 | 支撑 |
| `quota_packages` | 配额套餐 | admin |
| `interview_sessions` / `interview_questions` | 面试会话 / 题目 | interview |

> JSONB 用法：半结构化字段（如优化建议、匹配明细、模板配置）以 JSONB 存储，充分利用 PG16 的 JSONB 索引/查询能力。

### 8.1 关键关系

- `users` 1—N `resumes` / `user_devices` / `user_quotas` / `audit_logs`。
- `resumes` 1—N `optimized_resumes`（含 diff）。
- `resumes` / `jobs` → `optimization` / `matching` / `ats`。
- `batch_optimizations` 1—N `batch_job_tasks`（每个子任务对应一次优化）。

---

## 9. API 接口

> 统一前缀 `/api`。鉴权接口用 Bearer access token（HTTPBearer）。以下为已实现路由（依据 `main.py` 注册 + 各 `api/*.py`）。

| 路由前缀 | 关键端点 | 方法 | 说明 | 代码依据 |
| --- | --- | --- | --- | --- |
| `auth` | `/auth/register` | POST | 手机+验证码注册 | `api/auth.py` |
| | `/auth/login` | POST | 登录（双 token） | `api/auth.py` |
| | `/auth/refresh` | POST | 刷新 access | `api/auth.py` |
| | `/auth/logout` | POST | 登出 | `api/auth.py` |
| | `/auth/send-code` | POST | 发验证码 | `api/auth.py` |
| | `/auth/forgot-password` / `change-password` | POST | 找回/改密 | `api/auth.py` |
| | `/auth/devices` | GET/DELETE | 设备管理 | `api/auth.py` |
| | `/auth/bind-phone` / `delete-account` | POST | 绑手机 / 注销(30天冻结) | `api/auth.py` |
| `user` | `/user/me` | GET | 当前用户 | `api/user.py` |
| `messages` | `/messages` | GET | 站内消息 | `api/messages.py` |
| `resumes` | `/resumes/upload` | POST | 上传+解析+加密 | `api/resumes.py` |
| | `/resumes` | GET | 列表 | `api/resumes.py` |
| | `/resumes/{id}` | GET/PUT/DELETE | CRUD | `api/resumes.py` |
| | `/resumes/stats` / `favorites` / `trash` | GET/POST | 统计/收藏/回收站 | `api/resumes.py` |
| `jobs` | `/jobs` / `/jobs/upload` | GET/POST | JD 管理/解析 | `api/jobs.py` |
| `optimization` | `/optimization/` | POST | 同步优化 | `api/optimization.py` |
| | `/optimization/async` | POST | 异步优化(返回 task_id) | `api/optimization.py` |
| | `/optimization/quick` | POST | 快速优化 | `api/optimization.py` |
| | `/optimization/render` | POST | 渲染 PDF | `api/optimization.py` |
| | `/optimization/{id}/diff` | GET | 前后对比 | `api/optimization.py` |
| | `/optimization/{id}/content` | GET | 编辑器内容 | `api/optimization.py` |
| | `/optimization/{id}/feedback` | POST | 反馈 | `api/optimization.py` |
| | `/optimization/{id}/reexport` | POST | 重新导出 | `api/optimization.py` |
| | `/optimization/test-template` | POST | Mock 模板(测试) | `api/optimization.py` |
| `matching` | `/matching/...` | POST | 人岗匹配度 | `api/matching.py` |
| `batch` | `/batch/optimize` | POST | 批量优化 | `api/batch.py` |
| `ats` | `/ats/...` | POST | ATS 兼容性检测 | `api/ats.py` |
| `scoring` | `/scoring/...` | POST | 评分 | `api/scoring.py` |
| `feedback` | `/feedback/...` | POST | 反馈聚合 | `api/feedback.py` |
| `refine` | `/refine/...` | POST | 精炼改写 | `api/refine.py` |
| `admin` | `/admin/...` | 多 | 管理后台 | `api/admin.py` |
| `files` | `/files/{key}` | GET | 签名代理下载 | `api/files.py` + `storage.py` |
| `export` | `/export/...` | POST | 导出 Word 等 | `api/export.py` |
| `insights` | `/insights/...` | GET | 数据洞察 | `api/insights.py` |
| `interview` | `/interview/...` | POST | 面试模拟 | `api/interview.py` |
| `search` | `/search/...` | GET | 搜索 | `api/search.py` |

> 前端实际调用点（已核实，反驳陈旧诊断文档）：`frontend/src/lib/api.ts` 封装了 `optimize.runAsync` / `optimize.quick` / `batch.optimize` / `matching` 等；页面 `match/page.tsx`、`batch/page.tsx` 均有调用。

### 9.1 错误码

`app/core/errors.py` 用 `app_err(code)` 返回中文错误码，例如：`RESUME_NOT_FOUND`、`FILE_TOO_LARGE`、`PARSE_BEFORE_OPTIMIZE`（需先解析再优化）、`QUOTA_EXCEEDED`（配额超限）等。

---

## 10. 配置与环境变量

### 10.1 加载机制

`app/config.py` 的 `Settings(BaseSettings)` 以 `.env` 为 `env_file`（位于 `backend/.env`）。所有配置项均可在环境变量覆盖。

### 10.2 关键配置项

| 变量 | 默认值（config.py） | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:root@localhost:5432/smart_resume` | 异步 PG 连接串 |
| `REDIS_URL` | （见 `.env`） | Redis 连接 |
| `SECRET_KEY` | `change-me-in-production` | JWT + AES 密钥派生源（**生产必须改**） |
| `LLM_API_KEY` | （见 `.env`） | LLM 密钥 |
| `LLM_API_BASE` | `https://token-plan-cn.xiaomimimo.com/v1` | OpenAI 兼容 base_url |
| `LLM_MODEL_TEXT` | `gpt-4o-mini` | 文本模型（实际部署 `mimo-v2.5-pro`） |
| `LLM_MODEL_VISION` | `gpt-4o` | 视觉模型 |
| `MAX_UPLOAD_SIZE` | 20MB | 上传上限 |
| `FILE_URL_TTL` | 30 天 | 签名代理 URL 有效期 |
| `USE_LOCAL_OCR` | `false` | 是否启用 PaddleOCR |
| `CELERY_BROKER_URL` | （见 `.env`） | Celery broker（API 未使用） |
| `BACKEND_URL` | （见 `.env`） | 签名 URL 域名 |

### 10.3 配置最佳实践

- 生产环境 `SECRET_KEY` 必须替换为高强度随机值，且与 `.env` 同密钥用于 `crypto.py` 派生 AES 密钥——**改密钥会导致历史加密 `raw_text` 无法解密**，迁移时需先解密再重加密。
- `DATABASE_URL` / `REDIS_URL` / `LLM_API_KEY` 等敏感项**只放 `.env`，禁止提交仓库**（见 §10.5）。
- 存储切换 S3：配置 S3 相关变量后 `storage.py` 改为对象存储（当前 `public.sql`/默认均未配置 S3）。

### 10.4 端口与代理

- 前端 `next.config.js`：`output: 'standalone'`，`rewrites` 将 `/api/:path*` 代理到 `NEXT_PUBLIC_API_URL`。
- 后端健康：`GET /health`（`Dockerfile` HEALTHCHECK 引用）。

### 10.5 ⚠️ 密钥泄露风险（必须处理）

**`backend/.env.example` 当前包含真实可用凭证**（非占位符），属高危风险：

- `LLM_API_KEY=`（真实 MiMo key）
- `SMTP_PASSWORD=`（真实 QQ 邮箱授权码）
- `LLM_API_BASE` / `SMTP_USER` 等

> **处理要求**：本文档**不复现任何真实密钥值**。请立即：
> 1. 在对应平台（MiMo token 平台、QQ 邮箱）**轮换/作废**这些密钥；
> 2. 将 `.env.example` 改为占位符（如 `LLM_API_KEY=__REPLACE_ME__`），真实值仅留本地 `.env`（已 gitignore）；
> 3. 若仓库历史已提交过真实密钥，需用 `git filter-repo` / BFG 清理历史并强制轮换。
> 4. 补充 `.env` 到 `.gitignore`（如尚未忽略）。

---

## 11. 构建 / 测试 / 部署

### 11.1 构建

- 后端镜像：`backend/Dockerfile`（`python:3.12-slim`，安装 pango/cairo 供 WeasyPrint，HEALTHCHECK `/health`）。
- 前端：`next build` + `output: 'standalone'`（产物自包含，适合容器）。

```bash
# 后端镜像
docker build -t smart-resume-backend ./backend

# 前端构建
cd frontend && npm run build
```

### 11.2 测试

- **未发现**自动化测试套件与 CI 配置（无 `.github/workflows`、无 `pytest` 配置、无 `tox.ini`）。
- 现有可手动验证入口：`/health` 健康检查；`optimization/test-template` Mock 接口。
- 建议（非现状）：补充 `pytest` + `pytest-asyncio`，覆盖 `crypto` / `file_security` / `agent_optimizer` Mock 分支 / `storage` 签名。

### 11.3 部署

- 推荐：`docker/docker-compose.yml` 一键起 db/redis/backend/celery_worker/frontend。
- 数据库初始化：`public.sql` + `补充测试数据.sql`（开发/演示数据）。
- 生产注意：
  - 反向代理（Nginx）终止 TLS，转发 `/api` 与 `/`（前端）。
  - 限流依赖 Redis，请确保 Redis 可用，否则 `RateLimiter` 报错（见 §14）。
  - 文件下载走签名代理 URL，无需对外暴露对象存储。

---

## 12. 开发指南

### 12.1 本地调试（Windows）

见 §2.3。关键点：先启 Redis（手动），再 `python run.py`；开发期 `Base.metadata.create_all` 自动建表。

### 12.2 新增一个 API 模块

1. 在 `backend/app/api/` 新建 `xxx.py`（`APIRouter`）。
2. 在 `backend/app/main.py` 的 `lifespan`/路由注册处 `app.include_router(xxx.router, prefix="/api/xxx", tags=["xxx"])`。
3. 如需鉴权：`from app.core.deps import get_current_user` 作依赖。
4. 如需限流：用 `RateLimiter`（Redis 滑动窗口）。
5. 如需 DB：`from app.db.session import get_db`（async）。

### 12.3 调用 LLM 的规范

- 统一走 `app/services/agent_optimizer.py` 的 `_call_with_retry`（3 次重试 + `response_format` 自动降级）。
- 无有效 Key 自动 Mock，避免本地无网时崩溃。
- 温度固定 `0.2`（如业务需调整，改 `agent_optimizer.py` 并同步文档）。
- ⚠️ 若要启用模型路由/熔断，需把 `model_router.route_model` 接入 `agent_optimizer`（当前未接，见 §16）。

### 12.4 前端对接

- 所有接口封装在 `frontend/src/lib/api.ts`；新增接口请在此集中维护。
- 跨域/代理由 `next.config.js` rewrites 处理，前端只调 `/api/...`。

---

## 13. 可观测性

| 维度 | 现状 | 缺口 |
| --- | --- | --- |
| 日志 | 有（`log_filter.py` 脱敏；`/health` 之外有请求日志） | 无结构化/集中采集 |
| 指标（Metrics） | **未发现** | 无 Prometheus/StatsD |
| 链路追踪（Tracing） | **未发现** | 无 OpenTelemetry |
| 告警（Alerting） | **未发现** | 无 |
| APM | **未发现** | 无 |
| LLM 调用审计 | `ai_model_call_logs` 表已建 | 写入点待确认是否全量覆盖 |
| 审计日志 | `audit_logs` / `admin_logs` | 仅记录，无看板 |

> 结论：当前可观测性**仅日志层**，缺指标/链路/告警。生产环境强烈建议补 Promethes + OTel + 日志聚合（Loki/ELK）。

---

## 14. 安全

### 14.1 已实现的安全控制

| 控制 | 实现位置 | 说明 |
| --- | --- | --- |
| 密码哈希 | `core/security.py`（bcrypt） | 入库仅存哈希 |
| JWT 双 Token | `core/security.py`（HS256） | access 2h + refresh 7d，含 `device_id` |
| 设备管理 | `auth.py` / `user_devices` | 可解绑设备 |
| 文件魔数校验 | `core/file_security.py` | 防伪装扩展名上传 |
| PDF 页数上限 | `core/file_security.py` | ≤50 页 |
| PII 加密 | `core/crypto.py`（AES-256-CBC） | `raw_text` 入库前加密 |
| 日志脱敏 | `core/log_filter.py` | 手机号/邮箱掩码（PIPL） |
| 文件不公开 | `main.py` 不挂 `/uploads` | 经签名代理 URL 访问 |
| 签名代理 URL | `services/storage.py` | HMAC + TTL |
| 限流 | `core/deps.py` `RateLimiter` | Redis 滑动窗口 |
| 中文错误码 | `core/errors.py` | 不泄露内部细节 |

### 14.2 风险与待办

1. **🔴 高危**：`backend/.env.example` 含真实密钥（见 §10.5），须立即轮换 + 改占位符。
2. **🟠 中危**：`SECRET_KEY` 默认值 `change-me-in-production`，生产若未改，JWT 与 AES 均可被伪造/解密。
3. **🟠 中危**：限流依赖 Redis；Redis 不可用时 `RateLimiter` 会抛错，需降级策略（当前未确认）。
4. **🟡 低危**：`delete-account` 为 30 天冻结，需确认是否有定时清理任务（celery_worker 未启用，可能无自动清理）。
5. **🟡 低危**：CORS / HTTPS 终止依赖部署层，文档未固化配置，建议明确。

---

## 15. 常见问题（FAQ）

**Q1：`/api/auth/login` 返回 500？**
A：多为 Redis 未启动（`RateLimiter`/`get_redis` 连接被拒）。先启 Redis（见 §2.3），再启后端，`curl /health` 验证。

**Q2：本地启动后端后进程没了？**
A：Windows 下用 `&` 后台启动会被 shell 退出回收；请用 `restart_backend.bat` 或 `run_in_background`/nohup。

**Q3：没有 LLM Key 能跑吗？**
A：能。`agent_optimizer.py` 在无有效 Key 时走 Mock 兜底，可用于联调 UI 与流程。

**Q4：OCR 为什么没生效？**
A：默认 `USE_LOCAL_OCR=false`。需置 `true` 并安装 PaddlePaddle/PaddleOCR（重量级依赖，默认关闭以减小镜像）。

**Q5：模型路由 / 提示词模板在哪用？**
A：已建表与管理界面，但**未接入**优化/解析链路（见 §16）。当前模型由 `settings.LLM_MODEL_TEXT` 直接决定。

**Q6：文件怎么下载？**
A：不直接暴露 `/uploads`；通过 `storage.py` 生成的签名代理 URL（`/api/files/{key}?exp=&sig=`）。

**Q7：数据库表怎么来？**
A：开发期 `lifespan` 自动 `create_all`；也可执行 `public.sql`。生产建议用 Alembic 迁移。

---

## 16. 已知限制与技术债

| # | 项 | 现状（代码事实） | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | 模型路由未接入 | `model_router.py` 已建但 `agent_optimizer` 直接用 `settings.LLM_MODEL_TEXT` | 无法按成本/可用性的动态路由与熔断 | 在 `_call_with_retry` 前接入 `route_model` |
| 2 | 提示词模板未接入 | `prompt_templates` 表 + `prompt_service` 未进入优化链路 | 管理员无法在线调提示词 | 将模板注入 `agent_optimizer` |
| 3 | Celery 被绕过 | `celery_worker.py` 的 `process_optimization` 未由 API 调用，API 用 `asyncio.create_task` | 进程重启丢失任务、无分布式队列 | 统一到 Celery 或显式文档化"进程内任务"取舍 |
| 4 | 无 CI/CD | 无 workflow/测试配置 | 回归风险高 | 加 GitHub Actions：lint + pytest + build |
| 5 | 可观测性仅日志 | 无 metrics/tracing/alerting | 生产难排障 | 加 Prometheus + OTel + 日志聚合 |
| 6 | `.env.example` 含真实密钥 | 高风险泄露 | 凭证被盗用 | 立即轮换 + 改占位符（§10.5） |
| 7 | 文档与代码冲突 | `诊断与优化方案.md` 部分结论过时 | 误导维护者 | 以本文档为准；陈旧诊断文档标注日期待复核 |
| 8 | 删除账户无自动清理 | `delete-account` 30 天冻结，celery 未启用 | 冻结数据可能永不清理 | 启用清理任务或改为同步清理 |

### 16.1 与陈旧诊断文档的更正对照

| 陈旧结论（`诊断与优化方案.md`） | 代码实际 | 更正 |
| --- | --- | --- |
| "temperature 从未设置" | `agent_optimizer.py` 设 `0.2` | 已设置 |
| "crypto 零接入" | `resumes.py` 对 `raw_text` 加密 | 已接入 |
| "前端零调用优化" | `api.ts`/`match/page.tsx`/`batch/page.tsx` 调用 | 已调用 |

---

## 17. 附录

### 17.1 关键命令速查

```bash
# 健康检查
curl http://127.0.0.1:8000/health

# 手动启 Redis（Windows）
"D:\Redis-x64-3.0.504\redis-server.exe" --port 6379

# 后端（虚拟环境）
cd backend && .venv\Scripts\activate && python run.py

# 前端
cd frontend && npm install && npm run dev

# 一键（Windows）
restart_backend.bat

# 容器化
docker compose -f docker/docker-compose.yml up -d --build
```

### 17.2 关键文件索引

| 关注点 | 文件 |
| --- | --- |
| 入口/路由注册 | `backend/app/main.py` |
| 配置 | `backend/app/config.py`、`.env.example` |
| 启动 | `backend/run.py` |
| 鉴权 | `backend/app/core/security.py`、`deps.py` |
| 加密/脱敏 | `backend/app/core/crypto.py`、`log_filter.py` |
| 文件安全 | `backend/app/core/file_security.py` |
| 错误码 | `backend/app/core/errors.py` |
| 解析 | `backend/app/services/resume_parser.py`、`job_parser.py` |
| 优化 | `backend/app/services/agent_optimizer.py` |
| 存储 | `backend/app/services/storage.py` |
| PDF | `backend/app/services/pdf_generator.py` |
| 模型路由（未接） | `backend/app/services/model_router.py` |
| 优化路由 | `backend/app/api/optimization.py` |
| 前端接口 | `frontend/src/lib/api.ts` |
| DB 初始化 | `public.sql`、`补充测试数据.sql` |
| 容器 | `docker/docker-compose.yml`、`backend/Dockerfile` |

### 17.3 待确认事项（待用户/维护者确认）

- [ ] `ai_model_call_logs` 是否在所有 LLM 调用点全量写入？
- [ ] `delete-account` 30 天冻结的清理任务是否存在（celery 未启用情况下）？
- [ ] Redis 不可用时限流降级策略是否已实现？
- [ ] S3 存储切换是否已配置（当前默认本地 `uploads/`）？
- [ ] Alembic 迁移是否与 `create_all` 双轨并存，生产以何为准？

### 17.4 文档维护说明

- 代码为唯一事实来源；本文档与代码冲突时以代码为准。
- 建议每次重大变更同步更新本文件对应章节，并在 §17.3 勾选待确认项。
- 陈旧诊断文档（`诊断与优化方案.md`，2026-09-11）部分结论已过时，请勿单独采信。

---

_文档生成：基于真实代码/配置/文档静态分析，未修改任何源码。_
