"""Review sheet for a 64x80 portrait (art bible): on a light background, with frame lines, with lone dark pixels
marked, and 12x crops of the eyes and the collar. Prints counts that back the visual review.

Usage: python3 -I tools/portrait/view.py <png> <out.png>
"""
import sys
from collections import Counter
from PIL import Image, ImageDraw

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
LIGHT = (0xb4, 0xb4, 0xb4, 255)  # neutral light grey: dark clothes and hair stand out against it

im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size; s = max(2, 384 // W); k = W / 64
idx = [[(RGB.index(im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] >= 128 and im.getpixel((x, y))[:3] in RGB else None) for x in range(W)] for y in range(H)]

# lone dark pixels: a pixel at least two steps darker than every opaque neighbour
lone = []
for y in range(H):
    for x in range(W):
        v = idx[y][x]
        if v is None: continue
        nb = [idx[b][a] for a, b in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if 0 <= a < W and 0 <= b < H and idx[b][a] is not None]
        if len(nb) >= 3 and all(v <= n - 2 for n in nb): lone.append((x, y))
coat = Counter(idx[y][x] for y in range(int(62 * W / 64), H) for x in range(W) if idx[y][x] is not None)

def on(bg, marks=False):
    b = Image.new('RGBA', (W, H), bg); b.alpha_composite(im); b = b.convert('RGB').resize((W * s, H * s), Image.NEAREST)
    if marks:
        d = ImageDraw.Draw(b)
        for x, y in lone: d.rectangle([x * s, y * s, x * s + s - 1, y * s + s - 1], outline='#ff00ff')
    return b

a = on(LIGHT); b = on(LIGHT, marks=True)
d = ImageDraw.Draw(b)
for y, c in ((10, '#2060ff'), (31, '#ff2020'), (52, '#2060ff'), (57, '#10a010')): d.line([(0, int(y * k) * s), (W * s, int(y * k) * s)], fill=c)
d.line([(W // 2 * s, 0), (W // 2 * s, H * s)], fill='#ff2020')

def crop(box, z=None):
    z = z or max(4, int(12 / k)); box = tuple(int(v * k) for v in box)
    c = Image.new('RGBA', (W, H), LIGHT); c.alpha_composite(im)
    c = c.convert('RGB').crop(box); return c.resize((c.width * z, c.height * z), Image.NEAREST)
eyes = crop((14, 20, 50, 34)); collar = crop((16, 50, 48, 66))
cw = max(eyes.width, collar.width)
S = Image.new('RGB', (W * s * 2 + 16 + cw, max(H * s, eyes.height + collar.height + 8)), (40, 40, 40))
S.paste(a, (0, 0)); S.paste(b, (W * s + 8, 0)); S.paste(eyes, (W * s * 2 + 16, 0)); S.paste(collar, (W * s * 2 + 16, eyes.height + 8))
S.save(sys.argv[2])
print({'lone_dark_pixels': len(lone), 'clothes_tones': dict(sorted(coat.items()))})
