"""Idle animation by code (art bible, step 6): rare blinks and an occasional breath.
- Blink: the closed-eyes frame for 150-320 ms (each blink its own), at uneven intervals of 5-9 s.
- Breath: the whole figure rises 1 px on the inhale (about 1.2 s), settles back, then rests 4-7 s before the next.
The bottom row is repeated when the figure rises, so the cut-off chest never shows a gap. Deterministic for a seed.
Usage: idle.py <open.png> <closed.png> <seconds> <seed> <out.gif> [scale]"""
import random, sys
from PIL import Image

op = Image.open(sys.argv[1]).convert('RGBA'); cl = Image.open(sys.argv[2]).convert('RGBA')
total, seed, out = int(sys.argv[3]) * 1000, int(sys.argv[4]), sys.argv[5]
scale = int(sys.argv[6]) if len(sys.argv) > 6 else 4
W, H = op.size
rng = random.Random(seed)

def lifted(im, dy):
    if dy == 0: return im
    r = Image.new('RGBA', (W, H), (0, 0, 0, 0)); r.paste(im.crop((0, dy, W, H)), (0, 0))
    for k in range(dy): r.paste(im.crop((0, H - 1, W, H)), (0, H - dy + k))  # repeat the bottom row
    return r

# events on a millisecond timeline
# each blink holds the eyes closed for its own time (150-320 ms): uneven blinks look alive
blinks, t = [], rng.randint(2500, 4500)
while t < total: blinks.append((t, rng.randint(150, 320))); t += rng.randint(5000, 9000)
breaths, t = [], rng.randint(1500, 3000)
while t < total: breaths.append(t); t += 1200 + rng.randint(4000, 7000)
def state(ms):
    eyes = any(b <= ms < b + d for b, d in blinks)
    up = any(b <= ms < b + 1200 for b in breaths)
    return eyes, up
# frames at each change of state
cuts = sorted({0, total} | {b for b, _ in blinks} | {b + d for b, d in blinks} | {b for b in breaths} | {b + 1200 for b in breaths})
cuts = [c for c in cuts if 0 <= c <= total]
bg = lambda im: (lambda b: (b.alpha_composite(im), b)[1])(Image.new('RGBA', im.size, (0xb4, 0xb4, 0xb4, 255))).convert('RGB').resize((W * scale, H * scale), Image.NEAREST)
frames, durs = [], []
for a, b in zip(cuts, cuts[1:]):
    if b <= a: continue
    eyes, up = state(a)
    frames.append(bg(lifted(cl if eyes else op, 1 if up else 0))); durs.append(b - a)
frames[0].save(out, save_all=True, append_images=frames[1:], duration=durs, loop=0)
print('blink holds, ms:', [d for _, d in blinks])
print(f'{len(blinks)} blinks, {len(breaths)} breaths in {total // 1000} s; frames {len(frames)}')
