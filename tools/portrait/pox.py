"""Pockmarks drawn by code (art bible, step 3): sparse irregular pits on the skin of the cheeks, forehead and chin.
Each pit is one pixel two steps darker than the skin; on mid-tone skin a pixel one step lighter marks its lit rim (upper left).
Density by level (1 light, 2 heavy, D-429 `pockmarks`); placement from a seed, so every person has their own.
Prototype in Python; the game version goes to src/ui/portrait in TypeScript with the same rules.
Usage: python3 -I tools/portrait/pox.py <in.png> <out.png> <level> <seed>"""
import random, sys
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
# areas of skin on the reference base (96x120): cheeks, forehead, chin; features stay clear
AREAS = [(38, 46, 50, 62, 1.0), (59, 46, 71, 62, 1.0), (42, 27, 66, 36, 0.5), (49, 63, 61, 68, 0.4)]
FEATURES = [(40, 40, 51, 46), (57, 40, 68, 46), (47, 49, 61, 56), (44, 57, 64, 63)]

src, out, level, seed = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGBA'); W, H = im.size
tone = lambda x, y: RGB.index(im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] >= 128 else None
rng = random.Random(seed)
pits = []
for x0, y0, x1, y1, weight in AREAS:
    want = round(((x1 - x0) * (y1 - y0)) * weight * (0.035 if level == 1 else 0.075))
    for _ in range(want * 20):
        if sum(1 for p in pits if x0 <= p[0] <= x1 and y0 <= p[1] <= y1) >= want: break
        x, y = rng.randint(x0, x1), rng.randint(y0, y1)
        if any(a - 1 <= x <= c + 1 and b - 1 <= y <= d + 1 for a, b, c, d in FEATURES): continue
        if any(abs(x - px) + abs(y - py) < 3 for px, py in pits): continue  # no clumps, no grid
        v = tone(x, y)
        if v is None or v < 5 or any(tone(x + dx, y + dy) is None or tone(x + dx, y + dy) < 4 for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))): continue
        pits.append((x, y))
for x, y in pits:
    v = tone(x, y)
    im.putpixel((x, y), RGB[max(0, v - 2)] + (255,))
    lx, ly = (x - 1, y) if rng.random() < 0.5 else (x, y - 1)  # the lit rim, towards the light
    lv = tone(lx, ly)
    if lv is not None and 5 <= lv <= 6: im.putpixel((lx, ly), RGB[lv + 1] + (255,))  # on bright skin the rim would read as a white spot
im.save(out); print(len(pits), 'pits')
