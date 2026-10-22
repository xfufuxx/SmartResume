"""Scan frontend TSX/TS inline styles for hardcoded colors that break dark mode.

Flags:
  - background/backgroundColor with light hex (luminance > 0.72): white-ish text
    (AntD dark colorText) becomes invisible on it.
  - color with dark hex (luminance < 0.30): invisible on dark surfaces.
Ignores rgba() and non-hex values; classification is advisory, verify manually.
"""
import json
import os
import re
import sys

ROOT = r"D:/Desktop/智能简历1/frontend/src"

HEX_RE = re.compile(r"#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}")
# match  prop: '#hex'  or  prop: "#hex"
PROP_RE = re.compile(
    r"(background|backgroundColor|backgroundImage|color|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|fill|stroke)\s*:\s*(['\"])(#[0-9a-fA-F]{3,8})\2"
)

def lum(hexstr: str) -> float:
    h = hexstr.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0

BG_PROPS = {"background", "backgroundColor", "backgroundImage"}
FG_PROPS = {"color", "fill", "stroke"}

findings = []
for dirpath, _dirs, files in os.walk(ROOT):
    if "node_modules" in dirpath or ".next" in dirpath:
        continue
    for fn in files:
        if not fn.endswith((".tsx", ".ts")):
            continue
        path = os.path.join(dirpath, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception as e:
            print("READ FAIL", path, e, file=sys.stderr)
            continue
        for i, line in enumerate(lines, 1):
            for m in PROP_RE.finditer(line):
                prop, _q, val = m.group(1), m.group(2), m.group(3)
                L = lum(val)
                if prop in BG_PROPS and L > 0.72:
                    kind = "light-bg"
                elif prop in FG_PROPS and L < 0.30:
                    kind = "dark-fg"
                else:
                    continue
                findings.append(
                    {
                        "file": os.path.relpath(path, ROOT).replace("\\", "/"),
                        "line": i,
                        "prop": prop,
                        "value": val,
                        "lum": round(L, 3),
                        "kind": kind,
                        "code": line.strip()[:160],
                    }
                )

print(json.dumps(findings, ensure_ascii=False, indent=1))
print("TOTAL", len(findings), file=sys.stderr)
