"""AI 修改逐条确认（P0）：把「AI 直接产出」升级为「AI 建议 → 用户逐条确认 → 新版本」。

设计要点：
- compute_changes(original, optimized)：确定性纯函数，把优化前后两份简历 JSON
  对比成**条/点级**的变更清单（summary / skills / experience / projects），每条带
  稳定 id 与定位信息（loc），供 apply_decisions 精确回写。
- apply_decisions(original, changes, decisions)：把用户决策（accept/reject，
  accept 可带编辑后的文本）应用到**原始简历**上，生成「人工确认版」JSON。
  未出现在 decisions 里的变更一律视为拒绝（用户未确认的不落库）。
- 变更项的 suggested_text 仅用于展示；真正回写以 loc + payload 为准（accept 时
  可用 decision.text 覆盖 suggested_text，实现「编辑后接受」）。

教育经历（education）与个人信息（personal_info）通常不被 AI 改写，暂不纳入
确认范围，避免清单噪音。
"""
import copy
import difflib
import re

# ── 事实核验（P0-4）：规则引擎，为每条 AI 建议标注事实依据 ──
# 数字（含单位：%、％、倍、万、k、x），如 "35%"、"3倍"、"10万"
_NUM_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:%|％|倍|万|万\+|k|K|x|X)?")
# 强主张词表：出现在建议中但原始简历没有 → 提示「可能存在夸大表达」
_EXAG_WORDS = [
    "精通", "主导", "资深", "专家", "顶级", "顶尖", "行业领先", "业界领先",
    "首屈一指", "卓越", "完美", "全能", "显著", "大幅", "极大",
    "独立负责", "全权负责", "从0到1", "从零到一",
]


def _nums_in(text: str) -> set[str]:
    """提取文本中的数字 token（去空白归一化），如 {'35%', '3倍'}。"""
    out = set()
    for m in _NUM_RE.finditer(text or ""):
        token = re.sub(r"\s+", "", m.group())
        if token and any(ch.isdigit() for ch in token):
            out.add(token)
    return out


def _fact_check(original_text: str | None, suggested_text: str | None,
                kind: str, section: str) -> dict | None:
    """对单条 AI 建议做事实核验（确定性规则，无 LLM 调用）。

    flags:
      sourced             ✅ 内容来源于原始简历（或原技能细化）
      insufficient_source ⚠ 原简历未提及此内容（纯新增/依据不足）
      added_number        ⚠ 建议中出现了原始简历没有的数字
      added_skill         ⚠ 新增技能（AI 推断）
      exaggeration        ⚠ 可能存在夸大表达（强主张词）
    """
    if kind == "removed" or not (suggested_text or "").strip():
        return None
    orig = original_text or ""
    flags: list[str] = []
    added_numbers: list[str] = []
    exag_words: list[str] = []
    added_words: list[str] = []

    if section == "skills":
        if kind == "added":
            flags.append("added_skill")
        else:  # modified = 同源细化（互为包含才配对成 rename），视为有依据
            flags.append("sourced")
    elif not orig.strip():
        # 纯新增内容（新增描述/简介/项目），原简历无对应原文
        flags.append("insufficient_source")
        added_numbers = sorted(_nums_in(suggested_text))
        if added_numbers:
            flags.append("added_number")
        exag_words = [w for w in _EXAG_WORDS if w in suggested_text]
        if exag_words:
            flags.append("exaggeration")
    else:
        # 来源覆盖率：与原文相似度过低 → 依据不足
        ratio = difflib.SequenceMatcher(None, orig, suggested_text, autojunk=False).ratio()
        if ratio < 0.3:
            flags.append("insufficient_source")
        else:
            flags.append("sourced")
        # 数字比对：建议里有而原文没有的数字
        orig_nums = _nums_in(orig)
        added_numbers = sorted(_nums_in(suggested_text) - orig_nums)
        if added_numbers:
            flags.append("added_number")
        # 夸大词：建议里有而原文没有的强主张词
        exag_words = [w for w in _EXAG_WORDS if w in suggested_text and w not in orig]
        if exag_words:
            flags.append("exaggeration")
        # AI 新增内容片段（供用户核对「哪些词是 AI 新增的」）
        sm = difflib.SequenceMatcher(None, orig, suggested_text, autojunk=False)
        inserts = [suggested_text[op[1]:op[2]].strip()
                   for op in sm.get_opcodes() if op[0] == "insert"]
        added_words = [w for w in inserts if len(w) >= 2][:6]

    warn = [f for f in flags if f != "sourced"]
    return {
        "level": "warn" if warn else "ok",
        "flags": flags,
        "added_numbers": added_numbers,
        "exag_words": exag_words,
        "added_words": added_words,
    }


