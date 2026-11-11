"""Free local clean-up (highlights on dark cloth are kept): every one-pixel outlier (all four neighbours on the same side of it in tone) takes the most
common tone of its neighbours, except inside protected feature boxes (eyes, nostrils, mouth), where single pixels are
drawn on purpose. Usage: denoise.py <in.png> <out.png> x0,y0,x1,y1 [...]"""
import sys
from collections import Counter
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size
keep = [tuple(map(int, b.split(','))) for b in sys.argv[3:]]
idx = [[RGB.index(im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] >= 128 else None for x in range(W)] for y in range(H)]
changed = 0
for y in range(1, H - 1):
    for x in range(1, W - 1):
        v = idx[y][x]
        if v is None or any(a <= x <= c and b <= y <= d for a, b, c, d in keep): continue
        nb = [idx[y + dy][x + dx] for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))]
        if None in nb: continue
        # a bright pixel on dark cloth or metal is a highlight (a button, a buckle): keep it
        if all(n < v for n in nb) and max(nb) <= 4: continue
        if all(n > v for n in nb) or all(n < v for n in nb):
            t = Counter(nb).most_common(1)[0][0]
            im.putpixel((x, y), RGB[t] + (255,)); changed += 1
im.save(sys.argv[2]); print('changed', changed)
