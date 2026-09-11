# Phase 0 + 1 成果与对照表（iOS 基础 + 移除 VIP/付费）

> 状态：**Phase 0、Phase 1 已完成并通过 `tsc --noEmit` 类型检查（0 错误）**。
> 按约定，此处在「基础 + 去付费」后暂停，交你审阅，确认后再继续 Phase 2（页面改 iOS 外壳）+ Phase 3（打磨/自测）。

---

## 一、Phase 0 — iOS 设计基础（已完成）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/app/globals.css` | 编辑 | 全部设计 token 改为 iOS 系统色：`--primary-500:#007AFF`、`--success-500:#34C759`、`--warning-500:#FF9500`、`--error-500:#FF3B30`；浅/深色背景 `#F2F2F7`/`#000000`；文字三级灰；圆角 `--radius-lg:12 / --radius-xl:16`；新增 `--tabbar-height`、iOS 辅助类（`.ios-scroll`/`.ios-press`/`.ios-safe-bottom`）。 |
| `src/app/layout.tsx` | 编辑 | antd `ConfigProvider` 主题改为 iOS：主色 `#007AFF`、圆角、`fontFamily` 为 SF Pro 栈、`fontSize:15`、深色模式按 `data-theme` 切换卡片/文字色。 |
| `src/components/ios/IosPage.tsx` | 新建 | iOS 滚动内容容器（最大宽 480，处理 TabBar 安全区）。 |
| `src/components/ios/IosNavBar.tsx` | 新建 | 大标题 + 滚动收缩为居中标题的毛玻璃导航栏。 |
| `src/components/ios/IosTabBar.tsx` | 新建 | 毛玻璃底部 TabBar（图标 24、选中主色、安全区）。 |
| `src/components/ios/IosList.tsx` | 新建 | `IosGroup`（Inset Grouped 分组）+ `IosCell`（分割线/accessory/危险色）。 |
| `src/components/ios/IosSwitch.tsx` | 新建 | 手写 iOS Switch（51×31，选中主色，0.25s）。 |
| `src/components/ios/IosSegmented.tsx` | 新建 | iOS Segmented Control。 |
| `src/components/ios/IosSheet.tsx` | 新建 | iOS 底部上滑 ActionSheet（锁定 body 滚动）。 |
| `src/components/ios/IosAlert.tsx` | 新建 | iOS 居中 Alert（圆角 14、半透明遮罩）。 |
| `src/components/ios/IosEmpty.tsx` | 新建 | iOS 空状态（居中图标 + 灰字）。 |

> 约束遵守：未引入任何新 UI 框架/库，纯手写 CSS 变量 + antd 重主题。

---

## 二、Phase 1 — 移除 VIP/付费（已完成）

### 2.1 改动对照表（原位置 → 新位置/已删除）

| 原位置 | 内容 | 处理 |
| --- | --- | --- |
| `src/components/AppLayout.tsx` L16/L18 | `GiftOutlined` / `CrownOutlined` 导入 | **删除**（付费营销位专用，移除后成为未使用） |
| `src/components/AppLayout.tsx` L168–187 | `promoCard`（侧边栏「升级为 VIP / 立即升级」） | **整块删除** |
| `src/components/AppLayout.tsx` L220 | `{promoCard}` 引用 | **删除** |
| `src/components/AppLayout.tsx` L335–337 | 顶栏「福利中心」`GiftOutlined` 按钮 | **删除** |
| `src/components/AppLayout.tsx` L281 | 路由进度条渐变 `#2563EB` | **改** 为 `var(--primary-500)` |
| `src/app/messages/page.tsx` L11 | `CrownOutlined` 导入 | **删除** |
| `src/app/messages/page.tsx` L41 | `MSG_TYPE_MAP.vip`（会员通知分类） | **删除** |
| `src/app/admin/page.tsx` L74 | 菜单「财务管理」 | **删除** |
| `src/app/admin/page.tsx` L383–429 | `FinancePanel`（订单表 + 套餐表） | **整函数删除** |
| `src/app/admin/page.tsx` L529–534 | 设置项 `paid_daily_quota` / `paid_monthly_quota`（会员额度） | **删除**（保留 `default_daily/monthly_quota` 免费额度） |
| `src/app/admin/page.tsx` L566 | `case 'finance': return <FinancePanel/>` | **删除分支** |
| `src/app/admin/page.tsx` L709 | 仪表盘 KPI「会员收入」 | **删除**（并简化 KPI 渲染去掉 `prefix`/`isMoney`） |
| `src/app/admin/page.tsx` L15/L23/L24 | `DollarOutlined` / `CrownOutlined` / `GoldOutlined` 导入 | **删除** |
| `src/app/admin/page.tsx` L44 | 类型导入 `OrderItem/RevenueData/PackageItem` | **删除** |
| `src/app/admin/page.tsx` L62–65 | `ORDER_STATUS` 常量 | **删除**（仅被 FinancePanel 使用） |
| `src/lib/api.ts` L102–105 | `admin.setVip` / `addUserQuota` | **删除** |
| `src/lib/api.ts` L160–170 | `getOrders`/`refundOrder`/`getRevenue`/`getPackages`/`createPackage`/`updatePackage` | **删除** |
| `src/types/index.ts` L71–72 | `AdminUser.is_vip` / `daily_quota` | **删除** |
| `src/types/index.ts` L87–93 | `AdminUserDetail.quota.is_paid` | **删除**（保留 `daily_limit/used`、`monthly_limit/used` 免费用量统计） |
| `src/types/index.ts` L96 | `AdminUserDetail.orders` | **删除** |
| `src/types/index.ts` L116 | `DashboardCore.paid_conversion_rate` | **删除** |
| `src/types/index.ts` L314 | `QuotaConfig.vip_unlimited` | **删除** |
| `src/types/index.ts` L233–264 | `OrderItem` / `RevenueData` / `PackageItem` 接口 | **整段删除** |