def _norm(s) -> str:
    return (s or "").replace("\r\n", "\n").strip()


def _skill_rename_pairs(added: list[str], removed: list[str]) -> tuple[list[dict], list[str], list[str]]:
    """识别「同源细化」的技能对（如 微服务 → 微服务开发），与真正增删分开。

    与前端 lib/diff.ts 的 pairSkillRenames 同口径：互为包含且长度差最小的成对项
    视为改写，避免把关键词细化误报成「删技能 + 加技能」。
    """
    def norm(s: str) -> str:
        return re.sub(r"[\s\-_/、,，.。()（）]", "", s.lower())

    pending = list(added)
    refined: list[dict] = []
    dropped: list[str] = []
    for r in removed:
        rn = norm(r)
        if not rn:
            continue
        best_idx, best_gap = -1, 10**9
        for i, a in enumerate(pending):
            an = norm(a)
            if not an:
                continue
            if an in rn or rn in an:
                gap = abs(len(an) - len(rn))
                if gap < best_gap:
                    best_gap, best_idx = gap, i
        if best_idx >= 0:
            refined.append({"from": r, "to": pending[best_idx]})
            pending.pop(best_idx)
        else:
            dropped.append(r)
    return refined, pending, dropped


def _change(
    cid: str, kind: str, section: str, section_label: str, label: str,
    original_text: str | None, suggested_text: str | None,
    loc: dict, payload: dict | None = None, editable: bool = True,
) -> dict:
    return {
        "id": cid, "kind": kind, "section": section, "section_label": section_label,
        "label": label, "original_text": original_text, "suggested_text": suggested_text,
        "loc": loc, "payload": payload, "editable": editable,
    }


