"""Frame check for a generated 64x80 portrait (art bible, D-305): palette, background, figure placement.

Usage: python3 -I tools/portrait/frame_check.py <png>...  Prints one row per image; no network, no cost.
"""
import sys
from collections import Counter, deque
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
W, H, CX = 64, 80, 32  # defaults; the real size is read from each image


def index_of(c):
    return min(range(len(RGB)), key=lambda i: sum((a - b) ** 2 for a, b in zip(RGB[i], c)))


def check(path):
    src = Image.open(path).convert('RGBA')
    W, H = src.size; CX = W // 2; k = W / 64  # thresholds below are written for 64 px wide and scale with the image
    alpha = [[src.getpixel((x, y))[3] for x in range(W)] for y in range(H)]
    transparent = any(a < 128 for row in alpha for a in row)
    im = src.convert('RGB')
    px = [[im.getpixel((x, y)) for x in range(W)] for y in range(H)]
    opaque = [c for y, row in enumerate(px) for x, c in enumerate(row) if alpha[y][x] >= 128]
    exact = sum(1 for c in opaque if c in RGB) / max(1, len(opaque))
    idx = [[index_of(c) for c in row] for row in px]
    border = [idx[y][x] for y in range(H) for x in range(W) if x in (0, W - 1) or y == 0]
    bg, bg_n = Counter(border).most_common(1)[0]
    # background = pixels of the background tone connected to the top and side edges
    seen = [[False] * W for _ in range(H)]
    q = deque((x, y) for y in range(H) for x in range(W) if (x in (0, W - 1) or y == 0) and idx[y][x] == bg)
    for x, y in q: seen[y][x] = True
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = x + dx, y + dy
            if 0 <= a < W and 0 <= b < H and not seen[b][a] and idx[b][a] == bg:
                seen[b][a] = True; q.append((a, b))
    fig = [[alpha[y][x] >= 128 for x in range(W)] for y in range(H)] if transparent else [[not seen[y][x] for x in range(W)] for y in range(H)]
    rows = [[x for x in range(W) if fig[y][x]] for y in range(H)]
    top = next((y for y in range(H) if len(rows[y]) > 2), None)
    # head: rows above the shoulders (figure narrower than 46 px)
    shoulder = next((y for y in range(top or 0, H) if len(rows[y]) >= 46 * k), None)
    head_rows = [r for r in rows[(top or 0):min(shoulder or H, (top or 0) + int(40 * k))] if r]  # crown to about the chin
    head_w = max((r[-1] - r[0] + 1 for r in head_rows), default=0)
    head_cx = sum((r[0] + r[-1]) / 2 for r in head_rows) / max(1, len(head_rows))
    # shoulder tilt: first figure row at x=8 and x=55
    def first(x):
        return next((y for y in range(H) if fig[y][x]), H)

    tilt = first(W - 1 - int(6 * k)) - first(int(6 * k))
    # torso axis: the neckcloth (the lightest pixels below the chin) should sit under the middle of the head
    # rows just below the shoulder line, where the knot of the neckcloth sits (above them the collar's lit edge misleads)
    start = shoulder if shoulder is not None else (top or 0) + int(48 * k)
    cloth = [x for y in range(start, min(H, start + int(16 * k))) for x in range(W) if fig[y][x] and idx[y][x] >= 8]
    axis = round(sum(cloth) / len(cloth) - head_cx, 1) if cloth else None
    return {'file': path.split('/')[-1], 'alpha': transparent, 'palette%': round(exact * 100), 'bg': bg, 'bg_border%': round(100 * bg_n / len(border)),
            'top': top, 'shoulders_y': shoulder, 'head_w': head_w, 'head_cx_off': round(head_cx - CX + 0.5, 1), 'tilt': tilt, 'torso_axis': axis}


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(check(p))
