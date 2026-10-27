"""Free softening of hard shadow edges on the skin: along a border where two skin tones differ by two steps or more,
the darker pixel gets the step in between, so planes meet through a transition instead of a cut (art bible: shading in
large planes, but soft light). Hair (tones 0-2) and protected feature boxes are left alone.
Usage: soften.py <in.png> <out.png> <x0,y0,x1,y1 area> [feature boxes ...]"""
import sys
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size
ax0, ay0, ax1, ay1 = map(int, sys.argv[3].split(','))
keep = [tuple(map(int, b.split(','))) for b in sys.argv[4:]]
t = lambda x, y: RGB.index(im.getpixel((x, y))[:3]) if 0 <= x < W and 0 <= y < H and im.getpixel((x, y))[3] >= 128 else None
snap = {(x, y): t(x, y) for y in range(H) for x in range(W)}
n = 0
for y in range(ay0, ay1 + 1):
    for x in range(ax0, ax1 + 1):
        v = snap[(x, y)]
        if v is None or v < 3 or any(a <= x <= c and b <= y <= d for a, b, c, d in keep): continue
        lighter = [snap.get((x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        lighter = [u for u in lighter if u is not None and u >= 3]
        if lighter and max(lighter) - v >= 2:
            im.putpixel((x, y), RGB[v + 1] + (255,)); n += 1
im.save(sys.argv[2]); print('softened', n)
