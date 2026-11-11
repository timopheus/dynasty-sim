"""Bring cut portraits to one look: strip a cell frame and the cell's own background, put the figure bottom-centre
on the library background in a W x H frame. Cell background is removed only where it is reachable from the cell's
edge without crossing the figure's outline, so skin of the same colour inside the outline stays.
Usage: normalize.py <in.png> <out.png> [WxH]"""
import sys
from collections import Counter, deque
from PIL import Image
BG = (0xe8, 0xe4, 0xdc)
src, dst = sys.argv[1], sys.argv[2]
FW, FH = map(int, (sys.argv[3] if len(sys.argv) > 3 else '48x60').split('x'))
im = Image.open(src).convert('RGB')
def trim(im):
    px = im.load(); W, H = im.size; l, t, r, b = 0, 0, W, H
    def flat(cells): c = Counter(cells).most_common(1)[0]; return c[1] > len(cells) * 0.7
    for _ in range(W):  # peel uniform edge rows and columns (library background, frame lines, top of cell background)
        moved = False
        if r - l > 8 and flat([px[l, y] for y in range(t, b)]): l += 1; moved = True
        if r - l > 8 and flat([px[r - 1, y] for y in range(t, b)]): r -= 1; moved = True
        if b - t > 8 and flat([px[x, t] for x in range(l, r)]): t += 1; moved = True
        if not moved: break
    return im.crop((l, t, r, b))
im = trim(im); W, H = im.size; px = im.load()
ring = [px[x, 0] for x in range(W)] + [px[0, y] for y in range(H)] + [px[W - 1, y] for y in range(H)]
cellbg, share = Counter(ring).most_common(1)[0]
if share < len(ring) * 0.6: cellbg = None  # no cell around the figure: its edge is the figure itself
import os
FORCE = [tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in os.environ.get('CELL_BG', '').split(',') if h]
if sum(sum(px[x, y]) for x in range(W) for y in (0,)) / W < 120: cellbg = None  # edge is dark: no cell background
seen = set(); q = deque()
for x in range(W): q.append((x, 0))
for y in range(H): q.extend(((0, y), (W - 1, y)))
while q:
    x, y = q.popleft()
    if (x, y) in seen or not (0 <= x < W and 0 <= y < H): continue
    c = px[x, y]
    if c != BG and c != cellbg and c not in FORCE: continue
    seen.add((x, y)); px[x, y] = BG
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
bbox = Image.eval(im, lambda v: v).getbbox()
mask = Image.new('L', im.size, 0); mp = mask.load()
for y in range(H):
    for x in range(W):
        if px[x, y] != BG: mp[x, y] = 255
bb = mask.getbbox() or (0, 0, W, H); fig = im.crop(bb); fw, fh = fig.size
if fw > FW or fh > FH:
    print('too big', src, fw, fh); sys.exit(1)
fr = Image.new('RGB', (FW, FH), BG); fr.paste(fig, ((FW - fw) // 2, FH - fh)); fr.save(dst)