def compute_changes(original: dict, optimized: dict) -> list[dict]:
    """对比优化前后简历 JSON，输出条/点级变更清单（顺序：简介→技能→经历→项目）。"""
    original = original or {}
    optimized = optimized or {}
    changes: list[dict] = []

    # ── 个人简介 ──
    b_sum, a_sum = _norm(original.get("summary")), _norm(optimized.get("summary"))
    if b_sum != a_sum and (b_sum or a_sum):
        kind = "modified" if b_sum and a_sum else ("added" if a_sum else "removed")
        changes.append(_change(
            "summary", kind, "summary", "个人简介", "个人简介",
            b_sum or None, a_sum or None, loc={"field": "summary"},
        ))

    # ── 技能关键词（细化/新增/移除 分开列）──
    b_skills = [_norm(str(s)) for s in (original.get("skills") or []) if _norm(str(s))]
    a_skills = [_norm(str(s)) for s in (optimized.get("skills") or []) if _norm(str(s))]
    b_set = {s.lower() for s in b_skills}
    a_set = {s.lower() for s in a_skills}
    raw_added = [s for s in a_skills if s.lower() not in b_set]
    raw_removed = [s for s in b_skills if s.lower() not in a_set]
    refined, added, removed = _skill_rename_pairs(raw_added, raw_removed)
    for i, p in enumerate(refined):
        changes.append(_change(
            f"skill-rename-{i}", "modified", "skills", "技能关键词", "关键词细化",
            p["from"], p["to"], loc={"field": "skills", "rename_from": p["from"]},
        ))
    for i, s in enumerate(added):
        changes.append(_change(
            f"skill-add-{i}", "added", "skills", "技能关键词", f"新增技能：{s}",
            None, s, loc={"field": "skills", "value": s},
        ))
    for i, s in enumerate(removed):
        changes.append(_change(
            f"skill-del-{i}", "removed", "skills", "技能关键词", f"移除技能：{s}",
            s, None, loc={"field": "skills", "value": s},
        ))

    # ── 工作经历：头部字段（整段一项）+ 逐条 bullet ──
    b_exp = original.get("experience") or []
    a_exp = optimized.get("experience") or []
    n_exp = max(len(b_exp), len(a_exp))
    for i in range(n_exp):
        b, a = (b_exp[i] if i < len(b_exp) else None), (a_exp[i] if i < len(a_exp) else None)
        if b is None and a is not None:
            changes.append(_change(
                f"exp-{i}-entry", "added", "experience", "工作经历",
                f"新增经历：{(a.get('company') or '')} {(a.get('title') or '')}".strip(),
                None, _exp_text(a), loc={"field": "experience", "exp": i},
                payload=a, editable=False,
            ))
            continue
        if b is not None and a is None:
            changes.append(_change(
                f"exp-{i}-entry", "removed", "experience", "工作经历",
                f"移除经历：{(b.get('company') or '')} {(b.get('title') or '')}".strip(),
                _exp_text(b), None, loc={"field": "experience", "exp": i},
                editable=False,
            ))
            continue
        # 头部字段（公司/职位/起止时间）
        head_fields = ["company", "title", "start", "end"]
        head_diff = {f: (a.get(f) or "") != (b.get(f) or "") for f in head_fields}
        if any(head_diff.values()):
            changes.append(_change(
                f"exp-{i}-head", "modified", "experience", "工作经历",
                f"经历信息：{(a.get('company') or b.get('company') or '')} · {(a.get('title') or b.get('title') or '')}".strip(" ·"),
                _exp_head(b), _exp_head(a), loc={"field": "experience", "exp": i, "part": "head"},
                payload={f: a.get(f) for f in head_fields}, editable=False,
            ))
        # 逐条 bullet
        b_pts = [_norm(str(p)) for p in (b.get("points") or [])]
        a_pts = [_norm(str(p)) for p in (a.get("points") or [])]
        n_pts = max(len(b_pts), len(a_pts))
        for j in range(n_pts):
            bp = b_pts[j] if j < len(b_pts) else None
            ap = a_pts[j] if j < len(a_pts) else None
            if bp == ap:
                continue
            if bp is None and ap is not None:
                changes.append(_change(
                    f"exp-{i}-pt-{j}", "added", "experience", "工作经历",
                    f"{(a.get('company') or '')} · 新增描述", None, ap,
                    loc={"field": "experience", "exp": i, "part": "points", "idx": j},
                ))
            elif bp is not None and ap is None:
                changes.append(_change(
                    f"exp-{i}-pt-{j}", "removed", "experience", "工作经历",
                    f"{(b.get('company') or '')} · 移除描述", bp, None,
                    loc={"field": "experience", "exp": i, "part": "points", "idx": j},
                ))
            else:
                changes.append(_change(
                    f"exp-{i}-pt-{j}", "modified", "experience", "工作经历",
                    f"{(a.get('company') or b.get('company') or '')} · 改写描述", bp, ap,
                    loc={"field": "experience", "exp": i, "part": "points", "idx": j},
                ))

    # ── 项目经历（整段一项）──
    b_prj = original.get("projects") or []
    a_prj = optimized.get("projects") or []
    n_prj = max(len(b_prj), len(a_prj))
    for i in range(n_prj):
        b = b_prj[i] if i < len(b_prj) else None
        a = a_prj[i] if i < len(a_prj) else None
        bt, at = _proj_text(b), _proj_text(a)
        if b is None and a is not None:
            changes.append(_change(
                f"proj-{i}", "added", "projects", "项目经历",
                f"新增项目：{a.get('name') or ''}".strip(), None, at,
                loc={"field": "projects", "proj": i}, payload=a, editable=False,
            ))
        elif b is not None and a is None:
            changes.append(_change(
                f"proj-{i}", "removed", "projects", "项目经历",
                f"移除项目：{b.get('name') or ''}".strip(), bt, None,
                loc={"field": "projects", "proj": i}, editable=False,
            ))
        elif bt != at and (bt or at):
            changes.append(_change(
                f"proj-{i}", "modified", "projects", "项目经历",
                f"改写项目：{(a.get('name') or b.get('name') or '')}".strip(), bt, at,
                loc={"field": "projects", "proj": i}, payload=a,
            ))

    # ── 事实核验：为每条建议附加事实依据标注（P0-4）──
    for c in changes:
        c["fact_check"] = _fact_check(
            c.get("original_text"), c.get("suggested_text"), c["kind"], c["section"]
        )

    return changes


def _exp_head(e: dict) -> str:
    period = " - ".join(x for x in [e.get("start") or "", e.get("end") or ""] if x)
    return " · ".join(x for x in [e.get("company") or "", e.get("title") or "", period] if x)


def _exp_text(e: dict) -> str:
    pts = "\n".join(f"· {p}" for p in (e.get("points") or []))
    return "\n".join(x for x in [_exp_head(e), pts] if x)


def _proj_text(e: dict | None) -> str:
    if not e:
        return ""
    tech = f"技术栈：{'、'.join(e.get('tech') or [])}" if e.get("tech") else ""
    return "\n".join(x for x in [e.get("name") or "", e.get("description") or "", tech] if x)


