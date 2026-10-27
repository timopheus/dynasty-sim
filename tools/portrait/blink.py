"""Blink by code (art bible, step 6): open and closed frames, the loop open — closed — open. A half-closed frame
(the closed upper lid over the open eye's lower half) is also written, for trials; it is not in the loop. Only the eyes' mask pixels differ between frames.
Usage: blink.py <open.png> <closed.png> <mask.png> <out-dir> [preview.gif]"""
import os, sys
from PIL import Image

open_p, closed_p, mask_p, out = sys.argv[1:5]
op = Image.open(open_p).convert('RGBA'); cl = Image.open(closed_p).convert('RGBA'); mk = Image.open(mask_p).convert('RGBA'); W, H = op.size
rows = [y for y in range(H) if any(mk.getpixel((x, y))[3] > 12 for x in range(W))]
mid = (rows[0] + rows[-1]) // 2  # the lid stops halfway down the eye
half = op.copy()
for y in rows:
    for x in range(W):
        if mk.getpixel((x, y))[3] > 12 and y <= mid:
            half.putpixel((x, y), cl.getpixel((x, y)))
# the lid's edge: a dark lash line where the lowered lid meets the eye, only across the eye opening (dark-ish pixels)
PAL = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PAL]
for x in range(W):
    if mk.getpixel((x, mid + 1))[3] > 12:
        below = op.getpixel((x, mid + 1))[:3]
        if below in RGB and RGB.index(below) <= 5:
            half.putpixel((x, mid + 1), RGB[1] + (255,))
os.makedirs(out, exist_ok=True)
for name, im in (('open', op), ('half', half), ('closed', cl)): im.save(f'{out}/blink-{name}.png')
if len(sys.argv) > 5:
    bg = lambda im: (lambda b: (b.alpha_composite(im), b)[1])(Image.new('RGBA', im.size, (0xb4, 0xb4, 0xb4, 255))).convert('RGB').resize((W * 4, H * 4), Image.NEAREST)
    # two frames, as pixel-art blinks usually are: the code-made half frame read as a dashed line and is not used
    seq = [(op, 2600), (cl, 130), (op, 1800), (cl, 130)]
    frames = [bg(f) for f, _ in seq]
    frames[0].save(sys.argv[5], save_all=True, append_images=frames[1:], duration=[d for _, d in seq], loop=0)
print('mid row', mid, 'frames written')
