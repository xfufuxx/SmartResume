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

---

## 7. 批次 A 移植完成记录（2026-10-22，15 套全部落地）

按任务书「任务 4」的批次 A 清单推进，15 套全部落地，模板总数 **14 → 27**。

### 7.1 实现方式：Jinja 单实现 + iframe 真实排版

批次 A 的 13 套新增模板统一采用**后端 Jinja 单实现**（`renderMode: 'css'`），而非 jade-classic/twocol 那套「React 组件 + Jinja」双实现。理由：

- 预览弹窗的「真实排版」页签直接打 `/api/templates/{id}/preview`，走的是**与 PDF 导出完全相同的 `render_template_html` 链路**——预览与导出是同一份 HTML，所见即所得是结构性保证，比两套实现各自维护更不容易漂移；
- 单套只需同步 3 处（元数据 / Jinja HTML / 前端注册表），不必再写 React 组件，边际成本大幅下降。

两处配套约定（新增模板必须遵守）：

- **不写 `@page` / `break-inside` / `print-color-adjust`**：全部由 `print_css.build_print_css` 按 `layout_features` 注入（基座插在模板私有样式之后，同名规则以基座为准）；条目容器沿用 `.exp-item` / `.proj-item` / `.edu-item` / `.timeline-item` / `.side-block` 之一即可自动获得分页保护。
- **零边距模板用 `.sidebar` / `aside` 类名**：`sidebar_dark=True` 时基座会补 `box-decoration-break: clone`，保证深色侧栏跨页不断色。

### 7.2 模板清单（15 套）

| ID | 名称 | 版式特征（`layout_features`） | 分类 |
|---|---|---|---|
| `jade-classic` | 经典单栏专业版 | 单栏 15/16mm | business |
| `jade-twocol` | 现代双栏创意版 | 全幅 + 左深侧栏 73.5mm + 时间轴 | creative |
| `jade-minimal` | 极简留白版 | 单栏 18/20mm | simple |
| `jade-modern` | 现代渐变头部版 | 全幅头部 | business |
| `jade-timeline` | 时间线版 | 时间轴 | business |
| `jade-sidebar` | 浅色侧边栏双栏版 | 零边距 + 左浅侧栏 65mm | business |
| `jade-executive` | 高管稳重版 | 全幅头部 | business |
| `jade-professional` | 专业深蓝版 | 单栏 15/16mm | business |
| `jade-creative` | 创意渐变版 | 单栏 14/15mm | creative |
| `jade-ats` | ATS 友好纯文本版 | 单栏 15/16mm | simple |
| `jade-academic` | 学术版 | 单栏（教育前置 + 编号章节） | academic |
| `jade-elegant` | 优雅柔和版 | 单栏 17/18mm | business |
| `jade-developer` | 开发者双栏版 | 零边距 + 左深侧栏 68mm | tech |
| `jade-designer` | 设计师作品集版 | 单栏 18/18mm（左标签网格） | creative |
| `jade-startup` | 初创活力版 | 单栏 14/15mm 圆角头部 | business |

主题变量一律写成 `var(--tpl-primary, <原值>)` 等六变量形式，`text_defaults` 登记各自基线（`sectionGapMm ≈ CSS 回退 px ÷ 3.78`）。

### 7.3 回归结果

| 验证项 | 结果 |
|---|---|
| `check_template_sync.py` | **858/858**（454 → 858，新增 13 套 × 31 项） |
| `verify_all_templates.py`（27 套全量 PDF + 文档属性） | **27/27** |
| `verify_template_consistency.py`（含批次 A 全量 15 套 PDF 导出） | **54/54**（41 → 54） |
| `verify_template_gallery.py` | **13/13** |
| 前端 `tsc --noEmit` | 0 错误 |

批次 A 的 15 套均用**唯一 marker 打进简历内容**，断言其出现在导出 PDF 的文本层——证明导出确由该模板渲染器产出，而非静默回退默认模板（即任务书验收 #4「绝不出现预览是 A、PDF 是默认模板」）。

### 7.4 本批踩坑

1. **`test-template` 限流 10 次/分钟**：全量 15 套连跑必然触发，第 10 套起返回 429（84 字节 JSON），被当 PDF 传给 PyMuPDF 会抛 `FileDataError`——**极易误判成模板渲染失败**。E2E 已加 429 退避（等满 62s 窗口重试）。
2. **快测与打印基座条件不一致**：`check_template_sync.py` 判 `@page` 边距时只看了 `full_bleed_header`，漏了基座里 `page_margin_y_mm == 0` 也会输出 `margin: 0` 的分支，导致 `jade-sidebar` 这类「零边距但非全幅头部」的模板被误判。已对齐条件。
3. **名称断言未归一化**：E2E 提取卡片文本时会去掉全部空白，而 `EXPECTED` 里「ATS 友好纯文本版」含空格，比较前必须同样 `re.sub(r"\s+", "", e)`，否则恒不匹配。

### 7.5 剩余批次

批次 B–G（行业/职业、现代/科技、创意/艺术、风格/文化、专业领域、版式变体，共 29 套）尚未开始，按 §4 SOP 与 §7.1 的单实现模式继续推进即可。

---

## 八、所见即所得缺陷修复（2026-10-22，P0）

### 8.1 现象：所有回归都绿，但预览与导出并不一致

批次 B 开工时顺手实测 PDF 文本层，发现**导出字号明显小于设计值**：

| 模板 | 姓名设计字号 | PDF 实测 | 正文设计 | PDF 实测 |
|---|---|---|---|---|
| `jade-minimal` | 26pt | **21.06pt** | 8.5pt | **6.88pt** |
| `jade-nordic` | 25pt | **21.45pt** | 8.5pt | **7.29pt** |

