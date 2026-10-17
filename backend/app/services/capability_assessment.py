"""岗位能力测评 - 评分聚合与报告生成（确定性规则引擎，无 LLM 依赖）。

设计要点：
- 匹配度 = 加权均分：专业核心考察点权重 2、通识基础素质权重 1（专业:通识 = 2:1），
  贴近真实招聘中「专业能力是硬门槛、通识素质是加分项」的取舍；全 1 分仍为 20%，全 5 分为 100%；
- 逐维度分析文案由「分段模板 + 维度自带 low_tip/high_tip」组装，保证每个维度都有针对性；
- 三阶段补步建议按分数分布确定性分配：阶段一攻 ≤2 分短板、阶段二攻 3 分中坚、阶段三做 ≥4 分精进与转化；
- 所有文案为能力自查参考，不构成任何官方评价。
"""
from datetime import datetime, timedelta, timezone

from app.models.capability_assessment import JobProfile

TZ_UTC8 = timezone(timedelta(hours=8))

# 匹配度权重：专业核心考察点为硬门槛（2 倍），通识基础素质为加分项（1 倍）
PROFESSIONAL_WEIGHT = 2
GENERAL_WEIGHT = 1

# 分数分段（1~5）
BANDS = [
    (5, "excellent", "优秀"),
    (4, "good", "良好"),
    (3, "fair", "中等"),
    (2, "weak", "薄弱"),
    (1, "critical", "零起点"),
]


def _band(score: int) -> tuple[str, str]:
    for threshold, level, label in BANDS:
        if score >= threshold:
            return level, label
    return "critical", "零起点"


def compute_scores(
    professional_scores: dict, general_scores: dict
) -> tuple[float, float, float]:
    """返回 (整体匹配度%, 专业均分, 通识均分)。

    整体匹配度为加权均分：专业维度 ×2、通识维度 ×1，再除以满分。
    """
    prof_vals = [int(v) for v in professional_scores.values()]
    gen_vals = [int(v) for v in general_scores.values()]
    if not prof_vals and not gen_vals:
        return 0.0, 0.0, 0.0
    weighted_sum = sum(prof_vals) * PROFESSIONAL_WEIGHT + sum(gen_vals) * GENERAL_WEIGHT
    weight_total = len(prof_vals) * PROFESSIONAL_WEIGHT + len(gen_vals) * GENERAL_WEIGHT
    overall = weighted_sum / weight_total / 5 * 100
    prof = sum(prof_vals) / len(prof_vals) if prof_vals else 0.0
    gen = sum(gen_vals) / len(gen_vals) if gen_vals else 0.0
    return round(overall, 2), round(prof, 2), round(gen, 2)


def _dimension_analysis(dim: dict, score: int) -> dict:
    """单个维度的分析条目。"""
    level, label = _band(score)
    name = dim["name"]
    low_tip = dim.get("low_tip", "")
    high_tip = dim.get("high_tip", "")
    desc = dim.get("desc", "")

    if score <= 2:
        analysis = (
            f"{name}（{score}分）：{low_tip}"
            f"该维度衡量的是「{desc}」，当前水平会直接限制你在岗位上的可信度与产出质量，属于优先补齐项。"
        )
    elif score == 3:
        analysis = (
            f"{name}（{score}分）：已达到入门水平，但距离岗位要求仍有差距。"
            f"该维度衡量的是「{desc}」，建议按阶段计划系统补强，避免「会用但不精」。"
        )
    else:
        analysis = (
            f"{name}（{score}分）：{high_tip}"
            f"该维度衡量的是「{desc}」，当前是你的相对优势，注意在实战中持续保持并转化为可展示的成果。"
        )

    return {"name": name, "score": score, "level": level, "level_label": label, "analysis": analysis}


def _analyze_group(dimensions: list[dict], scores: dict) -> list[dict]:
    items = []
    for dim in dimensions:
        score = int(scores.get(dim["name"], 0))
        if score <= 0:
            continue
        items.append(_dimension_analysis(dim, score))
    # 低分优先展示，便于用户先看短板
    items.sort(key=lambda x: (x["score"], x["name"]))
    return items


def _match_verdict(match: float) -> str:
    if match < 40:
        return (
            "整体处于能力「零起点」状态，尚未建立该岗位所需的基础能力锚点，"
            "远未达到企业内相关岗位的准入门槛，需从认知重构、能力筑基到成果转化进行系统性重建。"
        )
    if match < 60:
        return (
            "已具备零星的能力碎片，但尚未形成支撑岗位的结构性能力，"
            "当前最紧要的是把「知道」变成「能做到」，用项目与产出补齐关键缺口。"
        )
    if match < 75:
        return (
            "已具备岗位所需的基础能力，主要短板集中在少数维度，"
            "属于「针对性补强即可显著提升匹配度」的阶段。"
        )
    if match < 90:
        return (
            "整体能力与该岗位较为匹配，剩余少数维度存在明显短板，"
            "补齐后即可进入同岗位候选人的第一梯队。"
        )
    return "能力与该岗位高度匹配，已具备直接胜任的基础，重点转向成果证明与差异化优势的建立。"


