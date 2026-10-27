"""Run a free Retro Diffusion edit tool. Usage: rd_edit.py <tool_id> <in.png> <out.png> [key=value ...]
Values: 'palette' = our ink-paper palette image; numbers are sent as ints. Refuses any tool that is not free."""
import base64, json, sys, urllib.request
tool, src, out = sys.argv[1:4]
body = {'input_image': base64.b64encode(open(src, 'rb').read()).decode()}
for kv in sys.argv[4:]:
    k, v = kv.split('=', 1)
    body[k] = base64.b64encode(open('docs/reference/portrait/palette-ink-paper-large.png', 'rb').read()).decode() if v == 'palette' else int(v) if v.isdigit() else v
url = f'https://api.retrodiffusion.ai/v2/edit/tools/{tool}'
post = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=120))
est = post(url + '/estimate')
if est.get('balance_cost', 1) != 0:
    sys.exit(f'refused: not free {est}')
r = post(url)
open(out, 'wb').write(base64.b64decode(r['outputImageBase64'].split(',')[-1]))
print(tool, 'charged:', r.get('charged'), 'balance:', r.get('remaining_balance'))
