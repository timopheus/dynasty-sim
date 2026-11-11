"""Checks for a black line portrait on white (passport style): is the outline closed (a flood from the frame's edge
must not reach the face), how many lone black specks there are, and a review sheet: as generated, on a grey
background, and with the flood shown in red. Usage: line_check.py <in.png> <sheet.png>"""
import sys
from collections import deque
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size
black = lambda x, y: sum(im.getpixel((x, y))) < 200
seen = [[False] * W for _ in range(H)]
q = deque((x, y) for y in range(H) for x in range(W) if (x in (0, W - 1) or y == 0) and not black(x, y))
for x, y in q: seen[y][x] = True
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a, b = x + dx, y + dy
        if 0 <= a < W and 0 <= b < H and not seen[b][a] and not black(a, b): seen[b][a] = True; q.append((a, b))
cx = W // 2
leak = sum(1 for y in range(int(H * 0.25), int(H * 0.6)) for x in range(cx - W // 8, cx + W // 8) if seen[y][x])
specks = sum(1 for y in range(1, H - 1) for x in range(1, W - 1) if black(x, y) and not any(black(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy))
print({'black_px': sum(1 for y in range(H) for x in range(W) if black(x, y)), 'face_leak_px': leak, 'closed': leak == 0, 'lone_specks': specks})
z = 5; S = Image.new('RGB', (3 * (W * z + 8), H * z), (40, 40, 40))
S.paste(im.resize((W * z, H * z), Image.NEAREST), (0, 0))
g = Image.new('RGB', (W, H)); f = Image.new('RGB', (W, H))
for y in range(H):
    for x in range(W):
        g.putpixel((x, y), (0, 0, 0) if black(x, y) else ((160, 149, 145) if seen[y][x] else (230, 220, 205)))
        f.putpixel((x, y), (0, 0, 0) if black(x, y) else ((200, 110, 110) if seen[y][x] else (245, 240, 230)))
S.paste(g.resize((W * z, H * z), Image.NEAREST), (W * z + 8, 0)); S.paste(f.resize((W * z, H * z), Image.NEAREST), (2 * (W * z + 8), 0))
S.save(sys.argv[2])
