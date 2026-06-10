# 智能简历优化系统 (Smart Resume)

用户上传简历 + 岗位需求截图，AI 自动解析并生成高度匹配的优化简历。

## 技术栈

- **后端**: Python + FastAPI + SQLAlchemy (Async) + PostgreSQL
- **AI**: OpenAI GPT-4o / GPT-4o-mini + LangChain 风格链式 Prompt
- **前端**: Next.js 14 + React + Ant Design
- **任务队列**: Celery + Redis
- **PDF 生成**: Jinja2 + WeasyPrint
- **文件存储**: AWS S3 / 本地文件系统
- **部署**: Docker + docker-compose

## 快速开始

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 .env，填入 LLM API Key 等配置
```

### 2. 使用 Docker 启动

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 3. 本地开发

**后端：**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
npm run dev
```

## API 文档

启动后端后访问 http://localhost:8000/docs

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── api/          # 路由层
│   │   ├── models/       # SQLAlchemy 模型
│   │   ├── schemas/      # Pydantic 校验
│   │   ├── services/     # 业务逻辑
│   │   ├── core/         # 安全、依赖注入
│   │   └── prompts/      # LLM Prompt 模板
│   ├── celery_worker.py  # 异步任务
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js 页面
│   │   ├── components/   # 组件
│   │   ├── lib/          # API 客户端
│   │   └── types/        # TypeScript 类型
│   ├── package.json
│   └── Dockerfile
└── docker/
    ├── docker-compose.yml
    └── nginx.conf
```

## 核心流程

1. 用户上传简历 (PDF/Word/图片) → 解析为结构化 JSON
2. 用户上传岗位需求截图 → 多模态 LLM 提取为结构化 JD
3. AI Agent 进行匹配分析 → 简历逐段优化 → 生成修改说明
4. 渲染为专业排版 PDF → 供用户下载