def apply_decisions(original: dict, changes: list[dict], decisions: dict[str, dict]) -> tuple[dict, int, int]:
    """把用户决策应用到原始简历，返回 (新JSON, 接受数, 拒绝数)。

    - decisions: {change_id: {"action": "accept"|"reject", "text": 编辑后文本(可选)}}
    - 未提及的变更视为拒绝；accept 时文本优先取 decision.text（编辑后接受）。
    """
    new_json = copy.deepcopy(original or {})
    by_id = {c["id"]: c for c in changes}
    accepted = rejected = 0

    # 先处理删除类（倒序），再处理新增/改写，避免索引位移
    removals: list[dict] = []
    for cid, d in decisions.items():
        c = by_id.get(cid)
        if c is None or d.get("action") != "accept":
            continue
        if c["kind"] == "removed":
            removals.append(c)
            accepted += 1
    removals.sort(key=lambda c: (-c["loc"].get("exp", c["loc"].get("proj", 0)),
                                 -c["loc"].get("idx", 0)))
    for c in removals:
        loc = c["loc"]
        if loc.get("field") == "skills":
            skills = [s for s in (new_json.get("skills") or []) if _norm(str(s)) != _norm(loc["value"])]
            new_json["skills"] = skills
        elif loc.get("field") == "experience" and loc.get("part") == "points":
            exp_list = new_json.get("experience") or []
            i, j = loc["exp"], loc["idx"]
            if i < len(exp_list):
                pts = exp_list[i].get("points") or []
                if j < len(pts):
                    pts.pop(j)
                    exp_list[i]["points"] = pts
        elif loc.get("field") == "experience":
            exp_list = new_json.get("experience") or []
            i = loc["exp"]
            if i < len(exp_list):
                exp_list.pop(i)
                new_json["experience"] = exp_list
        elif loc.get("field") == "projects":
            prj_list = new_json.get("projects") or []
            i = loc["proj"]
            if i < len(prj_list):
                prj_list.pop(i)
                new_json["projects"] = prj_list

    for cid, d in decisions.items():
        c = by_id.get(cid)
        if c is None or d.get("action") != "accept" or c["kind"] == "removed":
            if c is not None and d.get("action") == "reject":
                rejected += 1
            continue
        if c["kind"] != "removed":
            accepted += 1
        text = (d.get("text") or "").strip() or c.get("suggested_text")
        loc = c["loc"]

        if loc.get("field") == "summary":
            if c["kind"] == "removed":
                new_json.pop("summary", None)
            else:
                new_json["summary"] = text

        elif loc.get("field") == "skills":
            if c["kind"] == "added":
                skills = new_json.get("skills") or []
                if text and text not in skills:
                    skills.append(text)
                new_json["skills"] = skills
            elif c["kind"] == "modified":
                frm = loc.get("rename_from")
                new_json["skills"] = [text if _norm(str(s)) == _norm(frm) else s
                                      for s in (new_json.get("skills") or [])]

        elif loc.get("field") == "experience":
            exp_list = new_json.get("experience") or []
            i = loc["exp"]
            if c["kind"] == "added" and c.get("payload"):
                exp_list.append(copy.deepcopy(c["payload"]))
                new_json["experience"] = exp_list
                continue
            if i >= len(exp_list):
                continue
            if loc.get("part") == "head":
                payload = c.get("payload") or {}
                for f in ["company", "title", "start", "end"]:
                    if payload.get(f) is not None:
                        exp_list[i][f] = payload[f]
            elif loc.get("part") == "points":
                pts = exp_list[i].get("points") or []
                if c["kind"] == "added":
                    pts.append(text)
                else:
                    j = loc["idx"]
                    if j < len(pts):
                        pts[j] = text
                exp_list[i]["points"] = pts
            new_json["experience"] = exp_list

        elif loc.get("field") == "projects":
            prj_list = new_json.get("projects") or []
            i = loc["proj"]
            if c["kind"] == "added" and c.get("payload"):
                prj_list.append(copy.deepcopy(c["payload"]))
                new_json["projects"] = prj_list
                continue
            if i < len(prj_list) and c["kind"] == "modified" and c.get("payload"):
                payload = c["payload"]
                if (d.get("text") or "").strip() and payload.get("description") is not None:
                    payload = {**payload, "description": text}
                prj_list[i] = payload
                new_json["projects"] = prj_list

    return new_json, accepted, rejected
