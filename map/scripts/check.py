import json,sys
from collections import defaultdict,deque
d=json.load(open(sys.argv[1])); P=d['pack']; C=P['cells'] if isinstance(P['cells'],list) else P['cells']['cells']
ok=lambda x: isinstance(x,dict) and x.get('i') and not x.get('removed')
prov=[p for p in P['provinces'] if ok(p)]; bu=[b for b in P['burgs'] if ok(b)]
feat={f['i']:f for f in P['features'] if isinstance(f,dict)}
def comps(cells):
    s=set(cells); seen=set(); n=0
    for c0 in cells:
        if c0 in seen: continue
        n+=1; q=deque([c0]); seen.add(c0)
        while q:
            i=q.popleft()
            for j in C[i]['c']:
                if j in s and j not in seen: seen.add(j); q.append(j)
    return n
pc=defaultdict(list)
for c in C:
    if c['h']>=20 and c['province']: pc[c['province']].append(c['i'])
print('provinces',len(prov),'without burg',[p['name'] for p in prov if not p.get('burg')])
print('tiny(<8)',[(p['name'],len(pc[p['i']])) for p in prov if len(pc[p['i']])<8])
frag=[(p['name'],comps(pc[p['i']])) for p in prov if comps(pc[p['i']])>1]
print('fragmented',len(frag),frag)
for z in P['zones']:
    if z.get('removed'): continue
    print('zone',z['name'],z['type'],len(z['cells']),'parts',comps(z['cells']),'features',sorted({C[i]['f'] for i in z['cells']}))
water=set()
for z in P['zones']: water|=set(z['cells'])
oc=[c['i'] for c in C if c['h']<20 and feat.get(c['f'],{}).get('type')=='ocean']
print('ocean cells not in a zone',len([i for i in oc if i not in water]))
st={s['i']:s for s in P['states'] if ok(s)}
for s in st.values():
    b=P['burgs'][s['capital']]; sea=any(C[j]['h']<20 and feat[C[j]['f']]['type']=='ocean' for j in C[b['cell']]['c'])
    print('capital',s['name'],b['name'],'sea-coast' if sea else 'NOT on sea', round(b['population']*2000))
print('cities',sum(b.get('group') in ('city','capital') for b in bu),'land without state',sum(1 for c in C if c['h']>=20 and not c['state']))
