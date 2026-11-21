"""岗位信息完整性校验：内置必填信息模块定义 + 多图识别结果合并。

设计要点：
- 必填模块是岗位库的「关键信息模块」，作为上传完整性校验项；
- 多张图片（如长招聘信息分段截图）解析结果在此合并为一份综合信息；
- 校验不通过时由 API 层返回缺失模块清单，本次上传不落库。
"""

from __future__ import annotations

from typing import Any

# ── 内置必填信息模块（key 对应 parsed_job_json 字段） ──
JOB_REQUIRED_MODULES: list[dict[str, str]] = [
    {"key": "title", "label": "职位名称", "desc": "岗位招聘职位名"},
    {"key": "company", "label": "公司名称", "desc": "招聘公司/主体"},
    {"key": "salary_range", "label": "薪资范围", "desc": "如 20K-40K"},
    {"key": "location", "label": "工作地点", "desc": "如 北京·海淀"},
    {"key": "responsibilities", "label": "岗位职责", "desc": "至少 1 条职责描述"},
    {"key": "requirements", "label": "任职要求", "desc": "技能/经验/学历要求任一"},
]

MODULE_LABELS: dict[str, str] = {m["key"]: m["label"] for m in JOB_REQUIRED_MODULES}


def _clean_str(v: Any) -> str:
    return v.strip() if isinstance(v, str) else ""


def _clean_list(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        s = str(x).strip()
        if s:
            out.append(s)
    return out


def _first_nonempty(*values: Any) -> Any:
    for v in values:
        if isinstance(v, str):
            if v.strip():
                return v.strip()
        elif isinstance(v, list):
            if v:
                return v
        elif v not in (None, {}, ""):
            return v
    return None


def _merge_union(*lists: Any) -> list[str]:
    """按顺序合并多组字符串列表并去重（大小写不敏感）"""
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for item in _clean_list(lst):
            k = item.lower()
            if k not in seen:
                seen.add(k)
                out.append(item)
    return out


def _sub_dict(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def module_value(parsed: dict, key: str) -> Any:
    """提取某必填模块在 parsed_job_json 中的当前值（requirements 是聚合字段）"""
    mh = _sub_dict(parsed.get("must_have"))
    if key == "requirements":
        skills = _clean_list(mh.get("skills"))
        if skills:
            return skills
        return _first_nonempty(mh.get("experience"), mh.get("education")) or ""
    return parsed.get(key)


def module_filled(parsed: dict, key: str) -> bool:
    v = module_value(parsed, key)
    if isinstance(v, list):
        return len(v) > 0
    return bool(str(v if v is not None else "").strip())


def merge_parsed_jobs(parts: list[dict]) -> dict:
    """把多张图片各自解析出的岗位信息合并为一份综合信息。

    规则：
    - 标量字段（title/company/salary_range/location/industry）取第一个非空值；
    - 列表字段（responsibilities/soft_skills/must_have.skills 等）按序合并去重；
    - original_text 用分隔符拼接，供溯源核查；
    - 未知/扩展字段从首个含它的部分透传。
    """
    if not parts:
        return {}

    merged: dict[str, Any] = {}
    for key in ("title", "company", "salary_range", "location", "industry"):
        merged[key] = _first_nonempty(*[p.get(key) for p in parts]) or ""

    merged["responsibilities"] = _merge_union(*[p.get("responsibilities") for p in parts])
    merged["soft_skills"] = _merge_union(*[p.get("soft_skills") for p in parts])

    mh_list = [_sub_dict(p.get("must_have")) for p in parts]
    merged["must_have"] = {
        "skills": _merge_union(*[mh.get("skills") for mh in mh_list]),
        "experience": _first_nonempty(*[mh.get("experience") for mh in mh_list]) or "",
        "education": _first_nonempty(*[mh.get("education") for mh in mh_list]) or "",
    }

    nh_list = [_sub_dict(p.get("nice_to_have")) for p in parts]
    merged["nice_to_have"] = {
        "skills": _merge_union(*[nh.get("skills") for nh in nh_list]),
        "qualifications": _merge_union(*[nh.get("qualifications") for nh in nh_list]),
    }

    texts = [str(p.get("original_text")).strip() for p in parts if str(p.get("original_text") or "").strip()]
    merged["original_text"] = "\n─────\n".join(texts)

    # 扩展字段透传（首个非空）
    known = set(merged.keys())
    for p in parts:
        for k, v in p.items():
            if k not in known and v not in (None, "", [], {}):
                merged[k] = v
    return merged


def check_completeness(parsed: dict) -> dict:
    """校验合并后的岗位信息是否覆盖所有必填模块。

    返回：
    - passed: 是否通过
    - missing_modules / recognized_modules: 缺失/已识别模块的中文名列表
    - module_status: 每个模块的 {key, label, filled, value_summary}
    - filled_count / total
    """
    status = []
    for m in JOB_REQUIRED_MODULES:
        key, label = m["key"], m["label"]
        filled = module_filled(parsed, key)
        value = module_value(parsed, key)
        if isinstance(value, list):
            summary = f"{len(value)} 条"
        else:
            summary = str(value if value is not None else "").strip()
        status.append({
            "key": key,
            "label": label,
            "filled": filled,
            "value_summary": summary[:80],
        })

    missing = [s["label"] for s in status if not s["filled"]]
    recognized = [s["label"] for s in status if s["filled"]]
    return {
        "passed": not missing,
        "missing_modules": missing,
        "recognized_modules": recognized,
        "module_status": status,
        "filled_count": len(recognized),
        "total": len(JOB_REQUIRED_MODULES),
    }
