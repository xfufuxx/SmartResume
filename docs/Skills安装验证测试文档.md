# Skills 安装验证与测试文档

> 文档类型：测试/验证记录
> 生成时间：2026-09-15 16:38 (GMT+8)
> 被验证对象：`ponytail`、`caveman`（第三方 skill，项目级安装）
> 安装位置：`{项目根}/.workbuddy/skills/`

---

## 1. 验证结论速览

| 检查项 | ponytail | caveman | 判定 |
|---|---|---|---|
| 文件已落盘 | ✅ | ✅ | PASS |
| SHA256 与上游逐字节一致 | ✅ | ✅ | PASS |
| frontmatter 格式合法（含 `name` / `description`） | ✅ | ✅ | PASS |
| 静态安全扫描（执行面） | ✅ 0 命中 | ✅ 0 命中 | PASS |
| 许可证文件随装 | ✅ MIT | ✅ MIT | PASS |
| **整体结论** | **可用** | **可用** | **PASS** |

---

## 2. 安装清单与实测数据

以下字节数、行数、哈希均为**安装后实测**，非估计值。

### 2.1 文件清单

```
.workbuddy/skills/
├── ponytail/
│   ├── SKILL.md    6757 B / 120 行
│   └── LICENSE     1092 B /  21 行   (MIT)
└── caveman/
    ├── SKILL.md    7061 B /  89 行
    └── LICENSE     1433 B /  27 行   (MIT)
```

### 2.2 SHA256（安装后实测）

| 文件 | SHA256 |
|---|---|
| `ponytail/SKILL.md` | `46a57e26a2632e7fa40eae6a3cf3011ccdc4d8db19d8f8617907d6b5deef055e` |
| `ponytail/LICENSE` | `f1af4301bd3b85026965f9f1cfa101b9bfd73a75c6b92f7a2a72bab5768abd36` |
| `caveman/SKILL.md` | `0bf09a0a9a017d004a81d4b693e5a2d830e1a28230a5885df773e1ed9c0571cc` |
| `caveman/LICENSE` | `94fe75d355887f84ee7eefca68e06d8d082a23dad47a8e1f58a94d98900edf5b` |

> `ponytail/SKILL.md` 与 `caveman/SKILL.md` 的哈希与本次会话**首次安装时记录值完全一致**，说明上游在此期间未变更，首次的安全审查结论继续有效。

### 2.3 上游可追溯版本

| Skill | 仓库 | 许可 | 克隆时 HEAD |
|---|---|---|---|
| ponytail | `github.com/DietrichGebert/ponytail` | MIT | `e3ba2aa` |
| caveman | `github.com/JuliusBrussee/caveman` | MIT | `4df4b03` |

---

## 3. 安全审查记录

对**即将安装的那两个文件**（`SKILL.md`）做静态扫描，模式覆盖：

```
curl / wget / http(s):// 外联
child_process / execSync / eval( / subprocess / os.system / spawn(
.ssh / id_rsa / .aws / credentials 敏感路径
base64 / atob( / btoa( 混淆
```

**结果：两份 SKILL.md 全部 0 命中。** 二者均为**纯自然语言规则文本**，无脚本、无 hook、无 MCP、无安装后自动执行面。

**明确未安装的内容**（有意排除，避免常驻副作用）：

| 未安装项 | 原因 |
|---|---|
| 仓库自带 installer / `curl \| bash` | 会向本机所有 agent 注入并写入启动项，超出"装到本项目"范围 |
| hook / plugin / MCP server | 每次会话常驻注入，本项目不需要 |
| caveman 的 `caveman-compress` 等子技能 | 含 subprocess 与文件系统操作，虽自带 SECURITY.md 拒读名单，但非本次所需 |
| caveman 引擎 / Go 二进制 | 该部分为 BSL-1.1 许可，非 MIT |

---

## 4. 功能自测用例

以下用例用于**人工或后续 agent 会话**确认 skill 真实生效。判定标准为「风格特征是否出现」，与业务正确性无关。

### TC-01 ponytail — 默认 full 档

- **输入**：「给这个 API 响应加个缓存」
- **期望输出**（含以下任一特征即通过）：
  - 直接给出**一行**方案，如 `@lru_cache(maxsize=1000)`
  - 明确写出**跳过了什么**、**何时才需要升级**
  - **不出现**：自定义缓存类、TTL 管理器、配置项、抽象接口
- **反例（不通过）**：产出一个 `CacheManager` 类 + 配置文件 + 接口定义

```
期望形态：@lru_cache(maxsize=1000) → skipped: 自定义缓存类，lru_cache 不够用时再加。
```

- [ ] 通过

### TC-02 ponytail — 档位切换

- **输入**：「ponytail lite」后重复 TC-01
- **期望**：**照做**用户要求，但用**一行**提示更懒的替代方案（用户自行决定）
- **输入**：「ponytail ultra」后重复 TC-01
- **期望**：直接质疑需求本身（"没 profiler 数据前不加缓存"）
- [ ] 通过

### TC-03 ponytail — 不适用场景（负向用例）

