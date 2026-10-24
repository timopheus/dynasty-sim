"""One Retro Diffusion inpainting on the reference base, with a cost check and a provenance log.
Usage: python3 -I tools/portrait/rd_inpaint.py <base.png> <mask.png> <prompt-file> <seed> <max_cost> <out.png> [outside]
'outside' lets the mask paint beyond the figure (a hat wider than the head): the base is laid on pure green, which is
not in our palette, and in the result green pixels stay transparent while anything else becomes part of the figure.
The base is flattened onto the game background (the tool takes no transparency); the base's own alpha is put back
after, and pixels outside the mask are copied back from the base, so nothing outside the mask can change."""
import base64, datetime, io, json, sys, urllib.request
from PIL import Image

PALETTE = ['#1c130e', '#342b23', '#4c4237', '#645a4c', '#7c7161', '#948975', '#aca08a', '#c4b89f', '#dccfb3', '#f4e7c8']
RGB = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE]

src, mask_p, prompt_f, seed, max_cost, out = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
base = Image.open(src).convert('RGBA'); mask = Image.open(mask_p).convert('RGBA'); W, H = base.size
outside = len(sys.argv) > 7 and sys.argv[7] == 'outside'
flat = Image.new('RGB', (W, H), (0, 255, 0) if outside else (0x34, 0x2b, 0x23)); flat.paste(base, mask=base.split()[3])
buf = io.BytesIO(); flat.save(buf, 'PNG')
prompt = open(prompt_f).read().strip()
body = {'input_image': base64.b64encode(buf.getvalue()).decode(), 'mask_image': base64.b64encode(open(mask_p, 'rb').read()).decode(),
        'prompt': prompt, 'seed': seed, 'soft_inpaint': False}
url = 'https://api.retrodiffusion.ai/v2/edit/tools/inpainting'
post = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=180))
before = json.load(urllib.request.urlopen('https://api.retrodiffusion.ai/v2/inferences/credits', timeout=30))
est = post(url + '/estimate')
if est['balance_cost'] > max_cost:
    sys.exit(f'refused: {est["balance_cost"]} > {max_cost}')
# queued, then polled: a long synchronous call can be cut by the gateway (502) after the charge
import time
task = post(url + '/tasks')
tid = task.get('task_id') or task.get('taskId')
for _ in range(120):
    r = json.load(urllib.request.urlopen(f'https://api.retrodiffusion.ai/v2/edit/tasks/{tid}', timeout=60))
    if r.get('status') in ('pending', 'running', 'queued'):
        time.sleep(5); continue
    break
if r.get('status') != 'succeeded':
    sys.exit(f'failed: {r}')
r = r.get('result', r)
img = r.get('outputImageBase64') or r.get('output_image_base64')
if not img:
    url0 = (r.get('outputImageUrl') or (r.get('output_urls') or [None])[0])
    img = base64.b64encode(urllib.request.urlopen(url0, timeout=60).read()).decode()
res = Image.open(io.BytesIO(base64.b64decode(img.split(',')[-1]))).convert('RGBA')
if res.size != (W, H):
    sys.exit(f'unexpected size {res.size}')
final = base.copy()
for y in range(H):
    for x in range(W):
        inside = base.getpixel((x, y))[3] >= 128
        if mask.getpixel((x, y))[3] > 12 and (inside or outside):
            c = res.getpixel((x, y))[:3]
            if not inside and c[1] > 150 and c[0] < 120 and c[2] < 120:
                continue  # still background: stays transparent
            if c not in RGB:  # the tool takes no palette: snap to the nearest of ours
                c = min(RGB, key=lambda q: sum((a - b) ** 2 for a, b in zip(q, c)))
            final.putpixel((x, y), c + (255,))
final.save(out); res.save(out.replace('.png', '-raw.png'))
after = json.load(urllib.request.urlopen('https://api.retrodiffusion.ai/v2/inferences/credits', timeout=30))
log = {'when': datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds'), 'tool': 'inpainting', 'file': out, 'mask': mask_p, 'seed': seed,
       'task': tid, 'charged': r.get('charged'), 'balance_cost': r.get('balance_cost'), 'before': before, 'after': after, 'prompt': prompt}
open('docs/samples/portrait/reference/provenance.jsonl', 'a').write(json.dumps(log, ensure_ascii=False) + '\n')
print({k: v for k, v in log.items() if k != 'prompt'})
