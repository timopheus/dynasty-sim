"""Cut a sheet of many portraits on a flat background into single portraits.
Finds each figure as a connected blob of non-background pixels, rejects blobs that touch a neighbour or the sheet's edge
or are too small, and centres each figure in a W x H frame with the bottom of the figure on the frame's bottom edge.
Usage: cut_sheet.py <sheet.png> <out-dir> <prefix> [WxH]"""
import os, sys
from collections import Counter, deque
from PIL import Image
src, out, prefix = sys.argv[1:4]
FW, FH = map(int, (sys.argv[4] if len(sys.argv) > 4 else '80x100').split('x'))
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
bg = Counter(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()).most_common(1)[0][0]
seen = [[False] * W for _ in range(H)]; blobs = []
for y in range(H):
    for x in range(W):
        if seen[y][x] or px[x, y] == bg: continue
        q = deque([(x, y)]); seen[y][x] = True; pts = []
        while q:
            a, b = q.popleft(); pts.append((a, b))
            for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                if 0 <= c < W and 0 <= d < H and not seen[d][c] and px[c, d] != bg: seen[d][c] = True; q.append((c, d))
        if len(pts) > 300: blobs.append(pts)
os.makedirs(out, exist_ok=True); report = []
widths = sorted(max(p[0] for p in b) - min(p[0] for p in b) + 1 for b in blobs); med = widths[len(widths) // 2] if widths else 0
blobs.sort(key=lambda b: (min(p[1] for p in b) // 40, min(p[0] for p in b)))
for i, b in enumerate(blobs):
    x0, x1 = min(p[0] for p in b), max(p[0] for p in b); y0, y1 = min(p[1] for p in b), max(p[1] for p in b)
    w, h = x1 - x0 + 1, y1 - y0 + 1; why = []
    if w > med * 1.4: why.append('merged')
    if x0 == 0 or x1 == W - 1 or y0 == 0: why.append('edge')
    if w > FW - 8 or h > FH - 6: why.append('too big')
    name = f'{prefix}-{i + 1:02d}'
    if why: report.append((name, w, h, 'REJECT ' + ','.join(why))); continue
    fr = Image.new('RGB', (FW, FH), bg); fp = fr.load(); ox = (FW - w) // 2; oy = FH - h
    owned = set(b)  # copy the whole box: fragments split off by background-coloured pixels (white wigs, lace) stay;
    others = {q for o in blobs if o is not b for q in o if x0 <= q[0] <= x1 and y0 <= q[1] <= y1}  # but not a neighbour's
    for yy in range(y0, y1 + 1):
        for xx in range(x0, x1 + 1):
            if (xx, yy) not in others: fp[xx - x0 + ox, yy - y0 + oy] = px[xx, yy]
    fr.save(os.path.join(out, name + '.png')); report.append((name, w, h, 'ok'))
for r in report: print(*r)
print('kept', sum(r[3] == 'ok' for r in report), 'of', len(report), 'bg', '#%02x%02x%02x' % bg)
