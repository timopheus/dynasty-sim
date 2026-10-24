"""Side-by-side review sheet: on the game background and on grey with frame lines. Usage: view.py <png> <out.png>"""
import sys
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size; s = 6
def on(bg):
    b = Image.new('RGBA', (W, H), bg); b.alpha_composite(im); return b.convert('RGB').resize((W * s, H * s), Image.NEAREST)
a, b = on((0x34, 0x2b, 0x23, 255)), on((0x80, 0x80, 0x80, 255))
d = ImageDraw.Draw(b)
for y, c in ((10, '#5aa0ff'), (31, '#ff3030'), (52, '#5aa0ff'), (57, '#30c030')): d.line([(0, y * s), (W * s, y * s)], fill=c)
d.line([(32 * s, 0), (32 * s, H * s)], fill='#ff3030')
S = Image.new('RGB', (W * s * 2 + 8, H * s), (40, 40, 40)); S.paste(a, (0, 0)); S.paste(b, (W * s + 8, 0)); S.save(sys.argv[2])
