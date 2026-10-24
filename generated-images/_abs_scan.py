import os, re, collections

d = "backend/app/templates"
hits = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".html"):
        continue
    lines = open(os.path.join(d, f), encoding="utf-8").read().splitlines()
    last_sel = "?"
    for ln in lines:
        s = ln.strip()
        if "{" in s:
            head = s.split("{")[0].strip()
            if head and not head.startswith("@") and ":" not in head:
                last_sel = head
        if re.search(r"position:[ ]*absolute", s):
            hits.append((f, last_sel[:48]))

for k, v in collections.Counter(h[1] for h in hits).most_common(15):
    print(f"{v:3d}  {k}")
print("总数:", len(hits), "涉及文件:", len(set(h[0] for h in hits)))
