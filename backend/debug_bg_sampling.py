import sys
sys.path.insert(0, '.')
from PIL import Image
from app.services.image_layout_editor import _sample_background_color
import json

img = Image.open('test_output/07_rendered_page.png')
blocks = json.load(open('test_output/07_layout.json', encoding='utf-8'))

EP = 8  # ERASE_PADDING
for b in blocks['blocks']:
    idx = b['index']
    bx = b['bbox']
    x0, y0, x1, y1 = bx[0], bx[1], bx[2], bx[3]
    ex0, ey0, ex1, ey1 = int(x0 - EP), int(y0 - EP), int(x1 + EP), int(y1 + EP)

    bg = _sample_background_color(img, (ex0, ey0, ex1, ey1))
    c1 = img.getpixel((ex0, ey0)) if 0 <= ex0 < img.width and 0 <= ey0 < img.height else 'OOB'
    c2 = img.getpixel((ex1-1, ey0)) if 0 <= ex1-1 < img.width and 0 <= ey0 < img.height else 'OOB'
    c3 = img.getpixel((ex0, ey1-1)) if 0 <= ex0 < img.width and 0 <= ey1-1 < img.height else 'OOB'
    c4 = img.getpixel((ex1-1, ey1-1)) if 0 <= ex1-1 < img.width and 0 <= ey1-1 < img.height else 'OOB'

    # 直接读原 bbox 中心色
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    center = img.getpixel((cx, cy))

    btype = b.get('type', '?')
    text = b['text'][:30] if b.get('text') else ''
    print(f'[{idx:3d}] {btype:12s} erase=({ex0:4d},{ey0:4d},{ex1:4d},{ey1:4d}) '
          f'corners={c1},{c2},{c3},{c4} bg={bg} center={center} text={text}')