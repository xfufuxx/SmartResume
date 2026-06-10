# 智能简历优化系统 — 代码审查报告

> 审查日期：2026-05-24
> 审查范围：后端（FastAPI）+ 前端（Next.js 14）

---

## 目录

1. [一、安全性问题](#一安全性问题)
2. [二、异步代码阻塞问题](#二异步代码阻塞问题)
3. [三、错误处理不够健壮](#三错误处理不够健壮)
4. [四、数据库设计不够完善](#四数据库设计不够完善)
5. [五、Celery 异步任务有缺陷](#五celery-异步任务有缺陷)
6. [六、PDF 生成有兼容性风险](#六pdf-生成有兼容性风险)
7. [七、前端功能明显缺失](#七前端功能明显缺失)
8. [八、React/Next.js 最佳实践问题](#八reactnextjs-最佳实践问题)
9. [九、项目工程化缺失](#九项目工程化缺失)
10. [十、其他小问题](#十其他小问题)
11. [总结与优先级建议](#总结与优先级建议)

---

## 一、安全性问题

| 问题 | 位置 | 严重程度 | 说明 |
|------|------|----------|------|
| JWT 密钥为占位符 | `backend/.env` L7 | **高** | `SECRET_KEY=your-secret-key-change-in-production` 未替换，线上使用则任意用户可伪造 JWT |
| 密码哈希算法过时 | `backend/app/core/security.py` L7 | **中** | `CryptContext(schemes=["bcrypt_sha256"])` — `bcrypt_sha256` 已被 passlib 弃用，应直接使用 `bcrypt` |
| 登录接口无速率限制 | `backend/app/api/auth.py` L28 | **中** | `/api/auth/login` 无任何防暴力破解措施 |
| 密码无强度校验 | `backend/app/schemas/user.py` L6 | **低** | `UserCreate.password: str` 仅要求字符串，无最短长度或复杂度约束 |
| 无刷新令牌机制 | `backend/app/core/security.py` L18 | **中** | 只有 access token，无 refresh token，过期后用户需重新登录 |

---

## 二、异步代码阻塞问题

FastAPI 是异步框架，事件循环被阻塞会导致整个服务响应变慢。

```python
# backend/app/services/storage.py L30-L31  (同步阻塞)
if self.s3_client:
    self.s3_client.put_object(...)  # ❌ boto3 是同步的，阻塞事件循环
```

类似问题：

| 位置 | 阻塞调用 | 建议 |
|------|----------|------|
| `backend/app/services/job_parser.py` L70 | `PaddleOCR(...)` | 使用 `asyncio.to_thread()` 包装 |
| `backend/app/services/job_parser.py` L76 | `ocr.ocr(...)` | 同上 |
| `backend/app/services/resume_parser.py` L68 | `PaddleOCR(...)` | 同上 |
| `backend/app/services/resume_parser.py` L74 | `ocr.ocr(...)` | 同上 |
| `backend/app/services/storage.py` L31 | `s3_client.put_object(...)` | 考虑 `aioboto3` 或 `asyncio.to_thread()` |

---

## 三、错误处理不够健壮

### 3.1 LLM 调用无重试逻辑

所有 OpenAI 调用（`agent_optimizer.py`、`job_parser.py`、`resume_parser.py`）均无重试机制，API 偶发失败即返回 500。

### 3.2 脆弱的字符串匹配

```python
# backend/app/services/resume_parser.py L58-L60
if "api_key" in error_msg or "unauthorized" in error_msg:
```

OpenAI 的错误消息格式可能随 API 版本变化，应使用 `openai` 库提供的异常类型（如 `openai.AuthenticationError`）来判断。

### 3.3 前端吞掉错误详情

多处 `catch` 块丢失实际错误信息：

```typescript
// frontend/src/app/page.tsx L49
catch { message.error('简历上传或解析失败') }
// frontend/src/app/page.tsx L61
catch { message.error('图片上传或解析失败') }
```

同时登录/注册页面的 `catch` 也是如此，用户无法知道具体失败原因。

---

## 四、数据库设计不够完善

| 问题 | 位置 | 说明 |
|------|------|------|
| 无数据库迁移脚本 | `backend/alembic/` | alembic 已配置但目录下无任何迁移文件，生产环境靠 `Base.metadata.create_all` 不靠谱 |
| UUID 存为字符串 | 所有 models | `String(36)` 而非 PostgreSQL 原生 `UUID` 类型，性能和存储更差 |
| 缺少复合索引 | `OptimizedResume` 表 | 频繁查询 `user_id + resume_id` 组合条件但未建联合索引 |
| 缺少优化状态字段 | `models/optimized_resume.py` | 只有 "有 pdf_url 则完成" 的二元判断，无法表达 `running / failed / processing` 等中间状态 |
| `changes_description` 类型不严谨 | `models/optimized_resume.py` L20 | `mapped_column(String, nullable=True)` 未指定长度 |

---

## 五、Celery 异步任务有缺陷

```python
# backend/celery_worker.py L55-L60
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
try:
    return loop.run_until_complete(_run())
finally:
    loop.close()
```

每执行一个 Celery 任务就创建新事件循环，是 **反模式**。应该只创建一个事件循环复用。

更大的问题是：

- **前端完全不使用 Celery** — 优化 API 端点是同步等 LLM 返回的，耗时任务会导致 HTTP 超时
- **无任务状态跟踪** — 没有为 Celery 任务创建数据库记录用于前端轮询状态
- **Celery Worker 在 Docker 中未暴露健康检查端口**

---

## 六、PDF 生成有兼容性风险

```python
# backend/app/services/pdf_generator.py L169-L180
try:
    from weasyprint import HTML
    pdf_bytes = HTML(string=html).write_pdf()
except (ImportError, OSError):
    return _build_fallback_pdf(resume_json)
```

**WeasyPrint** 底层依赖 GTK/GObject 系统库（`libpango`、`libcairo`、`libffi` 等），在：

- **Windows** — 安装极其困难，常需额外 DLL
- **Docker Alpine** — 需要 `apk add` 多个系统包，Dockerfile 中未处理

虽然写了 ReportLab 回退，但 ReportLab 的输出质量远不如 WeasyPrint 的 HTML+CSS 渲染。

---

## 七、前端功能明显缺失

对照 `spec.md` 设计文档与 `frontend/src/app/page.tsx` 的实际实现：

| spec.md 设计功能 | 实际实现 | 状态 |
|:---|---|:---:|
| 简历解析结果可视化预览（可编辑） | 只读 Descriptions 展示 | ❌ |
| 岗位解析后可修正 | 无编辑功能 | ❌ |
| 原始简历 vs 优化简历并排差异对比 | 仅展示修改说明文本 | ❌ |
| 用户微调优化结果 | 无法手动修改 | ❌ |
| 优化历史记录列表 | 仅在当前页面展示最近一次 | ❌ |
| Ctrl+V 粘贴截图 | 仅支持拖拽上传 | ❌ |
| WebSocket 推送优化进度 | 完全同步等待 | ❌ |
| 解析加载动画 | 上传时无加载状态 | ❌ |
| 手机扫码上传 | 不支持 | ❌ |

---

## 八、React/Next.js 最佳实践问题

### 8.1 全部使用 'use client'

```typescript
// frontend/src/app/layout.tsx L1
'use client'
// frontend/src/app/page.tsx L1
'use client'
// frontend/src/app/login/page.tsx L1
'use client'
// frontend/src/app/register/page.tsx L1
'use client'
```

整个应用全是客户端组件，没有利用 Next.js 14 的 Server Components、Streaming SSR 和 Suspense 边界。

### 8.2 Layout 是客户端组件

`layout.tsx` 被标记为 `'use client'`，导致：

- 无法使用 Next.js 的 `metadata` API 设置页面标题和 SEO
- 所有子页面都无法享受 Server Components 的优势

### 8.3 缺失约定式文件

| 缺失文件 | 作用 |
|----------|------|
| `loading.tsx` | 路由级别的加载骨架屏 |
| `error.tsx` | 路由级别的错误边界（避免白屏） |
| `not-found.tsx` | 自定义 404 页面 |

### 8.4 样式方案

所有样式均为内联 style 对象（`style={{ ... }}`），无 CSS modules / Tailwind / CSS-in-JS 方案，难以维护和扩展。

### 8.5 无响应式设计

[Cards 固定 24 gutter 在移动端无适配](file:///d:/下载/智能简历/frontend/src/app/page.tsx#L103)，`maxWidth: 1200` 在小屏上布局会溢出。

---

## 九、项目工程化缺失

| 类别 | 现状 | 建议 |
|------|------|------|
| **单元测试** | ❌ 零测试文件 | 添加 pytest（后端）和 Jest/Testing Library（前端）覆盖核心路径 |
| **集成测试** | ❌ 无 API 测试 | 使用 httpx + pytest 进行路由测试 |
| **E2E 测试** | ❌ 无 | Playwright / Cypress |
| **CI/CD** | ❌ 无 | GitHub Actions / GitLab CI：lint → test → build |
| **结构化日志** | ❌ 无 | 集成 structlog 或 loguru |
| **APM / 错误追踪** | ❌ 无 | Sentry 集成 |
| **`.dockerignore`** | ❌ 缺失 | 构建时会发送整个虚拟环境和 node_modules |
| **Docker 健康检查** | ❌ backend 容器未设置 | 应添加 healthcheck，被 frontend/celery 依赖 |
| **API 文档增强** | ⚠️ 仅 Swagger 自动生成 | 添加更多 description 和示例 |

---

## 十、其他小问题

### 10.1 StorageService 读取冲突

```python
# backend/app/services/storage.py L28-L32
async def upload(self, file: UploadFile, key: str) -> str:
    content = await file.read()
    ...
```

但 [resumes.py L27](file:///d:/下载/智能简历/backend/app/api/resumes.py#L27) 和 [jobs.py L28](file:///d:/下载/智能简历/backend/app/api/jobs.py#L28) 中，文件先被传给 `storage.upload()`，然后又被传给解析函数 — 实际上 `file.read()` 已经被调用过一次，内容已消费。

### 10.2 时间类型不一致

[schemas/resume.py L21](file:///d:/下载/智能简历/backend/app/schemas/resume.py#L21) 中 `created_at: str` 定义为字符串，前端需手动解析：

```python
class ResumeResponse(BaseModel):
    created_at: str  # 应使用 datetime
```

### 10.3 .env 文件暴露风险

`.env` 文件未在 `.gitignore` 中显式忽略，虽然内容目前只有占位符，但这是个密钥泄露的隐患。

### 10.4 docker-compose 数据库密码不一致

- `backend/.env` 中 `DATABASE_URL` 密码：`root`
- `docker/docker-compose.yml` 中 POSTGRES_PASSWORD：`postgres`

初次使用 Docker 启动时必踩坑。

### 10.5 无文件大小校验

`config.py` 中定义了 `MAX_UPLOAD_SIZE = 20MB`，但所有 upload API 路由中均未校验实际文件大小。

---

## 总结与优先级建议

核心业务逻辑（AI Agent 链、简历/岗位解析 Prompt、PDF 模板）方向正确，Mock 数据质量很高，说明 **架构设计阶段考虑充分**。当前不足集中体现在**工程化成熟度**层面。

### 优先修复清单

| 优先级 | 任务 | 影响面 |
|:------:|------|--------|
| **P0** | 替换 `SECRET_KEY` 为随机安全密钥 + `bcrypt_sha256` → `bcrypt` | 安全底线 |
| **P0** | 前端优化改为异步轮询/WebSocket | 核心体验 |
| **P1** | 添加并排差异对比界面 + 解析结果编辑 | Spec 承诺功能 |
| **P1** | 用 `asyncio.to_thread()` 包装同步的 boto3/PaddleOCR | 性能 |
| **P1** | 补充数据库迁移脚本（alembic） | 生产就绪 |
| **P2** | 添加基础测试覆盖核心路由 | 质量保障 |
| **P2** | LLM 调用添加重试逻辑 | 健壮性 |
| **P2** | Layout 改为 Server Component + 分离 client 组件 | 架构 |
| **P3** | CI/CD 配置 | 自动化 |
| **P3** | 日志 + 错误追踪 | 可观测性 |