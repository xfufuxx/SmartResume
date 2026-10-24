"""把职业照渲染宏接入全部模板（一次性脚本，可重复运行/幂等）。

插入规则：
1. `{% from '_avatar.html' import avatar %}` 加到 <body> 行之后；
2. 头像调用 `{{ avatar(resume, placement) }}` 插到姓名元素之前：
   - 姓名在 .header/.masthead 容器内 → 插在容器开标签之后（flow 摆放时浮动在容器内）；
   - 裸 <h1>（professional/simple）→ 插在 <h1> 行之前；
3. placement：全幅头部模板用 flow（避开顶部色带）；jade-magazine 用 flow；
   其余用 corner（绝对定位到内容区右上角）；jade-twocol 走侧栏特例；
4. layout_export.html / _avatar.html 跳过；已接入的模板跳过（幂等）。

用法：python scripts/insert_avatar_macro.py [--apply]
不带 --apply 时只打印计划（dry-run）。
"""
import os
import re
import sys

TPL_DIR = os.path.join("backend", "app", "templates")

FULL_BLEED = {
    "academic", "dark", "elegant", "fresh", "jade-executive", "jade-gradient",
    "jade-luxe", "jade-modern", "jade-neon", "jade-twocol", "modern", "ocean",
    "sunset", "violet",
}
FLOW_EXTRA = {"jade-magazine"}  # 杂志刊头设计：照片浮动在刊头内
SKIP = {"layout_export", "_avatar"}
IMPORT_LINE = "{% from '_avatar.html' import avatar %}"

NAME_RE = re.compile(
    r"(<div class=\"(?:name|mast-name)\">\{\{ resume\.personal_info\.name)"
    r"|(<h1>\{\{ resume\.personal_info\.name)"
)


def plan_for(src: str, tid: str) -> tuple[str, str] | None:
    """返回 (插入位置描述, 插入内容)；None = 无需处理。"""
    if "from '_avatar.html' import avatar" in src:
        return None
    body_idx = src.find("<body>")
    if body_idx == -1:
        return None
    body_line_end = src.find("\n", body_idx)

    placement = "flow" if (tid in FULL_BLEED or tid in FLOW_EXTRA) else "corner"

    # jade-twocol：侧栏字母头像 → 有照片用照片，无照片退回字母
    if tid == "jade-twocol":
        old = '<div class="side-avatar">{{ (resume.personal_info.name or \'简\')[:1] }}</div>'
        if old in src:
            new = (
                '<div class="side-avatar">'
                '{% if resume.personal_info.avatar %}'
                '<img class="tpl-avatar" src="{{ resume.personal_info.avatar }}" alt="职业照" '
                'style="width:100%;height:100%;aspect-ratio:1/1;border-radius:9999px;'
                'object-fit:cover;display:block;" />'
                '{% else %}{{ (resume.personal_info.name or \'简\')[:1] }}{% endif %}</div>'
            )
            return ("side-avatar", new)
        return None

    # 找 body 内第一个姓名元素
    m = NAME_RE.search(src, body_idx)
    if not m:
        return None
    name_start = m.start()

    # 姓名所在的容器开标签（.header / .masthead）：向前找最近的容器开标签
    container = None
    for pat in (r'<div class="header">', r'<div class="masthead">'):
        cidx = src.rfind(pat, body_idx, name_start)
        if cidx != -1 and (container is None or cidx > container[0]):
            container = (cidx, pat)

    if container:
        cidx, pat = container
        line_end = src.find("\n", cidx)
        call = f'      {{{{ avatar(resume, placement="{placement}") }}}}'
        return (f"after {pat.strip('<>')} (line {src.count(chr(10), 0, cidx) + 1})", call)

    # 裸 <h1>：插到该行之前
    line_start = src.rfind("\n", body_idx, name_start) + 1
    indent = ""
    mm = re.match(r"(\s*)", src[line_start:])
    if mm:
        indent = mm.group(1)
    call = f'{indent}{{{{ avatar(resume, placement="{placement}") }}}}'
    return (f"before <h1> (line {src.count(chr(10), 0, line_start) + 1})", call)


def apply_for(src: str, tid: str) -> tuple[str, str] | None:
    """落盘版：返回 (新内容, 说明)；None = 无需处理。"""
    if "from '_avatar.html' import avatar" in src:
        return None
    body_idx = src.find("<body>")
    if body_idx == -1:
        return None
    body_line_end = src.find("\n", body_idx)
    placement = "flow" if (tid in FULL_BLEED or tid in FLOW_EXTRA) else "corner"

    if tid == "jade-twocol":
        old = '<div class="side-avatar">{{ (resume.personal_info.name or \'简\')[:1] }}</div>'
        if old in src:
            new = (
                '<div class="side-avatar">'
                '{% if resume.personal_info.avatar %}'
                '<img class="tpl-avatar" src="{{ resume.personal_info.avatar }}" alt="职业照" '
                'style="width:100%;height:100%;aspect-ratio:1/1;border-radius:9999px;'
                'object-fit:cover;display:block;" />'
                '{% else %}{{ (resume.personal_info.name or \'简\')[:1] }}{% endif %}</div>'
            )
            out = src.replace(old, new, 1)
            out = out[:body_line_end + 1] + "  " + IMPORT_LINE + "\n" + out[body_line_end + 1:]
            return out, "side-avatar"
        return None

    m = NAME_RE.search(src, body_idx)
    if not m:
        return None
    name_start = m.start()

    container = None
    for pat in (r'<div class="header">', r'<div class="masthead">'):
        cidx = src.rfind(pat, body_idx, name_start)
        if cidx != -1 and (container is None or cidx > container[0]):
            container = (cidx, pat)

    if container:
        cidx, pat = container
        line_end = src.find("\n", cidx)
        call = f'      {{{{ avatar(resume, placement="{placement}") }}}}'
        out = src[:line_end + 1] + call + "\n" + src[line_end + 1:]
        out = out[:body_line_end + 1] + "  " + IMPORT_LINE + "\n" + out[body_line_end + 1:]
        return out, f"after {pat.strip('<>')}"

    line_start = src.rfind("\n", body_idx, name_start) + 1
    mm = re.match(r"(\s*)", src[line_start:])
    indent = mm.group(1) if mm else ""
    call = f'{indent}{{{{ avatar(resume, placement="{placement}") }}}}'
    out = src[:line_start] + call + "\n" + src[line_start:]
    out = out[:body_line_end + 1] + "  " + IMPORT_LINE + "\n" + out[body_line_end + 1:]
    return out, "before <h1>"


def main():
    do_apply = "--apply" in sys.argv
    files = sorted(f for f in os.listdir(TPL_DIR) if f.endswith(".html"))
    n_ok = n_skip = n_none = 0
    for f in files:
        tid = f[:-5]
        if tid in SKIP:
            continue
        src = open(os.path.join(TPL_DIR, f), encoding="utf-8").read()
        if "from '_avatar.html' import avatar" in src:
            n_skip += 1
            continue
        plan = plan_for(src, tid)
        if not plan:
            print(f"[跳过] {tid}: 未找到姓名元素")
            n_none += 1
            continue
        where, content = plan
        print(f"[计划] {tid:18s} {where}  → {content.strip()[:70]}")
        n_ok += 1
        if do_apply:
            result = apply_for(src, tid)
            if result:
                new_src, how = result
                open(os.path.join(TPL_DIR, f), "w", encoding="utf-8").write(new_src)
    print(f"\n合计: 计划 {n_ok}，已接入 {n_skip}，无姓名元素 {n_none}")


if __name__ == "__main__":
    main()
