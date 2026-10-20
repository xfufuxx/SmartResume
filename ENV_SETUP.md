# Smart Resume · 本地环境搭建清单（Windows）

> 本文档基于本机实测整理。所有命令均在 `D:\Desktop\智能简历1`（仓库根目录）下执行，
> 使用 Git Bash。标记 🔐 的项为**敏感信息，必须你本人提供**，我不会代填。

---

## 0. 当前环境实测结果（已全部跑通）

| 组件 | 要求 | 本机实际 | 状态 |
|---|---|---|---|
| Python | 3.12（CI 3.11） | 3.13.14（venv 内） | ✅ 可用（paddle 系列除外，见下文） |
| Node | ≥18 | v22.22.2 | ✅ |
| npm | — | 10.9.7 | ✅ |
| PostgreSQL | 16 | 16.14，端口 5432，服务运行中 | ✅ |
| Redis | 7 / 3.x | Redis 8.8（WinGet），端口 6379 | ✅ |
| Docker | 可选 | **不可用**（命令不存在） | ⚠️ 走「本地手动启动」方案 |
| 后端 | — | http://127.0.0.1:8000 `/health` → 200 | ✅ |
| 前端 | — | http://localhost:3000 → 200 | ✅ |
| 数据库表 | — | 32 张表已建 | ✅ |
| 演示数据 | — | 演示账号已导入并可登录 | ✅ |

数据库凭据：`postgres / postgres`，库名 `smart_resume`（与 `docker/docker-compose.yml` 一致）。

---

## 1. 一次性安装（已完成的我标了 ✅，你重做时按顺序跑即可）

### 1.1 运行时与包管理器 ✅ 已就绪
无需安装。若换机器，需要：Python 3.12+（建议 3.12，便于兼容 paddle）、Node 18+、
PostgreSQL 16、Redis（WinGet 安装：`winget install taizod1024.redis-windows-fork`）。

### 1.2 后端虚拟环境与依赖 ✅ 已安装（91 个包）
```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip
# 走国内镜像，否则经代理极易卡死（本机实测默认源 15 分钟装不上一个包）
./.venv/Scripts/python.exe -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
```
> **注意**：`requirements.txt` 里的 `paddlepaddle` / `paddleocr` **不要装**。
> 它们没有 Python 3.13 的 wheel，且仅当 `USE_LOCAL_OCR=true` 才需要（默认关闭）。
> 若坚持启用本地 OCR，请改用 Python 3.11/3.12。

### 1.3 Playwright 浏览器内核 ✅ 已下载（PDF 导出依赖）
```bash
cd backend && ./.venv/Scripts/python.exe -m playwright install chromium
```

### 1.4 前端依赖 ✅ 已安装（419 个包）
```bash
cd frontend && npm install
```

---

## 2. 数据库：建库 → 建表 → 导入演示数据 ✅ 已完成

```bash
# 2.1 建库（PowerShell 或 Git Bash，psql 不在 PATH，需全路径）
"C:/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -c "CREATE DATABASE smart_resume;"

# 2.2 建表：后端启动时 lifespan 会自动 Base.metadata.create_all + 轻量 ALTER 迁移
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# 看到 "Application startup complete." 即建表完成（本次生成 32 张表）

# 2.3 创建管理员（演示数据的工单表外键依赖它）
#     id 必须为 f060f9c2-2ca4-4f83-9fb1-c2bfa7c9233e，密码 admin123
#     （见下方「管理员」一节的一行脚本）

# 2.4 导入演示数据（幂等，可反复执行）
cd .. && backend/.venv/Scripts/python.exe scripts/apply_seed.py "演示测试数据.sql"
# 期望输出：执行成功: 演示测试数据.sql / users 总数 =1，其中演示账号 =1
```

---

## 3. 启动与验证 ✅ 已验证

```bash
# Redis（常驻）
"C:/Users/fu/AppData/Local/Microsoft/WinGet/Packages/taizod1024.redis-windows-fork_Microsoft.Winget.Source_8wekyb3d8bbwe/Redis-8.8.0-Windows-x64-msys2/redis-server.exe" --port 6379

# 后端
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd frontend && npm run dev
```

验证：
```bash
curl http://127.0.0.1:8000/health          # {"status":"ok","service":"Smart Resume API"}
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@smart-resume.com","password":"Demo@123456"}'   # 返回 access_token
```
一键脚本（已修复 Redis 路径）：`restart_backend.bat` / `stop_all.bat`。

