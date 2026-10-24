import os, re

targets = ["academic", "dark", "elegant", "fresh", "jade-executive", "jade-gradient",
           "jade-luxe", "jade-modern", "jade-neon", "jade-twocol", "modern", "ocean",
           "sunset", "violet", "jade-magazine", "jade-architect", "jade-artistic",
           "jade-berlin", "jade-blocks", "jade-card", "jade-coder", "jade-consultant"]
d = "backend/app/templates"
for t in targets:
    p = os.path.join(d, f"{t}.html")
    if not os.path.exists(p):
        continue
    src = open(p, encoding="utf-8").read()
    # .header 规则体
    m = re.search(r"\.header\s*\{([^{}]*)\}", src)
    body = m.group(1) if m else ""
    pos = "relative" if "position" in body and "relative" in body else ("absolute" if "absolute" in body else "static")
    # header 内的绝对定位装饰
    deco = re.findall(r"\.header\s+(\.[a-z-]+)\s*\{[^{}]*position:\s*absolute", src)
    # body 规则
    bm = re.search(r"(?:^|\n)\s*body\s*\{([^{}]*)\}", src)
    bpos = ""
    if bm and "position" in bm.group(1):
        bpos = "BODY-HAS-POSITION"
    print(f"{t:16s} header={pos:9s} deco={deco} {bpos}")
