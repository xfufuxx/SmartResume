# 前端改造清单：iOS 风格 + 彻底移除 VIP/付费

> 状态：**待确认**。本文件仅列出改造方案，未改动任何代码。
> 技术栈：Next.js 14（App Router）+ React 18 + TypeScript + antd v5（已存在，不新增）。
> 约束：只改展示层；不改后端 API 路径/参数/返回结构；不改业务逻辑与状态流；不新增第三方 UI 库/CSS 框架；保持目录结构与命名；功能等价（付费门槛除外）。

---

## 一、项目现状速览

- 入口：`src/app/layout.tsx`（antd `ConfigProvider` 主题 + `ThemeProvider` 明暗切换）。
- 用户端外壳：`src/components/AppLayout.tsx`（当前是桌面 **侧边栏 Sider + 顶栏 Header**）。
- 管理端：`src/app/admin/page.tsx`（自带 Layout，未使用 AppLayout）。
- 全局样式/设计变量：`src/app/globals.css`（SaaS 仪表盘风格，主色 `#2563EB`）。
- 接口封装：`src/lib/api.ts`；类型：`src/types/index.ts`；鉴权：`src/lib/auth.ts`。
- 共约 20 个页面 + 2 个组件 + 5 个 lib 文件（其余是 node_modules/.next，非源码）。

### 付费/VIP 代码定位结论（精确）
前端**不存在** `if (user.isVip) { showPaywall(); return }` 之类的功能拦截分支——所有核心功能默认可用。付费相关仅存在于**营销位与后台计费管理 UI**，因此“移除限制判断使功能免费”在本项目无对应代码，只需删除付费相关 UI/文案/接口调用/类型字段即可。

---

## 二、VIP/付费 清理清单（删除项 + 精确位置）

### 2.1 文件 / 组件 / 路由 / store / 工具函数

| # | 位置 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/components/AppLayout.tsx` L168–187 | **删除** `promoCard` 整块（"升级为 VIP / 立即升级"） | 侧边栏营销卡 |
| 2 | `src/components/AppLayout.tsx` L220 | **删除** `{promoCard}` 引用 | — |
| 3 | `src/components/AppLayout.tsx` L335–337 | **删除** "福利中心" `GiftOutlined` 按钮 | 福利中心属营销入口 |
| 4 | `src/components/AppLayout.tsx` L16、L18 | **删除** 导入 `GiftOutlined`、`CrownOutlined` | 删除营销位后成为未使用导入 |
| 5 | `src/app/messages/page.tsx` L11 | **删除** 导入 `CrownOutlined` | — |
| 6 | `src/app/messages/page.tsx` L41 | **删除** `MSG_TYPE_MAP` 中 `vip: { …会员通知… }` 条目 | 会员消息分类 |
| 7 | `src/app/admin/page.tsx` L74 | **删除** `ADMIN_MENU` 中 `{ key:'finance', label:'财务管理' }` | 财务菜单项 |
| 8 | `src/app/admin/page.tsx` L383–429 | **删除** 整个 `FinancePanel` 组件（订单表 + 套餐表） | 计费管理面板 |
| 9 | `src/app/admin/page.tsx` L566 | **删除** `case 'finance': return <FinancePanel />` | 路由分支 |
| 10 | `src/app/admin/page.tsx` L709 | **删除** `DASHBOARD_KPIS` 中 `{ label:'会员收入', … }` 项 | 会员收入 KPI |
| 11 | `src/app/admin/page.tsx` L529–534 | **删除** `SettingsPanel` 中 `paid_daily_quota` / `paid_monthly_quota` 两个 Form.Item（"会员每日/每月额度"） | 保留 `default_daily/monthly_quota`（免费额度配置，属运营配置） |
| 12 | `src/lib/api.ts` L102–105 | **删除** `admin.setVip`、`admin.addUserQuota` | 后台计费接口调用 |
| 13 | `src/lib/api.ts` L160–170 | **删除** `admin.getOrders`、`refundOrder`、`getRevenue`、`getPackages`、`createPackage`、`updatePackage` | 订单/收入/套餐接口 |
| 14 | `src/lib/api.ts` L185 `getQuotaConfig` | **保留** | SettingsPanel 免费额度配置仍使用 |
| 15 | `src/types/index.ts` | **删除** 仅被财务面板使用的 `OrderItem` / `RevenueData` / `PackageItem` 接口定义 | 见 §2.4 |
| 16 | `src/types/index.ts` | **删除/精简** 付费字段：`AdminUser.is_vip`(L71)、`AdminUser.daily_quota`(L72)、`AdminUserDetail.quota`(L87–93，含 `is_paid`)、`AdminUserDetail.orders`(L96)、`QuotaConfig.vip_unlimited`(L314)、`DashboardCore.paid_conversion_rate`(L116) | 后端仍会返回这些字段，TS 类型删除不影响运行；前端无任何读取点 |

