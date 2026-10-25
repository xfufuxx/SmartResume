# LLM 403 免费额度耗尽修复说明

> 2026-10-25 交付。现象：「优化失败: Error code: 403 - Free quota exhausted …」
> 实测结论：当前 Key 对 `qwen3.7-flash` 确已 403，但接线后的主链路**自动降级到
> `qwen3.7-max` 后真实调用成功**，用户无感恢复。

## 1. 根因

1. **`llm_policy.py`（免费额度清单 / 自动降级 / 付费拦截）早已写好，但从未接进
   `agent_optimizer` 主链路** —— 配置里 `LLM_MODEL_TEXT=qwen3.7-flash` 的免费额度
   2026-10-23 已到期，请求原样打到上游，必然 403。
2. **重试循环对 403 一视同仁**：确定性错误重试 3 次纯属浪费（每次还可能等满 timeout）。
3. **英文原文直接甩给用户**：看不懂、也不知道下一步做什么。

## 2. 修复内容

### 2.1 主链路接线（`agent_optimizer._call_with_retry`）

- 模型名先过 `resolve_model()`：`LLM_AUTO_FALLBACK=true` 时，免费额度已到期/不覆盖的
  模型自动换成仍在免费期内的替补（文本档优先 max 级），日志记录降级原因；
- 调用前 `check_before_call()` 预检：仅免费模式（`LLM_ALLOW_PAID=false`）下命中付费
  模型直接本地拒绝，绝不发请求；
- **403/401/400 等确定性错误不重试**（`is_retryable_error`），立即抛中文友好异常；
  429/408/5xx 仍按指数退避重试（既有容错行为不变）。

### 2.2 错误中文化（`app/core/llm_errors.py`，新建）

| 上游错误 | 用户看到的中文提示 | 类型 |
|---|---|---|
| 403 + Free quota/AllocationQuota | 「免费额度已耗尽」+ 控制台地址 + 三种处理方式 | `LLMQuotaExhausted` |
| 403 其它（权限/地域） | 「拒绝访问」+ 检查模型访问权限 | `ValueError` |
| 401 | 「LLM_API_KEY 无效或已过期」 | `ValueError` |
| 429 | 「请求过于频繁，系统已自动重试」 | `RuntimeError` |
| 400 | 「检查 LLM_MODEL_TEXT/VISION 模型名」 | `ValueError` |
| 5xx | 「暂时不可用，请稍后重试」 | `RuntimeError` |
| 连接/超时（类型名或消息文案双通道识别） | 「无法连接 AI 服务，检查网络与 LLM_API_BASE」 | `RuntimeError` |

三种处理方式：① 登录 `bailian.console.aliyun.com` 充值 / 关闭「仅使用免费额度」；
② 更换 `backend/.env` 的 `LLM_API_KEY`；③ 设置 `LLM_ALLOW_PAID=true` 允许按量计费。

### 2.3 其它调用点

- `text_optimizer`：批处理与图片文本优化路径接 `resolve_model`；**`LLMQuotaExhausted`
  必须上抛**——静默保留原文会让用户误以为「已优化成功」；
- `polish_chat`（AI 润色 SSE）：错误事件带中文提示；
- `image_layout_editor`：仅接友好错误映射，**不做自动降级**（免费清单无真正的视觉
  模型，降级到文本模型会坏菜）。

### 2.4 顺手修复的 llm_policy 自身缺陷

- `normalize_model` 规则顺序：快照别名（如 `qwen3.7-flash-2026-07-15`）本身登记在
  清单里，原实现直接命中原样返回，导致单价查不到主名（flash 0.2/0.8 被保守估算成
  2.0/8.8）。改为**先去后缀再命中**；
- 过期模型的 `reason` 从空串改为「免费额度已于 X 到期」（降级日志不再出现空括号）；
- `check_before_call` 对**已过期的免费模型**同样本地拦截（`AUTO_FALLBACK` 关闭时的
  纵深防御，否则照样打到上游吃 403）。

## 3. 实测结果（2026-10-25，当前 Key）

| 步骤 | 结果 |
|---|---|
| 直接打 `qwen3.7-flash` | HTTP 403 `AllocationQuota.FreeTierOnly`（与用户报错一字不差） |
| 修复后主链路（同 Key） | 自动降级 `qwen3.7-max` → 真实返回「OK」✅ |
| 403 重试次数 | 1 次（mock 链路验证：持续 403 也只发 1 次） |
| 429 重试链路 | 未破坏：429×2 后第 3 次成功返回 |

