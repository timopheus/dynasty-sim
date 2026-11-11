"""Free local clean-up of a palette portrait: removes specks — dark clusters of 1-2 pixels that are at least two steps
darker than everything around them — and leaves contour lines (longer chains) alone. Writes the cleaned image and a
list of what changed. Usage: python3 -I tools/portrait/clean.py <in.png> <out.png>"""
import sys
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size
idx = [[RGB.index(im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] >= 128 else None for x in range(W)] for y in range(H)]
N8 = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
seen, changes = set(), []
for y in range(H):
    for x in range(W):
        v = idx[y][x]
        if v is None or (x, y) in seen: continue
        # the cluster of pixels at most one step from v around (x, y), 8-connected, capped at 3
        comp, stack = [(x, y)], [(x, y)]
        seen.add((x, y))
        while stack and len(comp) <= 3:
            a, b = stack.pop()
            for dx, dy in N8:
                p, q = a + dx, b + dy
                if 0 <= p < W and 0 <= q < H and (p, q) not in seen and idx[q][p] is not None and abs(idx[q][p] - v) <= 1 and idx[q][p] <= v + 1 and idx[q][p] < v + 1 or (0 <= p < W and 0 <= q < H and (p, q) not in seen and idx[q][p] == v):
                    seen.add((p, q)); comp.append((p, q)); stack.append((p, q))
        if len(comp) > 2: continue
        ring = {(a + dx, b + dy) for a, b in comp for dx, dy in N8} - set(comp)
        around = [idx[q][p] for p, q in ring if 0 <= p < W and 0 <= q < H]
        if len(around) < 6 or any(t is None for t in around): continue  # edge of the figure: keep
        darkest = max(idx[b][a] for a, b in comp)
        if all(t >= darkest + 2 for t in around):
            fill = sorted(around)[len(around) // 2]
            for a, b in comp:
                changes.append((a, b, idx[b][a], fill)); im.putpixel((a, b), RGB[fill] + (255,))
im.save(sys.argv[2])
print(len(changes), 'pixels changed:', changes)