> 关键规则执行：**未删除任何被 VIP 锁住的功能本身**——本项目核心功能本就默认可用，付费仅存在于营销位与后台计费 UI，已按规则删除 UI/文案/接口/类型，未做功能性降级。

---

## 三、残留关键词复查结果

全局搜索（排除 `node_modules` 与本文档自身）覆盖：`VIP|vip|会员|付费|订阅|premium|pro|paywall|购买|升级|解锁|金币|积分兑换|试用|免费版|限时优惠|内购|price|plan|billing|is_vip|OrderItem|RevenueData|PackageItem|setVip|addUserQuota|getOrders|getPackages|getRevenue|createPackage|updatePackage|refundOrder` 以及 `价格|套餐|订单|支付|充值|余额|钱包|优惠券|折扣|促销|pricing|checkout|invoice|stripe|alipay`。

**结论：源码中已无任何 VIP/付费功能性代码。** 仅余 2 处非付费命中（见第四节「保留项」）。

类型检查：`npx tsc --noEmit` → 退出码 0，0 错误。

---

## 四、保留项说明（非付费，按约定保留）

| 位置 | 内容 | 理由 |
| --- | --- | --- |
| `src/app/dashboard/page.tsx` L213 | 「系统升级维护通知」 | 指**系统维护升级**，非「升级为 VIP」，属正常运营通知。 |
| `src/app/messages/page.tsx` L65/L241 | 「消息订阅管理」 | 指**消息通知偏好订阅**（哪些消息类别要接收），为免费功能，非付费会员订阅。 |
| `src/app/login/page.tsx` L120 | `AlipayCircleOutlined`「支付宝登录（开发中）」 | 是**第三方登录方式**（OAuth），非支付/付费墙，且为 disabled 占位。 |
| `src/app/admin/page.tsx` L649 | 仪表盘「系统剩余额度」 | 系统容量/算力运营指标，非付费收入。 |
| `src/types/index.ts` `quota.daily_used/monthly_used` 等 | 免费用量统计 | 免费用户额度使用统计，保留。 |

---

## 五、本地运行与自测清单（建议审阅/Phase 3 时执行）

- [ ] `cd frontend && npm run dev`，访问首页/简历优化/我的简历/岗位库/评分/消息/个人中心，确认无「升级/会员/VIP」入口。
- [ ] 管理后台 `/admin`：确认左侧菜单无「财务管理」，设置页无「会员每日/每月额度」，仪表盘无「会员收入」。
- [ ] 消息页分类筛选：确认「会员通知」分类已消失。
- [ ] 顶栏无「福利中心」入口；侧边栏无「升级为 VIP」卡片。
- [ ] 浅色/深色模式切换正常，iOS 主题色生效。
- [ ] `npx tsc --noEmit` 0 错误（已通过）。
- [ ] `npm run build` 通过（Phase 3 执行）。

---

## 六、下一步（待你确认后继续）

- **Phase 2**：各页面套用 iOS 外壳（`IosNavBar` + `IosTabBar` + `IosList`/`IosCell`/`IosSwitch` 等），`AppLayout` 改写为 iOS 布局；`admin` 保持桌面台仅换 iOS 皮肤。
- **Phase 3**：动效/深色模式/安全区打磨，`build` 验证，输出最终对照表与自测报告，按需分阶段提交。

> Git 说明：仓库存在大量此前未提交的文件（如 `batch/`、`interviews/`、`scoring/`、`recycle/`、`theme.tsx` 等均为 untracked）。本阶段已对所有改动做类型校验，但**未自动提交**，以免把无关未跟踪文件混入本次提交。确认继续前，你可指示我按文件粒度分阶段提交（仅本阶段 11 个文件），或整体提交。