### 可用账号
| 角色 | 账号 | 密码 |
|---|---|---|
| 演示用户 | `demo@smart-resume.com` | `Demo@123456` |
| 超管 | `superadmin` | `admin123` |

---

## 4. 🔐 需要你手动提供的敏感信息

| 项 | 位置 | 必要性 | 说明 |
|---|---|---|---|
| **千问 API Key** 🔐 | `backend/.env` → `LLM_API_KEY` | **AI 功能必需** | 当前是占位符 `__待填写_千问APIKey__`。获取：https://platform.qianwenai.com/home/api-keys 。Key 只在创建时显示一次。文本与视觉模型共用同一个 base_url，必须是同一服务端点。 |
| **SMTP 授权码** 🔐 | `backend/.env` → `SMTP_PASSWORD` | 可选 | 邮箱验证码/投递用。不填时验证码打印到后端控制台，不影响登录。QQ 邮箱需在「设置 → 账户」开启 POP3/SMTP 后生成**授权码**（不是 QQ 密码）。同时填 `SMTP_USER` / `SMTP_FROM`。 |
| **IMAP 授权码** 🔐 | `backend/.env` → `IMAP_PASSWORD` | 可选 | 投递回执轮询。留空则 `/email/sync` 返回 `enabled:false`。 |
| **S3 / OSS 密钥** 🔐 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 可选 | 本地开发留空即可，文件走本地磁盘 + 签名代理。 |

**已自动生成、无需你操作**：`SECRET_KEY`（随机 48 字节）。
⚠️ 它用于加密敏感字段，**轮换会导致历史密文无法解密**，请勿随意更改或外泄。

**数据库密码**：已实测确认为 `postgres`（来源 `docker/docker-compose.yml`）。
若你的实际环境不同，改 `backend/.env` 的 `DATABASE_URL`。

---

## 5. 本次为「可复现运行」所做的代码修正

| 文件 | 问题 | 处理 |
|---|---|---|
| `backend/requirements.txt` | 代码实际 import 了 `requests`、`beautifulsoup4`（`app/services/form_delivery.py`），原清单漏写 → 后端启动即 `ModuleNotFoundError` | 补入清单 |
| `backend/requirements.txt` | `passlib 1.7.4` 与 `bcrypt>=5` 不兼容：bcrypt 5 对 >72 字节密码抛 `ValueError`，而 passlib 内部自检会用长密码 → **注册/登录全部失效** | 约束 `bcrypt>=4.0.1,<5.0.0`（本机降到 4.3.0） |
| `backend/app/core/security.py` | bcrypt ≥4.1 移除 `__about__`，passlib 每次导入打印一段无害但刺眼的 `AttributeError` 堆栈 | 加 4 行兼容 shim |
| `scripts/apply_seed.py` | 硬编码 DSN 密码 `root`，与实际不符 | 改为读 `DATABASE_URL` 环境变量，默认 `postgres` |
| `backend/.env.example` | 默认库密码与 docker-compose 不一致；缺少 `IMAP_*`、`DELIVERY_*`、`USE_TEMPLATE_PDF`、`BACKEND_URL`、`ACCESS_TOKEN_EXPIRE_MINUTES`；**暴露了作者真实 QQ 邮箱** | 补齐并脱敏 |
| `restart_backend.bat` | Redis 路径 `D:\Redis-x64-3.0.504\redis-server.exe` 不存在 | 改为本机 WinGet Redis 8.8 实际路径 |

---

## 6. 已知限制

1. **Docker 不可用** → 只能用本地手动启动方案（本文档即该方案）；`docker/` 目录仅供有 Docker 的环境使用。
2. **Python 3.13** → `paddlepaddle`/`paddleocr` 无法安装，本地 OCR（`USE_LOCAL_OCR`）不可用；已默认关闭，不影响主链路（走视觉大模型识读）。
3. **WeasyPrint** 在 Windows 需 GTK 系统库，已关闭（`USE_WEASYPRINT=false`），PDF 走 Playwright/Chromium 模板渲染。
4. **Redis 与后端进程**随启动它们的终端关闭而退出；建议用 `restart_backend.bat` 或独立终端常驻。
5. `public.sql` 是作者本人的完整库 dump（含真实业务数据），**不要直接导入**；演示数据请用 `演示测试数据.sql`。
