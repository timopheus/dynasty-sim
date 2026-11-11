"""Cut a sheet whose portraits touch side by side: row bands are found by background rows, columns by an equal split.
Thin separator strips at a cell's sides (one flat colour, top to bottom) are turned into background.
Each cell is placed at the bottom centre of a W x H frame. Usage: cut_grid.py <sheet.png> <out-dir> <prefix> <cols> [WxH]"""
import os, sys
from collections import Counter
from PIL import Image
src, out, prefix, cols = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
FW, FH = map(int, (sys.argv[5] if len(sys.argv) > 5 else '64x80').split('x'))
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
bg = Counter(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()).most_common(1)[0][0]
isbg = [sum(px[x, y] == bg for x in range(W)) > W * 0.9 for y in range(H)]
bands, y = [], 0
while y < H:
    if isbg[y]: y += 1; continue
    s = y
    while y < H and not isbg[y]: y += 1
    if y - s > 30: bands.append((s, y))
os.makedirs(out, exist_ok=True); n = 0
for (y0, y1) in bands:
    for c in range(cols):
        x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
        cell = im.crop((x0, y0, x1, y1)); cw, ch = cell.size; cp = cell.load()
        for x in list(range(0, 7)) + list(range(cw - 7, cw)):  # flat separator columns become background
            colr = Counter(cp[x, yy] for yy in range(ch)).most_common(1)[0]
            if colr[1] > ch * 0.6 and colr[0] in ((240, 210, 180), bg):
                for yy in range(ch): cp[x, yy] = bg
        if cw > FW or ch > FH: print('skip too big', cw, ch); continue
        fr = Image.new('RGB', (FW, FH), bg); fr.paste(cell, ((FW - cw) // 2, FH - ch))
        n += 1; fr.save(os.path.join(out, f'{prefix}-{n:02d}.png'))
print('cells', n, 'bands', bands, 'cell', round(W / cols), 'bg', '#%02x%02x%02x' % bg)
