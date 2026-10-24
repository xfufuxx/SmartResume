"""生成演示用职业照占位图（200x280，5:7 一寸比例）。

风格：柔和的蓝灰渐变底 + 白色人物剪影（头+肩），扁平、明显是占位符，
不冒充真实人像。输出 PNG 的 base64（dataURL）供前后端演示数据内嵌。
"""
from PIL import Image, ImageDraw
import base64
import io

W, H = 200, 280

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)

# 竖向柔和渐变（上浅下深，蓝灰）
top = (214, 226, 238)
bottom = (148, 168, 196)
for y in range(H):
    t = y / (H - 1)
    c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# 白色人物剪影：头（圆）+ 肩（椭圆），居中偏上
cx = W // 2
head_r = 46
head_cy = 108
d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=(255, 255, 255))
# 肩：从头部下方延伸到底部的椭圆（只保留上半）
sh_w, sh_h = 150, 130
sh_cy = 250
d.ellipse([cx - sh_w, sh_cy - sh_h, cx + sh_w, sh_cy + sh_h], fill=(255, 255, 255))

buf = io.BytesIO()
img.save(buf, "PNG", optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
print(f"PNG bytes={len(buf.getvalue())} base64 len={len(b64)}")

# 1) 打印 base64 到文件（供后端 _DEMO_RESUME 使用）
with open("generated-images/app-icon/demo-avatar.b64.txt", "w", encoding="utf-8") as f:
    f.write(b64)
# 2) 同时存一张 PNG 供肉眼检查
img.save("generated-images/app-icon/demo-avatar.png", "PNG", optimize=True)
print("saved demo-avatar.png / demo-avatar.b64.txt")
