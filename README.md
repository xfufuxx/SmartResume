# 智能简历优化系统 · 项目使用方法 (Smart Resume)

> 上传简历 + 岗位需求 → AI 解析、匹配分析、逐段优化 → 渲染为专业排版的 PDF / Word。

本文件是**上手与运维指南**：环境准备、启动、配置、构建/测试/部署、安全实操、以及一键体验演示数据。
想了解「系统是什么、有哪些能力、架构如何」，请阅读同目录的 **`PROJECT_OVERVIEW.md`**（项目概述）。

---

## 目录

- [环境要求](#环境要求)
- [方式 A：Docker Compose 启动（推荐）](#方式-a-docker-compose-启动推荐)
- [方式 B：本地手动启动（Windows）](#方式-b本地手动启动windows)
- [一键脚本（Windows）](#一键脚本windows)
- [演示数据：一键导入并体验](#演示数据一键导入并体验)
- [配置与环境变量](#配置与环境变量)
- [最小验证](#最小验证)
- [构建 / 测试 / 部署](#构建--测试--部署)
- [安全注意事项](#安全注意事项)
- [常见问题（FAQ）](#常见问题faq)
- [文档索引](#文档索引)

---

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Python | 3.12（CI 用 3.11） | 后端运行时 |
| Node.js | 18+（实测 22.x 可用） | 前端运行时 |
| PostgreSQL | 16 | 主数据库（JSONB 承载半结构化字段） |
| Redis | 7（Docker）/ 3.0.504（Windows 本地版） | 缓存 / 任务状态 / 限流 |

> Windows 本机注意：本项目**没有 Redis Windows 服务、也没有 Docker**，Redis 需手动启动（见下方方式 B）。

---

## 方式 A：Docker Compose 启动（推荐）

```bash
# 1) 准备环境变量
cp backend/.env.example backend/.env
#    ⚠️ 见「安全注意事项」：当前 .env.example 内含真实凭证，务必先替换为自己的密钥

# 2) 启动全套（db / redis / backend / celery_worker / frontend）
docker compose -f docker/docker-compose.yml up -d --build

# 3) 健康检查
curl http://127.0.0.1:8000/health
```

默认端口：后端 `8000`，前端 `3000`，PostgreSQL `5432`，Redis `6379`。

---

## 方式 B：本地手动启动（Windows）

```bash
# ① Redis（不要用 & 后台启动，shell 退出会被回收）
"D:\Redis-x64-3.0.504\redis-server.exe" --port 6379

# ② 后端
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # 同样需替换真实密钥
python run.py                 # 监听 127.0.0.1:8000

# ③ 前端（另开终端）
cd ../frontend && npm install && npm run dev
```

> **Windows 上 `npm` 被应用商店桩程序劫持**时，请用受管 Node 的 npm：
> `node.exe "...\node_modules\npm\bin\npm-cli.js" install`

---

## 一键脚本（Windows）

项目根目录提供两个 `.bat` 脚本（已统一为 **CRLF 换行**、绝对路径、`cmd /k` 失败不闪退，并内置端口自检）：

| 脚本 | 作用 |
| --- | --- |
| `restart_backend.bat` | 全栈一键：按端口杀掉 8000/3000 旧进程 → 确保 Redis → 起后端 → 起前端 `next dev` |
| `stop_all.bat` | 只停不启：按端口停掉 3000 / 8000 / 6379 |

> 脚本会自动定位受管 Node 并以 `npm-cli.js` 启动前端，规避 Windows 应用商店的 npm 桩程序。
> 双击运行后，窗口会打印 `[OK] backend listening on :8000` / `[FAIL] ...` 供你确认是否启动成功。

---

## 演示数据：一键导入并体验

为了让没有真实简历的你也能直接看到完整功能与边界场景，项目附带一套**独立演示账号 + 演示数据**：

- **演示账号**：邮箱 `demo@smart-resume.com` ／ 密码 `Demo@123456`
- 登录后落在「首页」`/dashboard`

### 导入演示数据

本机没有 `psql`，请用后端 venv 的 Python 执行导入脚本（脚本**幂等**，重复跑不会产生重复数据）：

```bash
cd "D:/下载/智能简历 - 副本 (2)"
./backend/.venv/Scripts/python.exe scripts/apply_seed.py "演示测试数据.sql"
```

### 清理 / 还原

想回到「无演示数据」状态，执行配套的清理脚本（实测可把库精确还原到导入前）：

```bash
./backend/.venv/Scripts/python.exe scripts/apply_seed.py "演示测试数据-清理.sql"
```

### 相关文件

| 文件 | 用途 |
| --- | --- |
| `演示测试数据.sql` | 演示账号 + 15 张业务表的种子数据（可重复导入） |
| `演示测试数据-清理.sql` | 一键清除上述数据 |
| `scripts/gen_demo_seed.py` | 生成器（产出上面两个 SQL） |
| `scripts/apply_seed.py` | 导入 / 清理执行器（通用，传文件名即可） |
| `scripts/verify_seed.py` | 校验脚本：导入→逐表比对行数→清理→确认还原 |

### 演示数据刻意内置的边界样本（用来直观暴露问题）

- 1 份未解析简历（`parsed_json` 结构化字段为空）→ 首页「简历尚未解析」告警
- 2 条低匹配优化记录（64 分、58 分，低于 70）→ 首页「去优化」告警
- 1 条 `status=failed` 批量任务（图片清晰度过低）
- 1 个 `status=processing`、题目数为 0 的面试会话 → 验证「生成中」空态
- 1 条 `is_success=false` 的 AI 调用日志（upstream timeout）
- 回收站：1 简历 + 1 岗位 + 1 优化记录（`deleted_at` 非空）

> 提示：部分导出 PDF 的 URL 在演示数据中指向本地不存在的占位路径，用来验证「文件缺失 / 下载失败」分支——这些 PDF 不会真的能下载。

---

## 配置与环境变量

配置集中在 `backend/app/config.py`（`Settings(BaseSettings)`，读取 `backend/.env`），所有项均可被环境变量覆盖。
部署时把真实值写入 `backend/.env`（已被 gitignore），`.env.example` 仅作样例。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:root@localhost:5432/smart_resume` | 异步 PG 连接串 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接 |
| `SECRET_KEY` | `change-me-in-production` | JWT + AES 密钥派生源（**生产必须改**） |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | `120` / `7` | Token 有效期 |
| `LLM_API_KEY` / `LLM_API_BASE` | — / `https://dashscope.aliyuncs.com/compatible-mode/v1` | LLM 凭证与兼容端点（千问 / 阿里云百炼） |
| `LLM_MODEL_TEXT` / `LLM_MODEL_VISION` | `qwen3.7-plus` / `qwen3.7-plus` | 模型名（部署时覆盖） |
| `MAX_UPLOAD_SIZE` | 20 MB | 上传上限 |
| `FILE_URL_TTL` | 30 天 | 签名代理 URL 有效期 |
| `USE_LOCAL_OCR` | `false` | 是否启用 PaddleOCR |
| `USE_WEASYPRINT` / `USE_TEMPLATE_PDF` | `true` / `true` | 渲染开关 |
| `BACKEND_URL` | `http://localhost:8000` | 签名 URL 域名 |
| `CORS_ORIGINS` | `http://localhost:3000,…` | 允许来源 |
| `SMTP_*` | `smtp.qq.com` 等 | 邮件（验证码 / 通知） |

> ⚠️ 轮换 `SECRET_KEY` 会导致历史 `raw_text` 密文**无法解密**——迁移时需先解密再重加密。

---

## 最小验证

```bash
curl -s http://127.0.0.1:8000/health            # {"status":"ok",...}
# 交互式 API 文档
open http://127.0.0.1:8000/docs
```

前端访问 http://localhost:3000 ，用上面的演示账号或自有账号登录体验。

---

## 构建 / 测试 / 部署

```bash
# 后端镜像
docker build -t smart-resume-backend ./backend

# 前端构建（standalone 产物）
cd frontend && npm run build

# 自包含测试（CI 同款，无需 DB / Redis / LLM）
cd backend && pytest tests/test_nonai_features.py -q
```

- **后端镜像**：`python:3.12-slim`，预装 pango/cairo 供 WeasyPrint，`HEALTHCHECK` 探测 `/health`。
- **CI**：`.github/workflows/ci.yml` 在 push/PR 到 `main`/`master`/`dev` 时，
  用 Python 3.11 + `requirements-light.txt` 跑自包含测试。需要外部依赖的测试尚未纳入。
- **数据库初始化**：开发期由 `lifespan` 自动 `create_all`，或执行 `public.sql` + `补充测试数据.sql`；
  生产建议以 Alembic 迁移为准。
- **生产部署**：Nginx 终止 TLS 并转发 `/api` 与 `/`；限流依赖 Redis，务必保证可用；
  文件下载走签名代理 URL，无需对外暴露对象存储。

---

## 安全注意事项

### 已实现的控制

| 控制 | 位置 | 说明 |
| --- | --- | --- |
| 密码哈希 | `core/security.py` | bcrypt，仅存哈希 |
| JWT 双 Token | `core/security.py` | HS256，含 `device_id` |
| 文件魔数校验 | `core/file_security.py` | 防伪装扩展名（PDF/DOCX/PNG/JPG/WEBP） |
| PDF 页数上限 | `core/file_security.py` | ≤ 50 页 |
| PII 加密 | `core/crypto.py` | `raw_text` AES-256-CBC 入库 |
| 日志脱敏 | `core/log_filter.py` | 手机号 / 邮箱掩码（PIPL） |
| 文件不公开 | `main.py` | 不挂载 `/uploads`，仅签名代理 |
| 签名代理 URL | `services/storage.py` | HMAC + TTL |
| 限流 | `core/deps.py` `RateLimiter` | Redis 滑动窗口 |
| 中文错误码 | `core/errors.py` | 不泄露内部细节 |

### 风险与待办（上线前必看）

1. **🔴 高危 · 凭证泄露**：`backend/.env.example` 当前**含真实可用凭证**（非占位符），
   且因 `backend/.gitignore` 的 `!.env.example` 规则而被纳入版本控制。请立即：
   ① 到对应平台**轮换 / 作废**这些密钥；② 将 `.env.example` 改为占位符
   （如 `LLM_API_KEY=__REPLACE_ME__`），真实值只留本地 `.env`（已 gitignore）；
   ③ 若历史提交中已包含真实密钥，用 `git filter-repo` / BFG 清理历史。
2. **🟠 中危**：`SECRET_KEY` 默认值 `change-me-in-production`，未改则 JWT 可伪造、AES 可解密。
3. **🟠 中危**：限流依赖 Redis；Redis 不可用时 `RateLimiter` 会抛错，降级策略尚未实现。
4. **🟡 低危**：`delete-account` 为 30 天冻结，但 Celery 未启用，可能没有自动清理任务。
5. **🟡 低危**：CORS / HTTPS 终止依赖部署层，配置未固化。

---

## 常见问题（FAQ）

**Q：双击 `restart_backend.bat` 后只有 Redis 起来了，前后端没启动？**
两个 `.bat` 必须是 CRLF 换行（cmd.exe 按 CRLF 解析），纯 LF 会让它吞掉下一行首字符而静默失败。
当前版本已统一转为 CRLF；若你用文本编辑器改过脚本，请用「转换为 CRLF」再保存。

**Q：演示账号登录报 `Objects are not valid as a React child ...`？**
这是后端 422（`EmailStr` 拒绝 `.test`/`.local` 之类的保留域名）被前端直接渲染成 React 子节点导致。
当前演示账号邮箱已改为 `demo@smart-resume.com`（可过校验），且 `frontend/src/lib/api.ts` 已统一把错误归一化为字符串，不会再次崩溃。

**Q：登录后为什么停在「优化」页而不是「首页」？**
已修复为登录成功后落地「首页」`/dashboard`（改自 `frontend/src/app/login/page.tsx` 与 `register/page.tsx`）。

**Q：后端用 `| head -N` / 带 `&` 启动后过一会儿就没了？**
`head` 读满行数会关闭管道导致进程收到 SIGPIPE 被杀；`&` 后台进程在 shell 退出后被回收。
请用 `restart_backend.bat` 或把日志重定向到文件（`>> log 2>&1`）后后台常驻。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| **`PROJECT_OVERVIEW.md`** | **项目概述**：核心能力、技术栈、系统架构、项目结构、数据模型、API 概览、技术债 |
| `docs/PROJECT_DOCUMENTATION.md` | 代码级完整项目文档：架构、模块、流程、数据模型、API、配置、FAQ（深入开发先读它） |
| `docs/大模型配置与密钥安全指南.md` | 大模型接入与密钥轮换实操 |
| `docs/项目测试文档.md` | 测试策略与用例说明 |
| `README.md` | 本文件，项目使用方法（启动 / 配置 / 部署 / 演示数据） |
| `backend/.env.example` | 环境变量样例（⚠️ 待替换为占位符） |
| `public.sql` / `补充测试数据.sql` | 建表 SQL 与补充演示数据 |
| `演示测试数据.sql` / `演示测试数据-清理.sql` | 独立演示账号种子数据及其清理脚本 |
| `docker/docker-compose.yml` | 一键部署编排 |

---

_本 README 依据当前代码、配置与实测整理；代码为唯一事实来源，如有冲突以代码为准。_