### 2.2 涉及付费判断的分支代码位置（file:line）
- 前端**无**功能级付费拦截分支。仅有"展示型"营销/计费代码，位置见 §2.1 的 1、3、5、6、7、8、9、10、11。
- 删除后所有原有功能（简历优化、评分、批量、面试、历史、回收、消息、个人中心等）默认完整可用。

### 2.3 文案 / 图标 / 静态资源 / i18n
- 文案："升级为 VIP""立即升级""会员通知""会员收入""会员每日额度""会员每月额度""财务管理""福利中心"——随对应代码块删除。
- 图标：`CrownOutlined`（仅 AppLayout 营销卡 + messages 会员分类）、`GiftOutlined`（福利中心）随代码删除导入；**保留** `jobs`/`resumes`/`app/page` 中把 `CrownOutlined` 用作"设为默认/primary"标记的用例（非付费）。
- 图片资源：经检索 `public/`，**无** VIP/会员/付费相关图片文件；相关图标均为 antd 组件，删除导入即清理。
- i18n：项目无多语言词条目录，无相关词条需清理。
- `package.json` 依赖：antd / @ant-design/icons / axios / dayjs / diff / echarts / echarts-for-react / next / react / react-dom / react-dropzone 中**无**任何支付专用依赖（无 stripe/alipay 等），无需改动。

### 2.4 残留关键词全局搜索复查（执行后跑）
对以下关键词在 `src/` 全量 grep（大小写不敏感），应 0 命中或仅剩明确非付费项：
`VIP|vip|会员|付费|订阅(subscription 仅"消息订阅管理"→非付费，保留)|premium|pro(误报过滤)|paywall|购买|升级(仅"系统升级维护通知"→系统维护，非付费，保留)|解锁|金币|积分兑换|试用|免费版|限时优惠|内购|price(仅后端返回结构/套餐字段，前端已不渲染)|plan|billing`
- 已知需**保留**的非付费项（供复查时排除）：
  - `dashboard` L213「系统升级维护通知」= 系统维护公告，非付费。
  - `dashboard` L216「邀请好友领额度活动进行中」= 运营活动通知，含"额度"但非付费入口；**默认保留**，如你要求也可改写为「邀请好友活动进行中」。
  - `messages` L66/L242「消息订阅管理」= 通知偏好设置，非付费。
  - `jobs`/`resumes`/`app/page` 中 `CrownOutlined`="设为默认"。
  - `DASHBOARD_KPIS` L710「系统剩余额度」= 系统容量运营指标，非付费（默认保留）。

---

## 三、iOS 设计 Token 计划（统一在全局样式 + antd 主题）

### 3.1 颜色（重写 `globals.css` 变量 + `layout.tsx` ConfigProvider token）
| 语义 | 浅色 | 深色 |
|------|------|------|
| 主色 / 链接 | `#007AFF` | `#007AFF`（或深色下 `#0A84FF`） |
| 成功 | `#34C759` | `#30D158` |
| 警告 | `#FF9500` | `#FF9F0A` |
| 危险 | `#FF3B30` | `#FF453A` |
| 页面背景 | `#F2F2F7` | `#000000` |
| 卡片背景 | `#FFFFFF` | `#1C1C1E` |
| 浮层背景 | — | `#2C2C2E` |
| 主文字 | `#000000` | `#FFFFFF` |
| 次文字 | `rgba(60,60,67,0.60)` | `rgba(235,235,245,0.60)` |
| 三级文字 | `rgba(60,60,67,0.30)` | `rgba(235,235,245,0.30)` |
| 分割线 | `rgba(60,60,67,0.29)`（高清屏 0.5px） | 同源 |
| 系统填充(按钮浅底等) | `#E5E5EA` | `#2C2C2E`/`#3A3A3C` |

> 现有 `--primary-500/600/700` 等变量将改为 iOS 蓝；保留 `--ios-*` 兼容别名。antd `ConfigProvider` 同步：`colorPrimary:'#007AFF'`、`colorSuccess/Warning/Error` 对应、`borderRadius:10`（输入框）/`12`（按钮）、`fontFamily` 用 iOS 字体栈。

