# jadeAI 架构参考的模板体系升级 — 交付文档

> 版本：v1.0（2026-10-22）
> 范围：模板选择机制（TemplateRegistry）、PDF 导出与文档属性注入、jadeAI 模板库迁移（2 套）
> 仓库基准：`github.com/twwch/JadeAI`（Next.js 16 + React 19 + Tailwind 4 + Zustand + Drizzle，50 套 React 模板组件 + Puppeteer 逐模板服务端导出）

---

## 1. 架构与数据流转

### 1.1 总体数据流

```
                    ┌─────────────────────────────────────────────┐
                    │ 前端 frontend/src/lib/template-registry.tsx  │
                    │   TemplateMetadata（单一事实源）              │
                    │   id/name/author/version/category/           │
                    │   industries/tags/theme/renderMode/          │
                    │   lazyComponent（React 懒加载路径）           │
                    └───────┬──────────────────────────┬──────────┘
                            │ 派生                      │ 查询/过滤
                            ▼                          ▼
              ┌─────────────────────┐      ┌──────────────────────┐
              │ lib/templates.tsx   │      │ TemplateSelector     │
              │ （兼容层：           │      │ 网格/列表 · 分类/标签 │
              │  TEMPLATE_OPTIONS   │      │ 过滤 · 搜索 · 预览弹窗 │
              │  TEMPLATE_LABELS）  │      └──────────┬───────────┘
              └─────────┬───────────┘                 │ 选中 template key
                        │ 页面按钮/详情页             ▼
                        │                     ┌───────────────┐
                        │                     │ 用户选择      │
                        │                     │ selectedTemplate│
                        │                     └───────┬───────┘
                        │                             │ 导出/重导出
                        ▼                             ▼
        ┌──────────────────────────┐   POST /api/optimize/{id}/reexport?template=<key>
        │ 优化页 / 优化详情页        │ ─────────────────────────────────────────────┐
        └──────────────────────────┘                                        │
                                                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 后端 backend/app/services/template_meta.py（元数据单一事实源，与前端字段对齐）      │
│   TEMPLATE_META: {key → BackendTemplateMeta(name/author/version/category/...)}  │
└───────────────┬──────────────────────────────────────┬──────────────────────────┘
                │ ① PDF 导出                            │ ② 预览 API
                ▼                                       ▼
   ┌────────────────────────────┐        ┌────────────────────────────────┐
   │ pdf_generator.generate_pdf │        │ api/templates.py               │
   │  resume_json + {key}.html  │        │  GET  /api/templates           │
   │         │                  │        │  GET  /api/templates/{key}/    │
   │         ▼                  │        │       preview（演示数据 HTML）  │
   │ Jinja2 render → HTML       │        └───────────────┬────────────────┘
   │  + inject_html_meta(<meta>)│                        │ iframe 高保真预览
   │         │                  │                        ▼
   │         ▼                  │        ┌────────────────────────────────┐
   │ resume_renderer.           │        │ 前端预览弹窗「真实排版」Tab      │
   │   html_to_pdf_async(       │        │ （Next rewrites /api/* → :8000）│
   │     html, base_url,        │        └────────────────────────────────┘
   │     metadata=PdfMetadata)  │
   │         │                  │
   │         ▼                  │
   │ Playwright page.pdf()      │
   │         │                  │
   │         ▼                  │
   │ pdf_metadata.inject_pdf_   │
   │   metadata()（PyMuPDF      │
   │   set_metadata 后处理）     │
   │         │                  │
   │         ▼                  │
   │ WeasyPrint → ReportLab     │
   │ （回退链，均读 HTML <meta>） │
   └────────────┬───────────────┘
                ▼
        PDF（/Title /Author /Subject /Keywords
            /CreationDate /ModDate 已注入）
```

### 1.2 三条关键链路

| 链路 | 入口 | 经过 | 出口 |
|---|---|---|---|
| **选择** | 优化页/详情页「选择模板」按钮 | TemplateSelector（registry 过滤）→ 用户点卡片 | `selectedTemplate` 写入页面 state |
| **预览** | 卡片右下角眼睛图标 | css 模式：CSS 示意图 + iframe「真实排版」；react 模式：`lazyComponent()` 动态 import 渲染真实组件 | 弹窗内即时预览，「使用此模板」直接选中 |
| **导出** | 优化/重新导出 PDF | `_ALLOWED_TEMPLATES` 白名单 → `generate_pdf(optimized_json, "{key}.html")` → Jinja → Playwright → PyMuPDF 元数据 | PDF 文件 + 文档属性 |