缩放系数 ≈ **0.81**，且**每套模板各不相同**（取决于各自页边距）。

### 8.2 根因

模板 `body` 一律写死 `width: 210mm` 且**没有 padding**——页边距完全交给 `@page`：

- **打印（PDF）**：`@page { size: A4; margin: 20mm }` 生效 → 内容区只有 `210-2X` mm → Chromium 放不下 210mm 的 body → **整体缩放** `(210-2X)/210`（X=20mm 时 0.81）。
- **屏幕（iframe 预览）**：`@page` 在屏幕媒体下**根本不生效** → 既不缩放、也没有任何页边距，内容贴边。

于是「预览 10pt 零边距、导出 8.1pt 有边距」——**直接违背任务书验收 #4 的所见即所得**。

> 值得记一笔：此前快测 858/858、全量 PDF 27/27、E2E 54/54 **全部通过**，却没发现这个问题。因为现有断言只验证「PDF 能生成、marker 在文本层、模板名齐全」，**没有任何一条验证「预览与导出的视觉是否一致」**。这是回归覆盖的盲区。

### 8.3 修法：只改打印基座，32 套模板零改动

`print_css.build_print_css` 新增一段纸张盒模型规则（位于模板私有样式之后，天然覆盖 `width: 210mm`）：

```css
@media print {
  body { box-sizing: border-box; width: auto;
         min-height: calc(297mm - {2Y}mm); padding: 0; margin: 0; }
}
@media screen {
  html { background: #eceef1; }
  body { box-sizing: border-box; min-height: calc(297mm - {2Y}mm);
         padding: {Y}mm {X}mm; margin: 0 auto; }
}
```

- **打印态**：`width: auto` → body 正好填满内容区，`@page` 提供每页都有的页边距 → **不再缩放**。
- **屏幕态**：用 `padding` 还原等价页边距 → 预览里也能看到留白，且内容区宽度与 PDF 完全相同。
- `min-height` 按 `297mm - 2Y` 计算：既保证深色背景铺满一页，又不会因为超出内容区高度而**多吐一页空白**。

修复后实测：26pt → **25.99pt**、8.5pt → **8.5pt**，页数仍为 1。

### 8.4 新增守护：`scripts/verify_wysiwyg.py`

为堵住「回归全绿但视觉不一致」这个盲区，新增专项回归（**29/29**），逐套断言：

1. 屏幕 body 内容区宽 == `210 - 2X` mm（±1.5mm）
2. 屏幕字号 == 模板 CSS 设计值（证明未被缩放）
3. **PDF 最大字号与屏幕字号一致**（±0.6pt）——证明预览与导出同源
4. PDF 文本左边界 ≥ 声明页边距（证明 `@page` 生效）

### 8.5 连带踩坑

`check_template_sync.py` 用 `html.rfind("@page")` 定位 `@page` 块，而新增规则的注释里出现了 `@page` 字样 → **rfind 命中注释而非规则**，32 套集体误报。已双保险：断言收紧为 `rfind("@page {")`，同时注释改为「A4 页边距规则」。

---

## 九、批次 B 完成记录（行业/职业 5 套）

模板总数 **27 → 32**，jade 系列达 **20 套**。

| ID | 名称 | 版式 | 设计语言 |
|---|---|---|---|
| `jade-nordic` | 北欧冷淡版 | 单栏 18mm | 冷灰蓝调 + 超大留白，竖线标签 + 淡灰胶囊 |
| `jade-corporate` | 企业正式版 | 单栏 16mm | 左侧竖色条页眉 + 实心深蓝分节标题条 |
| `jade-consultant` | 咨询顾问版 | 单栏 16mm | 铜色双线页眉 + 编号章节 + 编号要点（案例式） |
| `jade-finance` | 金融投行版 | 右侧窄栏 52mm | 深藏蓝页眉 + 金色细线，右栏放技能与教育，高密度 |
| `jade-medical` | 医疗健康版 | 单栏 16mm | 淡青底圆角页眉 + 十字装饰 + 青色圆点标题 |

沿用 §7.1 的 Jinja 单实现模式（预览 iframe 与 PDF 共用 `render_template_html`），单套只需同步 3 处。

### 9.1 剩余批次

批次 C–G（现代/科技、创意/艺术、风格/文化、专业领域、版式变体，共 24 套）尚未开始。

---

## 十、批次 C 完成记录（现代/科技 5 套）

模板总数 **32 → 37**，jade 系列达 **25 套**。

| ID | 名称 | 版式 | 设计语言 |
|---|---|---|---|
| `jade-gradient` | 渐变现代版 | 全幅头部 | 紫→粉渐变头部 + 渐变圆点要点 + 渐变技能胶囊 |
| `jade-metro` | 磁贴格纹版 | 单栏 15mm | Metro 纯色块拼接页眉 + 交替配色技能磁贴，无圆角 |
| `jade-material` | 质感卡片版 | 单栏 15mm | 浅灰底 + 白色圆角卡片分节 + chip 技能 |
| `jade-coder` | 代码终端版 | 单栏 15mm | 终端窗口页眉 + 等宽字体标题/日期 + `<tag />` 技能 |
| `jade-blocks` | 块状网格版 | 单栏 15mm | 蓝色块页眉 + 序号方块标题 + 浅底卡片条目 |

本批含 1 套全幅头部（`jade-gradient`）：`@page` 边距为 0，头部顶到纸边，
主体内边距由模板自己的 `.content { padding: 14mm 18mm 16mm }` 提供——这是全幅
模板与常规模板唯一的结构差异（常规模板靠 `@page` 给边距，主体不需要额外 padding）。

### 10.1 剩余批次

批次 D–G（创意/艺术、风格/文化、专业领域、版式变体，共 19 套）尚未开始。
