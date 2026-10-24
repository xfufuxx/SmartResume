# AI 职业照功能交付文档

> 参考 JadeAI 的 linkedin-photo 实现，为智能简历增加「AI 职业照」生成与「简历职业照」管理两块能力。
> 交付日期：2026-10-24。全部回归绿：check_template_sync 1757/1757、verify_all_templates 224/224、
> test_ai_photo 24/24、前端全量 344/344、verify_photo_page E2E 19/19。

## 1. 功能概览

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| AI 职业照生成 | 左侧导航「求职工具 → AI 职业照」`/photo` | 上传自拍 → 选比例/写提示词 → Gemini 生成 → 下载或一键设为简历头像 |
| 简历职业照管理 | 简历详情页右上角「主题」抽屉 → 职业照区 | 上传/移除头像，一寸照（5:7）或圆形（1:1）两种形状，实时预览同步 |
| 布局编辑器头像块 | 布局编辑器（`/layout`） | 头像作为可拖拽缩放的自由块（默认 30×42mm 右上角） |

## 2. 架构与数据流

```
┌─────────────┐   POST /api/ai-photo/generate   ┌──────────────────────┐
│ /photo 页面  │ ───────────────────────────────▶ │ app/api/ai_photo.py  │
│ (Key 自带)   │   {image, prompt, apiKey, ...}   │  - 登录鉴权           │
└─────────────┘                                  │  - Redis 日额度(20)   │
                                                 │  - 失败退还额度        │
                                                 └──────────┬───────────┘
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ app/services/        │
                                                 │ ai_photo.py          │
                                                 │  - dataURL 解析/限重  │
                                                 │  - 提示词组装         │
                                                 │  - Gemini REST 流式   │
                                                 │  - 错误分类           │
                                                 └──────────┬───────────┘
                                                            ▼
                                              generativelanguage.googleapis.com
```

### 2.1 后端

- **`app/services/ai_photo.py`**（新增）：纯函数式服务层，不碰 FastAPI/DB。
  - `parse_data_url()`：`data:image/...;base64,` 或裸 base64 → `(mime, bytes)`；限 10MB。
  - `build_final_prompt()`：基础提示词 + `aspect ratio: X:Y` + `Additional requirements: ...`。
  - `extract_image_from_response()`：兼容 camelCase（`inlineData`）与 snake_case（`inline_data`）。
  - `generate_professional_photo()`：httpx `AsyncClient` 流式读取，错误分类为
    `invalid_key`(400) / `safety_filtered`(422) / `generate_failed`(504)。
- **`app/api/ai_photo.py`**（新增）：`POST /api/ai-photo/generate`。
  - **错误一律 HTTP 200 + body.error**（前端按 error 字段分支），与投递链路一致。
  - Key 由前端随请求上传，**服务端不落库**（localStorage 持久化在用户浏览器）。
  - 额度：`aiphoto:count:{user_id}:{YYYYMMDD}` 自然日分桶，上限 `AI_PHOTO_DAILY_LIMIT=20`；
    首次 incr 设 86400s 兜底 TTL；生成失败 `_release_quota` 递减退还（不为负）。
- **`app/templates/_avatar.html`**（新增）：56 套模板共用的职业照渲染宏。

### 2.2 头像渲染链（模板层）

```
personal_info.avatar (dataURL) ──▶ _avatar.html 宏 ──▶ .tpl-avatar-slot
                                              ▲
themeConfig.avatar_style (oneInch|circle) ────┘ 经调用点显式透传
```

- **宏签名**：`avatar(resume, size, placement, extra_style, avatar_style)`。
  - ⚠️ **Jinja 宏上下文隔离**：`template.render()` 传入的变量在宏内不可见（恒 Undefined），
    55 处调用点必须显式写 `avatar_style=avatar_style`（由 `scripts/patch_avatar_callsites.py` 批量生成）。
  - `jade-twocol` 的侧栏头像 markup 在模板体内（非宏内），直接读渲染上下文，自行条件化。