### 1.3 双实现对应关系（前端 React 组件 ↔ 后端 Jinja 模板）

jadeAI 迁移模板采用**双实现**，同一套视觉 Token、同一份字段映射，保证「预览即所得、导出即预览」：

| 模板 key | React 组件（预览） | Jinja 模板（PDF） | 视觉 Token |
|---|---|---|---|
| `jade-classic` | `frontend/src/components/templates/jade-classic.tsx` | `backend/app/templates/jade-classic.html` | `#1f2937` 标题 / `#6b7280` 弱化 / `#d1d5db` 分隔 |
| `jade-twocol` | `frontend/src/components/templates/jade-twocol.tsx` | `backend/app/templates/jade-twocol.html` | `#2563eb→#1e3a8a` 侧栏渐变 / `#111827` 标题 |

字段映射（与全站 `ResumeParseResult` 对齐，兼容旧项目形状）：

- `personal_info.{name,email,phone}` → 页眉 / 侧栏联系方式
- `summary` → 「个人概述」
- `experience[{title,company,start,end,points}]` → 「工作经历」（时间轴/圆点条目）
- `projects[{name,role,start,end,points,description,tech}]` → 「项目经历」（`points` 优先，`description` 兜底）
- `skills[]` → 「专业技能」（单栏行内 / 双栏标签云）
- `education[{school,degree,major,start,end}]` → 「教育背景」（单栏下行 / 双栏侧栏）

---

## 2. 核心代码说明

### 2.1 前端：TemplateRegistry（`frontend/src/lib/template-registry.tsx`）

```ts
export interface TemplateMetadata {
  id: string                    // 模板 ID（= 后端 templates/{id}.html）
  name: string                  // 展示名
  author: string                // 作者 / 来源
  version: string               // 版本（写入 PDF 文档属性）
  category: TemplateCategory    // business/creative/tech/academic/simple
  industries: string[]          // 适用行业
  tags: string[]                // 标签（过滤）
  theme: TemplateTheme          // 主题色 {primary, secondary, bg, text}
  layout: 'dual' | 'single' | 'banner' | 'dark'
  desc: string
  renderMode: 'css' | 'react'   // 预览模式
  previewImageUrl?: string      // 静态预览图 URL（可选）
  lazyComponent?: () => Promise<{ default: ComponentType<TemplatePreviewProps> }>
  icon: React.ReactNode
  builtin: boolean
}
```

`TemplateRegistry` 单例提供 `register / get / getRequired / list / byCategory / allTags / allIndustries / filter / subscribe`。14 套模板在模块底部一次性 `registerAll`。React 模板的 `lazyComponent` 用动态 `import()` 触发 webpack 代码分割——只有点开预览才会下载对应组件 chunk。

### 2.2 前端：选择器升级（`frontend/src/components/TemplateSelector.tsx`）

- **网格/列表视图**：antd `Segmented` 切换；列表态一行一张卡（缩略图 + 名称 + 分类 + 描述 + 行业标签）。
- **分类过滤**：`Tabs`（全部 / 商务通用 / 创意设计 / 技术极客 / 学术严谨 / 简约清新），每项带数量 `Badge`。
- **标签过滤**：`Tag.CheckableTag` chips（#双栏、#单栏、#深色…）。
- **搜索**：`Input` 匹配 id/name/desc/author/industries/tags。
- **使用中高亮**：选中卡片 2px 主题色描边 + 「当前使用中」徽章。
- **预览弹窗**：
  - css 模式：「示意图」（放大 CSS 模拟）+「真实排版」（iframe 指向 `/api/templates/{key}/preview`，后端 Jinja 真实渲染）；
  - react 模式：`lazyComponent()` 动态加载组件 + `Suspense`，渲染 `DEMO_RESUME` 演示数据，1:1 还原 PDF 版式；
  - 底部展示作者/版本 + 行业/标签 chips + 「使用此模板」一键选中。
- **稳定性要点（踩坑记录）**：antd v5 嵌套弹窗**同一批次同时关闭**时，离开动画互相取消，子弹窗 portal 会残留可见（`display` 未被置 none）。解法：预览弹窗常驻不随 state 卸载 + 「使用此模板」先关预览、经 `afterClose` 回调再关主弹窗。

### 2.3 前端：兼容层（`frontend/src/lib/templates.tsx`）

