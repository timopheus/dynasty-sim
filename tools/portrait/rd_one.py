"""One Retro Diffusion generation for the reference person, with a cost check first and a provenance log.

Usage: python3 -I tools/portrait/rd_one.py <out.png> <seed> <max_cost> <prompt-file> [style]
The API key is added by the session's network secret (header X-RD-Token); it is never read here.
"""
import base64, datetime, json, sys, time, urllib.request, uuid

API = 'https://api.retrodiffusion.ai/v2/inferences'
PALETTE = 'docs/reference/portrait/palette-ink-paper-large.png'


def call(url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', **(headers or {})})
    return json.load(urllib.request.urlopen(req, timeout=120))


out, seed, max_cost, prompt_file = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
style = sys.argv[5] if len(sys.argv) > 5 else 'rd_fast__portrait'
prompt = open(prompt_file).read().strip()
body = {'prompt': prompt, 'prompt_style': style, 'width': 64, 'height': 80, 'num_images': 1, 'seed': seed,
        'remove_bg': True, 'input_palette': base64.b64encode(open(PALETTE, 'rb').read()).decode()}
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
    open(out, 'wb').write(base64.b64decode(res['base64_images'][0]))
    log = {'when': datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds'), 'file': out, 'style': style, 'seed': seed,
           'remove_bg': True, 'cost': res.get('balance_cost'), 'balance': res.get('remaining_balance'), 'task': task['task_id'], 'prompt': prompt}
    open('docs/samples/portrait/reference/provenance.jsonl', 'a').write(json.dumps(log, ensure_ascii=False) + '\n')
    print(log)
    break
