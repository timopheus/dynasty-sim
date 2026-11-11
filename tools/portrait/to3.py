"""Turn a portrait into the three-colour passport style (Papers, Please): transparent background stays background,
tones up to a step of the ink-paper ramp become the outline colour, the rest becomes skin. Colours come from the passport palette and can be swapped later without regenerating anything.
Usage: to3.py <in.png> <out.png> [last dark step of the ink-paper ramp, default 3]"""
import sys
from PIL import Image
DARK, SKIN, BG = (72, 69, 68), (142, 135, 133), (160, 149, 145)
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size
lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
# the cut is a step of the ink-paper ramp: tones up to it (hair, clothes, eyes, deep shadow) become the outline colour
INK = [(28, 19, 14), (52, 43, 35), (76, 66, 55), (100, 90, 76), (124, 113, 97), (148, 137, 117), (172, 160, 138), (196, 184, 159), (220, 207, 179), (244, 231, 200)]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 3
cut = (lum(INK[step]) + lum(INK[step + 1])) / 2
out = Image.new('RGBA', (W, H), BG + (255,))
for y in range(H):
    for x in range(W):
        p = im.getpixel((x, y))
        if p[3] >= 128: out.putpixel((x, y), (DARK if lum(p) < cut else SKIN) + (255,))
out.save(sys.argv[2])
