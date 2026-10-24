"""一次性脚本：给 55 套模板的职业照宏调用点透传 avatar_style。

背景：Jinja 宏内访问不到渲染上下文变量（template.render 传入的 avatar_style
在宏内恒为 Undefined），必须经调用点显式传参。本脚本把
    {{ avatar(resume, placement="X") }}
改成
    {{ avatar(resume, placement="X", avatar_style=avatar_style) }}
模板级调用点能正常读到渲染上下文里的 avatar_style，传进宏后形状才生效。

用法：python scripts/patch_avatar_callsites.py [--apply]
"""
import re
import sys
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "backend" / "app" / "templates"

#: 只匹配不带 avatar_style 的调用（避免重复替换）
PATTERN = re.compile(r"\{\{\s*avatar\(resume,\s*placement=\"(corner|flow|inline)\"\)\s*\}\}")


def main() -> int:
    apply = "--apply" in sys.argv
    total_files = total_hits = 0
    for html in sorted(TEMPLATES.glob("*.html")):
        if html.name == "_avatar.html":
            continue
        text = html.read_text(encoding="utf-8")
        new_text, n = PATTERN.subn(
            lambda m: '{{ avatar(resume, placement="%s", avatar_style=avatar_style) }}' % m.group(1),
            text,
        )
        if n:
            total_files += 1
            total_hits += n
            print(f"{'[APPLY]' if apply else '[DRY]'} {html.name} — {n} 处")
            if apply:
                html.write_text(new_text, encoding="utf-8")
    print(f"\n共 {total_hits} 处调用点 / {total_files} 个文件"
          f"（{'已写入' if apply else '试运行，加 --apply 生效'}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