def _overall_analysis(profile: JobProfile, match: float, prof_avg: float, gen_avg: float,
                      prof_items: list[dict], gen_items: list[dict]) -> str:
    total = len(prof_items) + len(gen_items)
    n1 = sum(1 for i in prof_items + gen_items if i["score"] == 1)
    n2 = sum(1 for i in prof_items + gen_items if i["score"] == 2)
    n3 = sum(1 for i in prof_items + gen_items if i["score"] == 3)
    n4 = sum(1 for i in prof_items + gen_items if i["score"] == 4)
    n5 = sum(1 for i in prof_items + gen_items if i["score"] == 5)

    parts = [
        f"你当前的能力与「{profile.title}」岗位的匹配度为 {match:.2f}%。",
        "",
        profile.description or (profile.summary or ""),
        "",
        (
            f"从评测结果来看，{total} 项核心考察点中：{n5} 项优秀、{n4} 项良好、{n3} 项中等、"
            f"{n2} 项薄弱、{n1} 项处于最低水平（1分）；"
            f"其中专业能力均分 {prof_avg:.1f}，通识能力均分 {gen_avg:.1f}。"
            f"匹配度按「专业核心考察点 ×2、通识基础素质 ×1」加权计算，体现真实招聘中专业硬门槛、通识加分项的取舍。"
        ),
        _match_verdict(match),
    ]
    return "\n".join(p for p in parts if p is not None)


def _phase_principle(profile: JobProfile) -> str:
    if "培训" in profile.category or "讲师" in profile.title:
        return "先立身，再立言；先会做，再会教"
    return "先补短板，再建体系；先独立交付，再带动他人"


def _collect_phase(dims_with_scores: list[tuple[dict, int]]) -> dict:
    """从目标维度聚合必学清单（按 category 去重合并）与关键动作（去重保序）。"""
    reading: dict[str, list[str]] = {}
    actions: list[str] = []
    seen_actions: set[str] = set()
    for dim, _score in dims_with_scores:
        for group in dim.get("resources", []) or []:
            cat = group.get("category", "推荐")
            bucket = reading.setdefault(cat, [])
            for item in group.get("items", []) or []:
                if item not in bucket:
                    bucket.append(item)
        for action in dim.get("actions", []) or []:
            if action not in seen_actions:
                seen_actions.add(action)
                actions.append(action)
    return {
        "reading": [{"category": cat, "items": items} for cat, items in reading.items()],
        "actions": actions,
    }


def _build_phases(profile: JobProfile, prof_dims: list[dict], prof_scores: dict,
                  gen_dims: list[dict], gen_scores: dict) -> list[dict]:
    """三阶段补步建议：阶段一攻短板（≤2），阶段二攻中坚（=3），阶段三做精进与转化（≥4）。

    分数集中在某一档时（如全部低分），各阶段退化为对专业维度与通识维度的不同侧重，
    保证三阶段内容始终有区分度、不空页。
    """
    dim_scores = [(d, int(prof_scores.get(d["name"], 0))) for d in prof_dims]
    dim_scores += [(d, int(gen_scores.get(d["name"], 0))) for d in gen_dims]
    dim_scores = [(d, s) for d, s in dim_scores if s > 0]

    weak = sorted([x for x in dim_scores if x[1] <= 2], key=lambda x: x[1])
    mid = [x for x in dim_scores if x[1] == 3]
    strong = [x for x in dim_scores if x[1] >= 4]
    # 通识维度按分数升序（低分优先），用于阶段三的「表达与转化」侧重
    general_asc = sorted(
        [(d, int(gen_scores.get(d["name"], 0))) for d in gen_dims if int(gen_scores.get(d["name"], 0)) > 0],
        key=lambda x: x[1],
    )

    def names(items: list[tuple[dict, int]]) -> str:
        return "、".join(d["name"] for d, _ in items[:4]) or "核心基础能力"

    phases: list[dict] = []

    # 阶段一：基本功（0→1）——没有短板时退而巩固中等项
    p1_targets = weak or mid or dim_scores[:4]
    p1 = _collect_phase(p1_targets)
    phases.append({
        "stage": "阶段一",
        "title": f"夯实「{profile.title}」基本功（0→1）" if weak else "巩固现有基础（0→1）",
        "period": "第 1~3 个月",
        "goal": (
            f"建立该岗位的基础能力闭环，能独立完成最小可验证的完整任务；重点补齐：{names(p1_targets)}。"
        ),
        **p1,
    })

    # 阶段二：系统提升（1→2）——没有中等项时继续推进剩余短板，侧重专业深度
    p2_rest = [x for x in weak if x not in p1_targets]
    p2_targets = mid or p2_rest or dim_scores[4:8] or dim_scores[:4]
    p2 = _collect_phase(p2_targets)
    phases.append({
        "stage": "阶段二",
        "title": "系统提升，形成方法体系（1→2）",
        "period": "第 4~6 个月",
        "goal": (
            f"把零散经验固化为可复用的方法与检查清单，能稳定输出质量一致的成果；重点推进：{names(p2_targets)}。"
        ),
        **p2,
    })

    # 阶段三：长线精进（2→3）——优势放大 + 通识转化（表达/协作/责任），无优势分时补最低通识项
    p3_targets = strong[:4] or general_asc[:4] or dim_scores[-4:]
    p3 = _collect_phase(p3_targets)
    phases.append({
        "stage": "阶段三",
        "title": "长线精进，建立差异化优势（2→3）",
        "period": "第 7~12 个月",
        "goal": (
            f"把能力转化为可展示的成果与影响力（作品、分享、带教）；重点放大：{names(p3_targets)}。"
        ),
        **p3,
    })
    return phases


