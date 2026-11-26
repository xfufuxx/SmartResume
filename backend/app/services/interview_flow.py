"""模拟面试的环节编排 —— 真实面试流程的确定性骨架。

为什么要有这一层：
对话式模拟如果只让模型「自由出题」，题目会集中在技术深挖上，丢掉真实面试里
必然出现的自我介绍、求职动机、薪资到岗与反问环节，用户练完仍不像过了一场面试。

设计原则：
1. **环节顺序与配额由后端纯函数算，模型只负责「在当前环节里出题」**。
   配额可预测、可单测，改提示词不会让流程漂移。
2. **追问不占题数**，所以「当前处于哪个环节」完全由已出题数决定，
   随时可重算，不需要落库，也就不需要数据迁移。
3. 快速押题（`mode=quick`，一次性出整套题）不走本模块，保持原样。

环节配额算法：固定 1 题自我介绍 + 1 题反问，其余按档位序列轮转填充。
轮转而非按比例取整，保证「项目深挖」永远排在优先位置，且题数增加时各环节均衡增长。
"""
from __future__ import annotations

from dataclasses import dataclass

MIN_TARGET = 3
MAX_TARGET = 15
DEFAULT_TARGET = 8

OPENING = "opening"
RESUME = "resume"
SKILL = "skill"
BEHAVIOR = "behavior"
MOTIVATION = "motivation"
SALARY = "salary"
REVERSE = "reverse"


@dataclass(frozen=True)
class Stage:
    key: str
    label: str
    focus: str
    # 该环节对应题目的默认分类（模型不改分类时用它，避免反问环节被标成「职业规划」）
    category: str


# 顺序即真实面试顺序，不可随意调整：调换会改变用户看到的流程叙事。
STAGE_LIST: tuple[Stage, ...] = (
    Stage(
        OPENING,
        "自我介绍",
        "让候选人用 60~90 秒讲清「我是谁、做过什么、为什么适合这个岗位」；"
        "可打断追问一句最相关的经历，用来决定后面往哪深挖",
        "自我介绍",
    ),
    Stage(
        RESUME,
        "简历深挖",
        "挑简历里与本岗位最相关的一段经历，追具体动作、量化结果、难点取舍与个人贡献；"
        "简历写「负责」的要追问到底做了什么，简历没写的细节要问而不是假设",
        "项目深挖",
    ),
    Stage(
        SKILL,
        "专业能力",
        "对照岗位要求的硬技能逐条验证，可出场景题或原理题；"
        "优先问岗位 JD 里明确列出、且简历有对应证据的技能",
        "技术能力",
    ),
    Stage(
        BEHAVIOR,
        "行为面试",
        "用 STAR 追问冲突处理、失败复盘、跨团队协作、高压交付；"
        "追问真实行为细节（当时谁说了什么、你具体做了什么），不接受抽象总结",
        "行为面试",
    ),
    Stage(
        MOTIVATION,
        "求职动机",
        "离职/转岗原因、为什么选这家公司、3 年职业规划；"
        "判断稳定性与岗位匹配度，对含糊回答追问真实考量",
        "职业规划",
    ),
    Stage(
        SALARY,
        "薪资与到岗",
        "期望薪资区间与依据、手上是否有其它 offer、最快到岗时间；"
        "口吻务实，不咄咄逼人，也不替候选人砍价",
        "薪资期望",
    ),
    Stage(
        REVERSE,
        "反问环节",
        "主动问「你有什么想问我的吗」，然后以面试官身份直接回答候选人提出的问题；"
        "回答要落在真实信息上（团队构成、汇报关系、考核方式、这个岗位当前最大的挑战）",
        "反问环节",
    ),
)

STAGE_MAP: dict[str, Stage] = {s.key: s for s in STAGE_LIST}
STAGE_ORDER: tuple[str, ...] = tuple(s.key for s in STAGE_LIST)

# 中间环节（不含固定的自我介绍与反问）按目标题数启用：
# 题数少时不硬塞薪资/动机，避免「3 题面试却问期望薪资」这种失真。
# 序列顺序即优先权，轮转填充保证高优先环节先拿到第 2 题。
_TIERS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (3, (RESUME,)),
    (5, (RESUME, SKILL)),
    (7, (RESUME, SKILL, BEHAVIOR)),
    (9, (RESUME, SKILL, BEHAVIOR, MOTIVATION)),
    (MAX_TARGET, (RESUME, SKILL, BEHAVIOR, MOTIVATION, SALARY)),
)


def normalize_target(target_count: int | None) -> int:
    """把目标题数收进 [3, 15]；None/0 用默认值。"""
    try:
        value = int(target_count or DEFAULT_TARGET)
    except (TypeError, ValueError):
        value = DEFAULT_TARGET
    return max(MIN_TARGET, min(MAX_TARGET, value))


def _middle_sequence(target: int) -> tuple[str, ...]:
    for limit, seq in _TIERS:
        if target <= limit:
            return seq
    return _TIERS[-1][1]