- **形状**：oneInch = `aspect-ratio: 5 / 7` + `border-radius: 4px`；circle = `1 / 1` + `9999px`。
- **槽位定位**：`.tpl-avatar-slot` 的 top/right 由 `print_css.build_print_css` 按媒体状态注入
  （屏幕态避开模拟页边距、打印态贴内容区），保证预览 = 导出。
- **主题参数**：`resume_theme.normalize_theme_config` 校验 `avatar_style`；预览与导出同链。

### 2.3 前端

| 文件 | 职责 |
| --- | --- |
| `src/app/photo/page.tsx` | 三步向导：Key → 上传（含摄像头 Modal）→ 选项 → 结果；客户端压缩长边 ≤1024px / JPEG 0.9（与 JadeAI 同参数） |
| `src/components/ThemeDrawer.tsx` | 职业照区：上传（200px / JPEG 0.85）/移除、一寸照/圆形 Segmented、64×80 预览框 |
| `src/lib/api.ts` | `aiPhoto.generate()`；错误走 200+body.error 的注释警示 |
| `src/lib/layout/buildLayout.ts` | 头像块：30×42mm 右上角 `fixed` 块，头部区收窄 146mm，通栏块 `flowFloor` 下探防重叠 |
| `src/lib/layout/rebuildContent.ts` | 头像回写：payload `{url}` → 提取 URL 字符串写入 `personal_info.avatar` |
| `src/lib/template-demo-data.ts` | 演示数据带完整 avatar dataURL（注意：对象字面量内禁 `//` 注释，check_template_sync 用 `ast.literal_eval` 解析） |

「设为简历头像」复用既有端点零后端改动：`optimize.list()` → `optimize.get()` → 改
`personal_info.avatar` → `editor.updateContent`（PUT /content，须显式传完整 personal_info）→ 链式 reexport。

## 3. 关键修复（本功能牵引出的既存缺陷）

1. **Jinja 宏上下文隔离致 circle 形状失效**：宏内 `avatar_style` 恒 Undefined → 永远回退 oneInch。
   宏加参数 + 55 处调用点透传 + twocol 行内条件化。
2. **5 套老模板（compact/elegant/modern/professional/simple）缺 body `width:210mm` / `background`**：
   屏幕态整页灰、预览内容区 746px vs PDF 680px（WYSIWYG 破坏）。补齐后复量
   `{x:33.2, w:793.7, content:680.3}` 精确达标。
3. **E2E 定位陷阱**：`text=保存` 子串命中提示文案 DIV（"Key 仅保存在…"），且 antd 给两汉字按钮
   文本插空格（"保 存"）。保存按钮/状态 Tag 加 `data-testid`，E2E 改 testid 定位。

## 4. 测试矩阵

| 套件 | 数量 | 覆盖 |
| --- | --- | --- |
| `backend/tests/test_ai_photo.py` | 24 | dataURL 解析×5、提示词×5、响应提取×4、错误分类×5、**额度×5**（fake Redis：首消 TTL/超限拦截/退还/零值 noop/Redis 异常吞噬） |
| `scripts/verify_all_templates.py` | 224 | 56 套 × 4（HTML 断言含头像 slot/ratio/radius、circle 变体、PDF 生成+属性、体积 ≤200KB） |
| `scripts/verify_photo_page.py` | 19 | 页面结构、Key 持久化、上传压缩、按钮启用条件、错误映射（环境感知）、ThemeDrawer 职业照全流程、清理还原 |
| 前端 `node --test` | 344 | 头像块生成×7、回写、几何/分页/溢出等既有用例 |
| `scripts/check_template_sync.py` | 1757 | 三处同步（template_meta / Jinja / templates-register） |

## 5. 运维备注

- 后端 `RELOAD=false` 时改 `template_meta.py` / Jinja 模板必须重启才生效。
- 沙箱无外网：E2E 的上游错误映射检查为环境感知（可达时严格断言 `invalid_key`，不可达时降级）。
- 头像相关回归守护：`verify_wysiwyg.py`（版式一致）、`verify_avatar_visual.py`（11 张截图）。
