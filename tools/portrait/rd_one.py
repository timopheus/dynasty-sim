"""One Retro Diffusion generation for the reference person, with a cost check first and a provenance log.

Usage: python3 -I tools/portrait/rd_one.py <out.png> <seed> <max_cost> <prompt-file> [style] [WxH] [pre]
'pre' also saves the image before the palette was applied as <out>-pre.png.
The API key is added by the session's network secret (header X-RD-Token); it is never read here.
"""
import base64, datetime, json, sys, time, urllib.request, uuid

API = 'https://api.retrodiffusion.ai/v2/inferences'
import os
PALETTE = os.environ.get('RD_PALETTE', 'docs/reference/portrait/palette-ink-paper-large.png')


def call(url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', **(headers or {})})
    return json.load(urllib.request.urlopen(req, timeout=120))


out, seed, max_cost, prompt_file = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
style = sys.argv[5] if len(sys.argv) > 5 else 'rd_fast__portrait'
w, h = map(int, (sys.argv[6] if len(sys.argv) > 6 else '64x80').split('x'))
pre = len(sys.argv) > 7 and sys.argv[7] == 'pre'
# img2img: RD_INPUT=<png> RD_STRENGTH=<0..1> in the environment lay a picture under the generation
import os
src_in, strength = os.environ.get('RD_INPUT'), float(os.environ.get('RD_STRENGTH', '0.45'))
prompt = open(prompt_file).read().strip()
body = {'prompt': prompt, 'prompt_style': style, 'width': w, 'height': h, 'num_images': 1, 'seed': seed,
        'remove_bg': True, **({'return_pre_palette': True} if pre else {}), 'input_palette': base64.b64encode(open(PALETTE, 'rb').read()).decode()}
if src_in:
    from PIL import Image
    import io
    b = Image.open(src_in).convert('RGBA'); flat = Image.new('RGB', b.size, (0x34, 0x2b, 0x23)); flat.paste(b, mask=b.split()[3])
    buf = io.BytesIO(); flat.save(buf, 'PNG')
    body.update(input_image=base64.b64encode(buf.getvalue()).decode(), strength=strength)
cost = call(API, {**body, 'check_cost': True})
if cost['balance_cost'] > max_cost or cost['remaining_balance'] < cost['balance_cost']:
    sys.exit(f'refused: cost {cost["balance_cost"]}, balance {cost["remaining_balance"]}, limit {max_cost}')
task = call(API, body, {'Idempotency-Key': str(uuid.uuid4())})
for _ in range(100):
    t = call(f'{API}/tasks/{task["task_id"]}')
    if t['status'] in ('pending', 'running'):
        time.sleep(3); continue
    if t['status'] != 'succeeded':
        sys.exit(f'failed: {t}')
    res = t['result']
    imgs = res['base64_images']
    open(out, 'wb').write(base64.b64decode(imgs[0]))
    for i, extra in enumerate(imgs[1:]):
        open(out.replace('.png', f'-extra{i}.png'), 'wb').write(base64.b64decode(extra))
    print('images returned:', len(imgs), 'keys:', [k for k in res if 'image' in k or 'pre' in k])
    log = {'when': datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds'), 'file': out, 'style': style, 'seed': seed,
           'remove_bg': True, 'size': f'{w}x{h}', 'pre_palette': pre, 'input': src_in, 'strength': strength if src_in else None, 'cost': res.get('balance_cost'), 'balance': res.get('remaining_balance'), 'task': task['task_id'], 'prompt': prompt}
    open(os.environ.get('RD_LOG', 'docs/samples/portrait/reference/provenance.jsonl'), 'a').write(json.dumps(log, ensure_ascii=False) + '\n')
    print(log)
    break