`TEMPLATE_OPTIONS / TEMPLATE_LABELS / DEFAULT_TEMPLATE` 三个导出从 registry 派生，旧调用方（优化页、历史详情页）零改动接入。

### 2.4 后端：元数据单一事实源（`backend/app/services/template_meta.py`）

`TEMPLATE_META: {key → BackendTemplateMeta}`，字段与前端 `TemplateMetadata` 对齐；`get_template_meta()` 兼容传 `.html` 后缀。新增模板必须先在此登记。

### 2.5 后端：PDF 文档属性注入（`backend/app/services/pdf_metadata.py`）

```python
@dataclass
class PdfMetadata:
    template_name: str      # → /Title（"{name}简历"）
    template_id: str        # → HTML <meta name="template-id">
    template_version: str
    title / author / subject / keywords / creator / producer
    generated_at: datetime | None   # → /CreationDate /ModDate（PDF 日期格式 D:YYYYMMDDHHmmSS+08'00'）
```

两个入口：

1. `inject_pdf_metadata(pdf_bytes, meta)` — PyMuPDF `set_metadata()` 后处理，失败只告警不抛错（保底出文件）；
2. `inject_html_meta(html, meta)` — 向 `<head>` 注入 `<title>/<meta name=author|description|keywords|dcterms.created|dcterms.modified|template-id|template-version>`（幂等），WeasyPrint 回退路径直接读取。

`resume_renderer.html_to_pdf / html_to_pdf_async` 新增 `metadata` 参数，在 `page.pdf()` 之后调用注入；`pdf_generator.generate_pdf / generate_pdf_sync / generate_pdf_from_layout_html` 统一经 `_build_pdf_metadata(template_name)` 构造（未登记模板用文件名兜底），`inject_metadata=True` 默认开启。

### 2.6 后端：模板预览 API（`backend/app/api/templates.py`）

```
GET /api/templates                      → {total, items:[{id,name,author,version,category,industries,tags,theme,desc,preview_url}]}
GET /api/templates/{template_id}/preview → 完整 HTML（演示数据经 Jinja 渲染，Cache-Control: no-store）
```

挂载于 `main.py`：`app.include_router(templates_api.router, prefix="/api/templates")`。前端 iframe 经 Next `rewrites`（`/api/* → :8000`）同源加载，无跨域问题。

---

## 3. PDF 配置说明（打印与元数据）

### 3.1 打印媒体查询与分页控制（模板 HTML 约定）

> 2026-10-22 起已收敛为**打印基座**：`@page` 边距、`print-color-adjust`、条目级
> `break-inside`、深色侧栏 `box-decoration-break` 全部由 `app/services/print_css.py`
> 按 `layout_features` 生成、`render_template_html()` 注入（PDF 导出与 iframe 预览
> 同一链路），**模板 HTML 不再手写这些规则**。模板只保留：
>
> ```css
> body { width: 210mm; min-height: 297mm; }    /* A4 纸张尺寸（历史约定，保留即可） */
> ```
>
> 条目容器沿用 `.exp-item / .proj-item / .edu-item / .side-block / .timeline-item`
> 之一即自动获得条目级分页保护（**不要**加在 section 上：长 section 会迫使整块跳页
> 产生大量空白）。新增/改模板后跑 `scripts/verify_print_base.py`（前后位图对比，
> 容差 25%）与 `scripts/check_template_sync.py`（449 项一致性断言）。

要点：
- `print-color-adjust: exact` 由基座统一注入，漏写不再丢渐变（Chromium 打印历史坑）；
- 双栏模板 `full_bleed_header: true` → 基座自动 `@page margin: 0`，内容区自设 padding 实现满版 bleeding 侧栏；
- 深色侧栏/整页深色底靠 `sidebar_dark` / `dark_background` 特征自动获得跨页底色延续。

### 3.2 文档属性注入参数

| PDF /Info 字段 | 来源 | 示例 |
|---|---|---|
| `/Title` | `{template_name}简历` | `经典单栏专业版简历` |
| `/Author` | `template_meta.author` | `jadeAI (twwch/JadeAI) 迁移` |
| `/Subject` | `由智能简历平台生成 · 模板: {name}` | |
| `/Keywords` | `简历,resume` | |
| `/Creator` | `SmartResume` | |
| `/Producer` | `SmartResume PDF Engine` | |
| `/CreationDate`、`/ModDate` | 生成时间（UTC+8） | `D:20261022153155+08'00'` |
| HTML `template-id` / `template-version` | `<meta>`（WeasyPrint 路径可读） | `jade-classic` / `1.0.0` |