def _middle_counts(middle_total: int, target: int) -> dict[str, int]:
    """按档位序列轮转分配中间题数（余数依次给排在前面的环节）。"""
    seq = _middle_sequence(target)
    counts = {key: 0 for key in seq}
    for i in range(max(0, middle_total)):
        counts[seq[i % len(seq)]] += 1
    return counts


def build_plan(target_count: int | None) -> list[dict]:
    """生成环节计划：[{key,label,focus,count,start,end}]，start/end 为题目序号区间（左闭右开）。"""
    target = normalize_target(target_count)
    middle = _middle_counts(target - 2, target)

    plan: list[dict] = []
    cursor = 0
    for stage in STAGE_LIST:
        if stage.key in (OPENING, REVERSE):
            count = 1
        else:
            count = middle.get(stage.key, 0)
        if count <= 0:
            continue
        plan.append({
            "key": stage.key,
            "label": stage.label,
            "focus": stage.focus,
            "count": count,
            "start": cursor,
            "end": cursor + count,
        })
        cursor += count
    return plan


def total_questions(plan: list[dict]) -> int:
    return sum(int(item.get("count") or 0) for item in plan)


def current_index(plan: list[dict], asked_count: int | None) -> int:
    """当前环节下标：已出题数落在哪个区间；题数用尽后停在最后一个环节。"""
    if not plan:
        return 0
    asked = max(0, int(asked_count or 0))
    for idx, item in enumerate(plan):
        if asked < int(item["end"]):
            return idx
    return len(plan) - 1


def current_stage(plan: list[dict], asked_count: int | None) -> dict:
    """当前环节条目；plan 为空时给一个安全兜底（正常情况下不会发生）。"""
    if not plan:
        return {
            "key": SKILL,
            "label": STAGE_MAP[SKILL].label,
            "focus": STAGE_MAP[SKILL].focus,
            "count": 0,
            "start": 0,
            "end": 0,
        }
    return plan[current_index(plan, asked_count)]


def next_stage(plan: list[dict], asked_count: int | None) -> dict | None:
    """下一个环节；已在最后一个环节时返回 None（用于提示「这是最后环节」）。"""
    if not plan:
        return None
    idx = current_index(plan, asked_count)
    return plan[idx + 1] if idx + 1 < len(plan) else None


def stage_key_at(plan: list[dict], asked_count: int | None) -> str:
    return str(current_stage(plan, asked_count).get("key") or SKILL)


def answering_stage(plan: list[dict], asked_count: int | None) -> dict:
    """「正在作答的那道题」属于哪个环节。

    口径与 current_stage 差一位：已出 N 题时，第 N 题所属环节是 current_stage(N-1)。
    前端进度条与详情接口都用这个口径，保证「刚问完开场题」时高亮的是自我介绍，
    而不是下一环节——SSE 与刷新后的展示必须一致。
    """
    asked = max(0, int(asked_count or 0))
    return current_stage(plan, asked - 1 if asked > 0 else 0)


def answering_stage_key(plan: list[dict], asked_count: int | None) -> str:
    return str(answering_stage(plan, asked_count).get("key") or SKILL)


def stage_label(key: str | None) -> str:
    stage = STAGE_MAP.get(str(key or ""))
    return stage.label if stage else STAGE_MAP[SKILL].label


def remaining_in_stage(plan: list[dict], asked_count: int | None) -> int:
    """当前环节还剩几题（含即将出的这一题）；已进入下一环节时返回该环节的配额。"""
    item = current_stage(plan, asked_count)
    asked = max(0, int(asked_count or 0))
    return max(0, int(item["end"]) - asked)


def plan_table(plan: list[dict], asked_count: int | None) -> str:
    """给提示词用的环节表文本（当前环节与已完成环节带标记）。"""
    if not plan:
        return "（无）"
    asked = max(0, int(asked_count or 0))
    lines: list[str] = []
    for idx, item in enumerate(plan):
        done = asked >= int(item["end"])
        active = current_index(plan, asked) == idx
        mark = "← 当前环节" if active else ("已完成" if done else "未开始")
        lines.append(
            f"{idx + 1}. {item['label']}（{item['count']} 题，第 {int(item['start']) + 1}-{int(item['end'])} 题）[{mark}]"
            f" 考察重点：{item['focus']}"
        )
    return "\n".join(lines)


def asked_by_stage(plan: list[dict], asked_count: int | None) -> dict[str, int]:
    """各环节已出题数（只统计已经出过的题）。"""
    asked = max(0, int(asked_count or 0))
    out: dict[str, int] = {}
    for item in plan:
        used = min(int(item["count"]), max(0, asked - int(item["start"])))
        if used > 0:
            out[item["label"]] = used
    return out


def flow_plan_done(plan: list[dict], asked_count: int | None) -> bool:
    """计划里的题是否已全部出完。"""
    return max(0, int(asked_count or 0)) >= total_questions(plan)