## 4. 控制台核对与清单同步（2026-10-25）

按用户提供的百炼控制台「模型用量 - 免费额度」截图（20 个模型）逐行核对：

| 模型 | 控制台到期日 | 清单动作 |
|---|---|---|
| qwen3.8-max | 2026-11-01（已耗 93.82%） | 不变 |
| qwen3.8-max-0902 | 2026-12-01 | **修正**（原误登记 11-01，与 3.8-max 混淆） |
| qwen3.8-flash | 2026-11-25 | **新增**；`.env` 文本模型改投此处（真实 Key 实测可用） |
| deepseek-v4.1-flash | 2026-12-13 | **新增**；实测为**思考模型**（小 max_tokens 下 content 为空），降级排最后 |
| glm-5.3 | 2026-11-23 | **新增**（实测可用） |
| deepseek-v4-pro-0813 | 2026-11-13 | 不变 |
| qwen-mt-uni / qwen3.7-text-rerank / qwen-mt-image-2.0 / wan3.0-video-prime | 12-15 / 11-30 / 11-27 / 11-21 | 新增，登记为非文本模型 |
| qwen3.8-livetranslate-flash-realtime / qwen3.7-text-embedding-flash | 12-16 / 11-30 | 新增，非文本（截图截断，全名经用户确认） |
| qwen3-asr-flash | 2026-11-19 | 不变 |
| sambert-zhichu/hanna/clara/eva-v1 | 永不过期 | 新增（None） |
| qwen3.7-flash | 已下架 | 保留条目仅备案 |
| qwen3.7-max | 截图未出现 | 暂按 11-01 保留（10-25 实测可用，待确认是否在其它分页） |

同时加固降级挑选逻辑（三个隐患）：
1. **非文本模型混入选池**：max 档 11-01 到期后，旧实现按字母序会降级到 cosyvoice（TTS）
   直接坏菜 → 新增 `NON_TEXT_MODELS`，选池一律排除；
2. **不看剩余天数**：同档按剩余免费天数降序挑替补，活得久的先上 → max 档首补从
   「当天就要再迁移的 qwen3.7-max」变成 `qwen3.8-max-0902`（12-01，余量 100%）；
3. **思考模型风险**：`deepseek-v4.1-flash` 实测 reasoning 先吃 token、小预算下
   content 为空 → `REASONING_MODELS` 排最后，只在无其它替补时启用；
   另在 `agent_optimizer` 两个 JSON 解析点加**空内容防护**（`_require_content`），
   杜绝「模型没返回」被静默兜底成 `{}` 的假成功。

另修复 `check_llm_policy.py --probe` 的坏引用（`app.services.llm_invoke` 不存在，
探测路径 ImportError）→ 改走 `agent_optimizer._call_with_retry` 策略链，实测可用。

## 5. 后续时间线（免费额度 90 天机制，一定会到期）

- **2026-11-01**：qwen3.7-max / qwen3.8-max 到期 → 自动降级改投 `qwen3.8-max-0902`（12-01）；
- **2026-11-25**：.env 主模型 qwen3.8-flash 到期 → 主模型也改投 0902；
- **2026-12-01**：0902 到期 → 最后手段 `deepseek-v4.1-flash`（12-13，思考模型，JSON 管线慎用）；
- **2026-12-13 之后**：清单内无可用文本替补 → 请求被本地拦截（中文提示），需充值 /
  换 Key / 开 `LLM_ALLOW_PAID`；
- 视觉链路（图片简历解析）**无免费替补**（控制台清单内无视觉对话模型），现在就会得到
  中文提示，需充值或换 Key；
- 更新清单：改 `backend/app/core/llm_policy.py::FREE_QUOTA_MODELS`（以控制台
  「模型用量 - 免费额度」为准，**到期模型余量仍显示 100%，勿被误导**）。

## 6. 验证矩阵

| 验证 | 结果 |
|---|---|
| `pytest tests/test_llm_errors.py tests/test_llm_policy.py` | 37/37 |
| `pytest tests/` 全量 | 154/154 |
| `scripts/verify_llm_403_policy.py`（链路级：降级/不重试/中文异常/429 重试/批处理上抛/配置无关） | 10/10 |
| `check_llm_policy.py --probe`（CLI 体检+真实探测） | ✅ 返回「正常」 |
| 真实 Key 实测 | qwen3.8-flash / qwen3.8-max-0902 / glm-5.3 均成功；deepseek-v4.1-flash 成功但为思考模型 |