### 3.2 字体
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif`
字号：大标题 34/41(粗)；标题 17/22(半粗)；正文 17/22；次要 15/20；说明 13/18。

### 3.3 圆角 / 间距 / 阴影 / 动效
- 圆角：卡片 16 / 按钮 12 / 输入框 10 / 头像·图标全圆。
- 间距：4 / 8 / 12 / 16 / 20 / 24（8pt 网格）。
- 阴影：`0 1px 3px rgba(0,0,0,0.06)`，禁止大面积重阴影。
- 动效：`cubic-bezier(0.32,0.72,0,1)`，时长 0.25–0.35s；可点元素 `active{opacity:.6}` 或轻微缩放；页面切换左右滑入/淡入上移。
- 移动端：滚动区 `-webkit-overflow-scrolling:touch`；禁点击高亮 `-webkit-tap-highlight-color:transparent`；底部 `padding-bottom:env(safe-area-inset-bottom)`；支持 `prefers-color-scheme` 自动深色。

### 3.4 结构规范（手写新组件，置于 `src/components/ios/`）
- `IosNavBar`：顶部大标题（Large Title，随滚动收缩为居中标题）+ 毛玻璃 `backdrop-filter:saturate(180%) blur(20px)` + 半透明底；支持返回键/标题/右侧槽。
- `IosTabBar`：底部毛玻璃 TabBar，图标 24px、选中态主色、标签 10px、`safe-area` 内边距。
- `IosList` / `IosCell`：Inset Grouped 分组列表（左右留白、卡片内分割线从文字左侧起、末项无分割线）。
- `IosSwitch` / `IosSegmented` / `IosSheet`(ActionSheet/底部 Sheet) / `IosAlert`(居中 Alert，圆角 14 + 半透明遮罩) / `IosEmpty`(居中图标+灰字) / `IosPage`(安全区 + 滚动容器)。
- 按钮：主按钮填充主色白字圆角 12 无边框；次按钮 `#E5E5EA`；危险用红字。输入框浅灰底无重边框、聚焦主色 1px 描边（antd Input 重主题即可）。

### 3.5 AppLayout 改写（用户端）
将现有"侧边栏 + 顶栏"改为 **IosNavBar（顶）+ 内容 + IosTabBar（底）** 的移动优先外壳；桌面端内容居中为手机宽度列（约 480–540px），TabBar 贴底。
**拟用底部 TabBar（5 项）**：
`首页 /dashboard` · `优化 /` · `简历 /resumes` · `岗位 /jobs` · `我的 /profile`
次级入口（批量/评分/面试/历史/回收/消息）由"首页"或"我的"页内的 iOS 列表项进入（具体在第二阶段细化，待你确认）。

---

## 四、分阶段执行计划（每阶段一次 git 提交，可独立回滚）

- **Phase 0 基础与设计 Token**：重写 `globals.css` iOS 变量；`layout.tsx` antd 主题改 iOS；新增 `src/components/ios/*` 核心组件。验证 `next build` 通过。
- **Phase 1 删除 VIP/付费**：按 §2 逐文件清理 + 全局关键词复查（§2.4）。提交。
- **Phase 2 各页面改 iOS 风格**（建议再拆 2a/2b，每页一次提交）：
  - 2a：首页 dashboard / 简历优化 `/` / 我的简历 resumes / 岗位库 jobs / 简历评分 scoring / 批量优化 batch
  - 2b：面试追踪 interviews / 历史记录 history / 回收站 recycle / 消息 messages / 个人中心 profile / 登录注册忘记密码
  - 改写 AppLayout 为 iOS 外壳（NavBar+TabBar）。
- **Phase 3 打磨与自测**：深色模式自动、安全区、动效统一、空/加载/报错态、移动端尺寸；输出对照表 + 残留复查 + 自测清单。提交。

---

## 五、待你确认的关键决策（见随附提问）
1. **UI 方案**：保留 antd 并重写为 iOS 主题 + 手写 iOS 外壳/组件（推荐） vs 完全移除 antd 全手写。
2. **管理后台处理**：后台保持桌面管理台、仅去付费+换 iOS 皮肤（推荐） vs 后台也改 iOS 移动风。
3. **执行节奏**：先做 Phase 0+1（基础+去付费）暂停给你审阅，再继续 Phase 2+3（推荐） vs 四阶段连续一次做完。

---

## 六、最终交付物（全部完成后）
1. 分阶段提交记录（每阶段：改动文件清单 + 改动说明）。
2. 对照表：`原位置 → 新位置 / 已删除`。
3. 残留搜索关键词复查结果（§2.4）。
4. 本地运行与自测清单（深色模式、移动端尺寸、空数据、加载中、报错态）。
