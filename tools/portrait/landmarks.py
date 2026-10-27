"""Rough landmarks of a 96x120 portrait for checking that a part sits where the mannequin's does: the eye line, the
eye centres, the nose base and the mouth line, found as the darkest rows and blobs inside fixed search windows.
Usage: landmarks.py <png>..."""
import sys
from PIL import Image
PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]
def marks(path):
    im = Image.open(path).convert('RGBA')
    t = lambda x, y: RGB.index(im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] >= 128 and im.getpixel((x, y))[:3] in RGB else 9
    dark = lambda y, x0, x1: sum(max(0, 4 - t(x, y)) for x in range(x0, x1))
    eye_y = max(range(36, 50), key=lambda y: dark(y, 38, 70))
    def centre(x0, x1):
        pts = [(x, y) for y in range(eye_y - 2, eye_y + 3) for x in range(x0, x1) if t(x, y) <= 2]
        return round(sum(x for x, _ in pts) / len(pts), 1) if pts else None
    nose_y = max(range(49, 58), key=lambda y: dark(y, 47, 62))
    mouth_y = max(range(56, 66), key=lambda y: dark(y, 44, 65))
    return {'file': path.split('/')[-1], 'eye_y': eye_y, 'eye_l': centre(38, 54), 'eye_r': centre(55, 70), 'nose_y': nose_y, 'mouth_y': mouth_y}
for p in sys.argv[1:]: print(marks(p))
