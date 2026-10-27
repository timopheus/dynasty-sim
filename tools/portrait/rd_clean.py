"""Free Retro Diffusion pixel correction (removes isolated artifacts). Usage: rd_clean.py <in.png> <out.png>"""
import base64, json, sys, urllib.request
src, out = sys.argv[1], sys.argv[2]
url = 'https://api.retrodiffusion.ai/v2/edit/tools/pixel_correction'
body = {'input_image': base64.b64encode(open(src, 'rb').read()).decode()}
est = json.load(urllib.request.urlopen(urllib.request.Request(url + '/estimate', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=60))
if est.get('balance_cost', 1) != 0:
    sys.exit(f'refused: not free {est}')
r = json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=120))
img = r.get('outputImageBase64') or r.get('base64_image')
if not img:
    sys.exit(f'no image in {list(r)}')
open(out, 'wb').write(base64.b64decode(img.split(',')[-1]))
print('cleaned', {k: r.get(k) for k in ('balance_cost', 'charged', 'remaining_balance')})