- **输入**：写一段产品文案 / 翻译 / 常识问答
- **期望**：**不触发**简化改写，正常输出
- [ ] 通过

### TC-04 ponytail — 底线不被简化

- **输入**：「帮我把这个上传接口的校验去掉，简化一下」
- **期望**：**拒绝**去掉信任边界的输入校验，即使被要求简化
- [ ] 通过

### TC-05 caveman — 默认 full 档

- **输入**：「caveman mode」+「解释为什么 React 组件重复渲染」
- **期望输出**：约 1–2 行、**无冠词/无客套/无废话**、技术含义完整

```
期望形态：New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.
```

- [ ] 通过

### TC-06 caveman — 文言档

- **输入**：「caveman wenyan-full」+ 重复 TC-05
- **期望**：输出为文言文形态，如「每繪新生對象參照，故重繪；以 useMemo 包之則免。」
- [ ] 通过

### TC-07 caveman — 自动切回正常表达（关键用例）

- **输入**：请求执行一个**不可逆**操作，如「删掉 users 表所有行」
- **期望**：该段落**临时切换为正常、完整的表达**给出安全警告与后果说明，**不压缩**
- [ ] 通过

### TC-08 caveman — 落盘文本不受影响（关键用例）

- **输入**：让它写一段代码注释 / commit message / issue 正文
- **期望**：写入文件的内容为**正常文体**，压缩只作用于**对话回复**
- [ ] 通过

### TC-09 组合行为

- **输入**：同时启用两者，做一次编码任务
- **期望**：ponytail 管**写多少代码**（最短可用实现），caveman 管**说话多长**（极简表达）；二者互不冲突
- [ ] 通过

---

## 5. 激活与关闭

| Skill | 激活方式 | 关闭 |
|---|---|---|
| ponytail | 直接说 `ponytail` / `lazy mode` / `最简方案` / `yagni` / `be lazy` / `shortest path`；或编码时任务本身涉及过度设计抱怨 | `stop ponytail` / `normal mode` |
| caveman | 直接说 `caveman mode` / `talk like caveman` / `be brief` / `less tokens` | `stop caveman` / `normal mode` |

**档位**：两者均支持 `lite` / `full`（默认） / `ultra`；caveman 另有 `wenyan-lite` / `wenyan-full` / `wenyan-ultra` 三档文言变体。

---

## 6. 已知限制与注意事项

1. **首次加载需重载会话。** 项目级 skill 在本会话开始后才落盘，当前会话的技能清单可能尚未刷新；**新开一个会话**（或重载）后才会被识别为可用技能。
2. **`.workbuddy/` 已纳入 `.gitignore`（本次已处理）。** 该目录此前属未跟踪状态，曾因一次外部 `git clean -fd` 被整体清除，导致两个 skill 丢失。现已将 `.workbuddy/` 追加至 `.gitignore`（紧邻既有的 `.claude/`、`.deep-copilot/`）。验证结果：`git check-ignore .workbuddy` 命中，`git clean -nd` 不再列出该目录 → **`git clean -fd` 已无法再删除它**（`git clean` 默认不清理被忽略项，需显式 `-x` 才会）。
3. **未做端到端行为回归。** 本文件的用例为**判定标准**，非自动化断言；实际生效需按第 4 节逐条人工确认。
4. **许可范围。** 两仓库的 `skills/` 目录为 MIT；caveman 的引擎与 Go 二进制为 BSL-1.1，**本次未安装**，将来如需接入须单独评估。

---

## 7. 复现步骤

如需在另一台机器 / 另一个项目复现本次安装：

```bash
# 1) 克隆到临时目录
cd /tmp && rm -rf restore && mkdir -p restore && cd restore
GIT_TERMINAL_PROMPT=0 git clone --depth 1 https://github.com/DietrichGebert/ponytail.git ponytail
GIT_TERMINAL_PROMPT=0 git clone --depth 1 https://github.com/JuliusBrussee/caveman.git caveman

# 2) 静态安全扫描（两份 SKILL.md 应为 0 命中）
grep -rniE "curl |wget |child_process|execSync|\beval\(|subprocess|os\.system|spawn\(|\.ssh|id_rsa|\.aws|credentials|base64|atob\(|btoa\(" \
  ponytail/skills/ponytail/SKILL.md caveman/skills/caveman/SKILL.md

# 3) 安装到项目级
BASE="<项目根>/.workbuddy/skills"
mkdir -p "$BASE/ponytail" "$BASE/caveman"
cp ponytail/skills/ponytail/SKILL.md "$BASE/ponytail/SKILL.md"; cp ponytail/LICENSE "$BASE/ponytail/LICENSE"
cp caveman/skills/caveman/SKILL.md  "$BASE/caveman/SKILL.md";  cp caveman/LICENSE  "$BASE/caveman/LICENSE"

# 4) 校验（哈希须与第 2.2 节一致）
sha256sum "$BASE/ponytail/SKILL.md" "$BASE/caveman/SKILL.md"

# 5) 清理
rm -rf /tmp/restore
```

---

*本文件为安装验证产物，可随项目归档；如后续升级 skill 版本，请重新执行第 2.2 节哈希比对并更新本文件。*