调用方式：

```python
# 默认注入（推荐）
pdf = await generate_pdf(optimized_json, "jade-classic.html")

# 关闭注入（特殊场景）
pdf = await generate_pdf(optimized_json, "jade-classic.html", inject_metadata=False)

# 自定义元数据（布局编辑器导出）
pdf = await generate_pdf_from_layout_html(body_html, css, resume_json, pdf_metadata=my_meta)
```

渲染回退链（任一环节失败自动降级，元数据不丢）：
`Playwright 异步 → Playwright 同步（线程池）→ WeasyPrint（读 HTML <meta>）→ ReportLab 流式回退（无模板版式）`。

---

## 4. 新模板迁移 SOP（后续新增模板）

以迁移第 3 套 jadeAI 模板（如 `elegant.tsx`）为例，**必须同步 4 处**（白名单已改为从 `TEMPLATE_META` 派生，不再手改；`.githooks/pre-commit` 会在提交时自动跑 `scripts/check_template_sync.py` 拦截漏同步）：

1. **后端元数据登记（唯一后端入口）** — `backend/app/services/template_meta.py` 的 `TEMPLATE_META` 增加 `BackendTemplateMeta(id="jade-elegant", name=..., author="jadeAI ... 迁移", version="1.0.0", category=..., industries=..., tags=..., theme=..., desc=..., layout_features=LayoutFeatures(...))`。
   `optimization.py::_ALLOWED_TEMPLATES` 与 `pdf_styler.py::JINJA2_STYLE_TEMPLATES` 均由此派生，**无需改动**。
   `layout_features` 决定打印分页基座的行为（`@page` 边距、条目级分页保护、深色侧栏跨页延续），字段见 `app/services/print_css.py::LayoutFeatures`——**写错这里 = PDF 分页出错**。
2. **后端 Jinja 模板** — 新建 `backend/app/templates/jade-elegant.html`：只写**视觉样式**（配色/字体/条目外观），`@page` 边距、`break-inside`、`print-color-adjust`、深色侧栏 `box-decoration-break` 等**分页规则不要写**——渲染时由 `print_css.build_print_css` 按 `layout_features` 统一注入（`pdf_generator.render_template_html` 是唯一渲染收口，PDF 导出与 iframe 预览共用）。条目容器沿用 `.exp-item / .proj-item / .edu-item / .timeline-item` 之一即可自动获得分页保护；`<meta name="template-id">` 也由渲染器自动补，无需手写。

   **主题变量约定（2026-10-22 起，验收 #6）**：视觉样式里的主色/辅色/字体/字号/行距/章节间距**不要写硬编码值**，一律写成 `var(--tpl-primary, <原值>)` 形式（六个变量：`--tpl-primary` / `--tpl-accent` / `--tpl-font` / `--tpl-base-size` / `--tpl-line-height` / `--tpl-section-gap`）。用户主题定制只改 `:root` 变量值，模板零改动即获得主题能力；回退值保证无用户主题时渲染与改造前一致（`scripts/verify_print_base.py` 守护）。另需在 `template_meta.py` 登记 `text_defaults`（模板自身的字号/行距/章节间距基线，非默认衬线栈还要加 `fontFamily`），并在前端 registry 同步 `textDefaults: TD({...})`——漏同步会被 `check_template_sync.py` 拦下。
3. **前端注册表 + React 组件** — `frontend/src/lib/template-registry.tsx` 的 `registerAll` 增加 `TemplateMetadata`（**`layoutFeatures: LF({...})` 必须与后端 `layout_features` 逐字段一致**，快测会比对；react 模式填 `lazyComponent: () => import('@/components/templates/jade-elegant')`）；新建 `frontend/src/components/templates/jade-elegant.tsx`：`export default function ({ resume }: TemplatePreviewProps)`，从 jadeAI 源码移植结构（sections 驱动、`isSectionEmpty` 空值守卫、`dateRange/itemPoints` 兼容函数），Tailwind class 改内联样式并抽 `token` 常量与后端 CSS 对齐；根节点加 `className="jade-elegant-template"` 便于 E2E 断言。
4. **回归验证** — 更新 `scripts/verify_template_consistency.py` 的 `EXPECTED`（N+1 张卡）与相应计数断言；跑：