def _summary_and_advice(profile: JobProfile, match: float, weak_names: list[str]) -> dict:
    now = datetime.now(TZ_UTC8)
    next_review = now + timedelta(days=183)  # 约 6 个月

    if match < 40:
        reminders = [
            f"{match:.0f}% 的匹配度，不是「能力不够」，而是尚未建立「{profile.title}」这一职业的能力操作系统。",
            "这不是线性提升问题，而是需要完成三重跃迁：身份认知（从爱好者到从业者）、能力结构（从零散知识点到体系）、责任意识（从完成任务到对结果负责）。",
            f"当前最优先补齐的维度：{'、'.join(weak_names[:3]) if weak_names else '专业基础能力'}。",
        ]
    elif match < 60:
        reminders = [
            f"{match:.0f}% 的匹配度说明你已「摸到门槛」，但能力碎片化，尚不能独立承担岗位核心职责。",
            "下一阶段的关键是把「看过、听过」变成「做过、做成过」：用完整项目把知识点串成能力线。",
            f"当前最优先补齐的维度：{'、'.join(weak_names[:3]) if weak_names else '专业基础能力'}。",
        ]
    elif match < 75:
        reminders = [
            f"{match:.0f}% 的匹配度已具备岗位基础，剩下的少数短板就是你的「性价比最高的提升点」。",
            "建议把补强过程本身变成成果：每补一项，就产出一份可展示的证据（报告、作品、案例）。",
            f"当前最优先补齐的维度：{'、'.join(weak_names[:3]) if weak_names else '表达与成果转化'}。",
        ]
    else:
        reminders = [
            f"{match:.0f}% 的匹配度表明你与该岗位高度匹配，接下来比「能力」更重要的是「证明」。",
            "面试官更相信可验证的成果：把能力整理成作品集、数据化结果与可讲述的案例。",
            f"如仍想提升，可继续打磨：{'、'.join(weak_names[:3]) if weak_names else '长线精进项'}。",
        ]

    solemn = [
        "立即启动「双轨日志」：每日记录【今日所学】+【今日所产出】，哪怕只有 1 行，坚持 100 天即见质变。",
        f"拒绝「速成」陷阱：没有真实项目沉淀的「{profile.title}」只是纸上谈兵，警惕只讲不练的成长路径。",
        "先以实习、兼职或跟随真实项目的方式进入业务场景浸泡观察，再谋求正式岗位，路径最稳。",
    ]

    return {
        "reminders": reminders,
        "solemn_advice": solemn,
        "generated_at": now.isoformat(),
        "next_review_at": next_review.isoformat(),
    }


def build_report(
    profile: JobProfile,
    professional_scores: dict,
    general_scores: dict,
) -> dict:
    """生成完整测评报告（dict，直接存入 CapabilityAssessment.report）。"""
    match, prof_avg, gen_avg = compute_scores(professional_scores, general_scores)

    prof_items = _analyze_group(profile.professional_dimensions or [], professional_scores)
    gen_items = _analyze_group(profile.general_dimensions or [], general_scores)

    weak_names = [i["name"] for i in prof_items + gen_items if i["score"] <= 2]

    return {
        "job_title": profile.title,
        "category": profile.category,
        "overall_match": match,
        "professional_avg": prof_avg,
        "general_avg": gen_avg,
        "overall_analysis": _overall_analysis(
            profile, match, prof_avg, gen_avg, prof_items, gen_items
        ),
        "general_analysis": gen_items,
        "professional_analysis": prof_items,
        "improvement_plan": {
            "principle": _phase_principle(profile),
            "phases": _build_phases(
                profile,
                profile.professional_dimensions or [],
                professional_scores,
                profile.general_dimensions or [],
                general_scores,
            ),
        },
        "summary": _summary_and_advice(profile, match, weak_names),
    }
