"""Find near-duplicate portraits: compares each pair by a small greyscale thumbnail of the head (upper 60% of the
figure) and groups pairs closer than a threshold; keeps the first of each group. Usage: clones.py <dir> [threshold]"""
import glob, os, sys
from PIL import Image
d = sys.argv[1]; T = float(sys.argv[2]) if len(sys.argv) > 2 else 18
fs = sorted(glob.glob(os.path.join(d, '*.png')))
def thumb(f):
    im = Image.open(f).convert('L'); bbox = Image.eval(im, lambda v: 0 if abs(v - im.getpixel((0, 0))) < 4 else 255).getbbox()
    im = im.crop(bbox); w, h = im.size
    return list(im.crop((0, 0, w, int(h * 0.6))).resize((10, 10), Image.BILINEAR).getdata())
th = {f: thumb(f) for f in fs}
dist = lambda a, b: (sum((x - y) ** 2 for x, y in zip(a, b)) / len(a)) ** 0.5
keep, drop = [], {}
for f in fs:
    near = [k for k in keep if dist(th[f], th[k]) < T]
    if near: drop[f] = (near[0], round(dist(th[f], th[near[0]]), 1))
    else: keep.append(f)
for f, (k, v) in drop.items(): print('clone', os.path.basename(f), '~', os.path.basename(k), v)
print('unique', len(keep), 'of', len(fs))