```bash
# 秒级快测（静态解析 + 渲染断言，pre-commit 同款；CI 加 --deep 做白名单运行时比对）
backend/.venv/Scripts/python.exe scripts/check_template_sync.py
# 打印基座前后对比（改 print_css / layout_features 后必跑）
backend/.venv/Scripts/python.exe scripts/verify_print_base.py -t jade-elegant
# 后端冒烟（venv）
cd backend && .venv/Scripts/python.exe <smoke>.py
# 前端类型检查（受管 node）
cd frontend && NODE_PATH=... node.exe node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# E2E（需 :3000 / :8000 / :6379 在线）
cd backend && .venv/Scripts/python.exe ../scripts/verify_template_consistency.py
```

验收口径：选择器 N+1 张卡且名称齐全；分类/标签计数与登记一致；预览弹窗渲染演示数据；`test-template` 导出 PDF 合法且 `/Title` 含新模板名。

---

## 5. 变更清单与回归结果

### 5.1 新增文件

| 文件 | 作用 |
|---|---|
| `frontend/src/lib/template-registry.tsx` | 元数据接口 + Registry 单例 + 14 套注册 |
| `frontend/src/lib/template-demo-data.ts` | 预览演示简历（前后端同构） |
| `frontend/src/components/templates/jade-classic.tsx` | 经典单栏 React 组件 |
| `frontend/src/components/templates/jade-twocol.tsx` | 现代双栏 React 组件 |
| `backend/app/services/pdf_metadata.py` | PdfMetadata + HTML/PyMuPDF 双通道注入 |
| `backend/app/services/template_meta.py` | 后端模板元数据单一事实源 |
| `backend/app/api/templates.py` | 列表 + 预览端点 |
| `backend/app/templates/jade-classic.html` | 经典单栏 Jinja 模板 |
| `backend/app/templates/jade-twocol.html` | 现代双栏 Jinja 模板 |

### 5.2 修改文件

| 文件 | 改动 |
|---|---|
| `frontend/src/lib/templates.tsx` | 重写为 registry 兼容层（导出不变） |
| `frontend/src/components/TemplateSelector.tsx` | 网格/列表、分类/标签/搜索、使用中高亮、双模式预览弹窗、嵌套弹窗关闭时序修复 |
| `backend/app/services/resume_renderer.py` | `html_to_pdf/_async` 增加 `metadata` 参数 + `_apply_metadata` |
| `backend/app/services/pdf_generator.py` | `_build_pdf_metadata` + 全链路注入参数 |
| `backend/app/api/optimization.py` | `_ALLOWED_TEMPLATES` +2 |
| `backend/app/services/pdf_styler.py` | `JINJA2_STYLE_TEMPLATES` +2 |
| `backend/app/main.py` | 注册 `/api/templates` 路由 |
| `scripts/verify_template_consistency.py` | 12 → 14 模板；新增 UI/预览/元数据断言 |

### 5.3 回归结果（2026-10-22）

| 验证项 | 结果 |
|---|---|
| 前端 `tsc --noEmit` | 通过（0 错误） |
| 后端冒烟（元数据/渲染/白名单/兜底） | 6/6 通过 |
| PDF 元数据端到端（3 模板 × test-template） | 3/3 通过（/Title /Author /CreationDate 均正确） |
| 预览 API（3 模板 + 404） | 通过 |
| React 组件预览（2 套 jade） | 渲染成功、无 JS 异常 |
| E2E `verify_template_consistency.py` | **32/32 通过** |

截图存档：`.workbuddy/tmp/tpl_01_optimize_selector.png`（选择器）、`tpl_01b_preview_modal.png`（真实排版 iframe）、`tpl_04_react_preview_classic.png` / `tpl_05_react_preview_twocol.png`（React 高保真预览）。

---

## 6. 已知限制与后续建议

1. **CSS 模拟预览与真实版式存在偏差**：12 套自有模板仍是 css 模式；如需全部升级为「真实排版」，把对应 Jinja 模板接入预览 API 即可（端点已通用），或参照 jade 双实现补 React 组件。
2. **`previewImageUrl` 未使用**：当前预览走 CSS/组件/iframe 三通道；若后续引入静态缩略图 CDN，在元数据里补 URL 并在选择器加一层懒加载 `<img>` 即可。
3. **模板版本号目前均为 1.0.0**：后续改版时同步 `template_meta.py` 与前端 registry 的 `version`，PDF 文档属性会自动反映。
4. **i18n**：模板名/分类为中文硬编码，与全站一致；如做多语言需把 `CATEGORY_LABELS` 与元数据提为字典表。
