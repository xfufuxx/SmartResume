"""面试环节编排单元测试（纯函数，无 IO）。

覆盖：
- build_plan：3/4/5/8/10/15 题的环节序列与配额、区间连续、总数守恒
- 边界：None/0 用默认值、超出范围收口到 3/15
- current_stage / next_stage / stage_key_at：题数落在区间边界时的归属
- remaining_in_stage / asked_by_stage / flow_plan_done：进度口径一致
- plan_table：当前环节标记唯一
"""
import pytest

from app.services import interview_flow as flow


def _keys(plan):
    return [item["key"] for item in plan]


def _sum(plan):
    return sum(item["count"] for item in plan)


# ── 计划结构 ─────────────────────────────────────────────────────


@pytest.mark.parametrize("target", [3, 4, 5, 6, 7, 8, 9, 10, 12, 15])
def test_plan_totals_match_target(target):
    plan = flow.build_plan(target)
    assert _sum(plan) == target


@pytest.mark.parametrize("target", [3, 5, 8, 15])
def test_plan_ranges_are_contiguous(target):
    plan = flow.build_plan(target)
    cursor = 0
    for item in plan:
        assert item["start"] == cursor
        assert item["end"] == cursor + item["count"]
        assert item["count"] > 0
        cursor = item["end"]
    assert cursor == target


def test_plan_always_starts_with_opening_and_ends_with_reverse():
    for target in (3, 8, 15):
        keys = _keys(flow.build_plan(target))
        assert keys[0] == flow.OPENING
        assert keys[-1] == flow.REVERSE


def test_plan_keeps_real_interview_order():
    # 顺序即真实面试顺序，不允许乱序（乱了用户看到的流程叙事就不像面试）
    order = flow.STAGE_ORDER
    keys = _keys(flow.build_plan(15))
    assert keys == sorted(keys, key=order.index)


def test_short_interview_still_has_resume_digging():
    # 3 题短面试不能省掉简历深挖，否则练不到最关键的部分
    keys = _keys(flow.build_plan(3))
    assert keys == [flow.OPENING, flow.RESUME, flow.REVERSE]


def test_mid_target_skips_salary_and_motivation():
    # 5 题面试就问期望薪资不真实，这两环节只在题数足够时启用
    keys = _keys(flow.build_plan(5))
    assert flow.SALARY not in keys
    assert flow.MOTIVATION not in keys
    assert flow.OPENING in keys and flow.REVERSE in keys


def test_eight_questions_distribution():
    plan = {item["key"]: item["count"] for item in flow.build_plan(8)}
    assert plan == {
        flow.OPENING: 1,
        flow.RESUME: 2,
        flow.SKILL: 2,
        flow.BEHAVIOR: 1,
        flow.MOTIVATION: 1,
        flow.REVERSE: 1,
    }


def test_long_interview_includes_salary():
    plan = flow.build_plan(12)
    assert flow.SALARY in _keys(plan)


def test_all_stages_present_at_max_target():
    keys = _keys(flow.build_plan(15))
    for key in flow.STAGE_ORDER:
        assert key in keys, f"15 题时不应缺环节 {key}"


def test_target_is_clamped():
    assert _sum(flow.build_plan(None)) == flow.DEFAULT_TARGET
    assert _sum(flow.build_plan(0)) == flow.DEFAULT_TARGET
    assert _sum(flow.build_plan(1)) == flow.MIN_TARGET
    assert _sum(flow.build_plan(99)) == flow.MAX_TARGET
    assert _sum(flow.build_plan("8")) == 8  # type: ignore[arg-type]
    assert _sum(flow.build_plan("坏值")) == flow.DEFAULT_TARGET  # type: ignore[arg-type]


# ── 当前环节 ─────────────────────────────────────────────────────


def test_current_stage_boundaries():
    plan = flow.build_plan(8)  # opening [0,1) resume [1,3) skill [3,5) ...
    assert flow.stage_key_at(plan, 0) == flow.OPENING
    assert flow.stage_key_at(plan, 1) == flow.RESUME
    assert flow.stage_key_at(plan, 2) == flow.RESUME
    assert flow.stage_key_at(plan, 3) == flow.SKILL
    assert flow.stage_key_at(plan, 5) == flow.BEHAVIOR


def test_current_stage_sticks_to_last_when_exhausted():
    plan = flow.build_plan(3)
    assert flow.stage_key_at(plan, 3) == flow.REVERSE
    assert flow.stage_key_at(plan, 99) == flow.REVERSE
    assert flow.flow_plan_done(plan, 3) is True
    assert flow.flow_plan_done(plan, 2) is False


def test_negative_asked_count_treated_as_zero():
    plan = flow.build_plan(8)
    assert flow.stage_key_at(plan, -5) == flow.OPENING
    assert flow.stage_key_at(plan, None) == flow.OPENING


def test_next_stage_none_at_tail():
    plan = flow.build_plan(3)
    assert flow.next_stage(plan, 0)["key"] == flow.RESUME
    assert flow.next_stage(plan, 2) is None


def test_remaining_in_stage_counts_current_question():
    plan = flow.build_plan(8)  # opening 1 题
    assert flow.remaining_in_stage(plan, 0) == 1
    assert flow.remaining_in_stage(plan, 1) == 2  # resume 2 题
    assert flow.remaining_in_stage(plan, 2) == 1


def test_shape_is_stable_for_frontend_contract():
    item = flow.build_plan(8)[0]
    assert set(item) == {"key", "label", "focus", "count", "start", "end"}
    assert isinstance(item["label"], str) and item["label"]
    assert isinstance(item["focus"], str) and item["focus"]


# ── 覆盖度 ───────────────────────────────────────────────────────


def test_asked_by_stage_counts_only_asked():
    plan = flow.build_plan(8)
    assert flow.asked_by_stage(plan, 0) == {}
    assert flow.asked_by_stage(plan, 1) == {"自我介绍": 1}
    assert flow.asked_by_stage(plan, 2) == {"自我介绍": 1, "简历深挖": 1}


def test_asked_by_stage_never_exceeds_plan():
    plan = flow.build_plan(8)
    coverage = flow.asked_by_stage(plan, 99)
    assert sum(coverage.values()) == 8
    for item in plan:
        assert coverage[item["label"]] == item["count"]


# ── 提示词环节表 ─────────────────────────────────────────────────


def test_plan_table_marks_exactly_one_active_stage():
    plan = flow.build_plan(8)
    table = flow.plan_table(plan, 1)
    assert table.count("← 当前环节") == 1
    assert "简历深挖" in table
    assert "已完成" in table


def test_plan_table_marks_completion_when_asked_all():
    plan = flow.build_plan(3)
    table = flow.plan_table(plan, 3)
    # 全部出完时没有「未开始」，当前标记停在最后一个环节
    assert "未开始" not in table
    assert table.count("← 当前环节") == 1
