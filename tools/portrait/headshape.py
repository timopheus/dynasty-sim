"""REJECTED (24.10): kept only as a record of the failed trial — head shapes are drawn by RD, not by code.
Head shape by code (constructor probe): the sides of the head — the outline, the ear and the outer cheek — are moved
out or in row by row as a whole, so neither the ear nor the outline is stretched; the gap next to the band of the
features is filled with the cheek tone at its edge, and on narrowing the inner cheek is what disappears. The eyes,
nose and mouth stay exactly on the mannequin's anchors; the palette is untouched. A profile gives, for each
row, how many pixels each side grows (+) or shrinks (-). Usage: headshape.py <in.png> <out.png> <profile>"""
import math, sys
from PIL import Image

FEAT = (38, 70)        # the band of the features on the 96x120 mannequin: never resampled
TOP, BOTTOM = 14, 66   # rows of the head; below, the neck goes into the collar

def bump(y, centre, half, peak):
    return peak * max(0.0, math.cos((y - centre) / half * math.pi / 2)) if abs(y - centre) < half else 0.0

PROFILES = {
    'round':   lambda y: bump(y, 52, 18, 4),
    'full':    lambda y: bump(y, 57, 16, 5) + bump(y, 44, 10, 1),
    'narrow':  lambda y: -bump(y, 48, 26, 3),
    'square':  lambda y: bump(y, 61, 8, 4) + bump(y, 50, 12, 2),
    'cheekbones': lambda y: bump(y, 46, 8, 4) - bump(y, 62, 6, 2),
}

def reshape(im, grow):
    W, H = im.size; out = im.copy()
    for y in range(TOP, BOTTOM + 1):
        d = round(grow(y))
        if d == 0: continue
        xs = [x for x in range(W) if im.getpixel((x, y))[3] >= 128]
        if not xs: continue
        L, R = xs[0], xs[-1]
        fl, fr = max(FEAT[0], L + 2), min(FEAT[1], R - 2)
        row = [im.getpixel((x, y)) for x in range(W)]
        for x in range(W): out.putpixel((x, y), (0, 0, 0, 0) if x < fl or x > fr else row[x])
        left, right = row[L:fl], row[fr + 1:R + 1]
        # widening: the side moves out and the cheek pixel next to the band fills the gap; narrowing: inner cheek goes
        if d > 0:
            left = left + [left[-1]] * d; right = [right[0]] * d + right
        else:
            left = left[:len(left) + d] if len(left) + d > 1 else left[:1]; right = right[-d:] if len(right) + d > 1 else right[-1:]
        for i, p in enumerate(left):
            x = fl - len(left) + i
            if 0 <= x < W: out.putpixel((x, y), p)
        for i, p in enumerate(right):
            x = fr + 1 + i
            if 0 <= x < W: out.putpixel((x, y), p)
    return out

if __name__ == '__main__':
    src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
    reshape(Image.open(src).convert('RGBA'), PROFILES[name]).save(dst)
