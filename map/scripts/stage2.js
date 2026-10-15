(() => {
  const c = pack.cells;
  const st = name => pack.states.find(s => s.name === name).i;
  const H = st('Venteren'), A = st('Kohtakia'), B = st('Malegovia'), I = st('Ogenesia'), P = st('Phais');
  const BY = st('Byblia'), T = st('Ticumiegia');
  const alive = s => pack.burgs.filter(b => b.i && !b.removed && b.state === s);
  const MAIN_SEA = 6;
  const seaCoast = i => c.h[i] >= 20 && c.c[i].some(j => c.h[j] < 20 && c.f[j] === MAIN_SEA);
  const nearestCoast = (s, x, y) => { let best = -1, bd = Infinity; for (const i of c.i) if (c.state[i] === s && !c.burg[i] && seaCoast(i)) { const d = Math.hypot(c.p[i][0] - x, c.p[i][1] - y); if (d < bd) { bd = d; best = i; } } return c.p[best]; };
  const good = nm => nm.length <= 10 && !/(.)\1\1/.test(nm) && !/(..).*\1.*\1/.test(nm);
  const cultureName = cul => { let nm = ''; for (let k = 0; k < 20; k++) { nm = Names.getCulture(cul); if (good(nm)) break; } return nm; };
  // 0. Izmara holds the whole south shore of the strait; neutral land goes to the nearest state
  { const give = []; for (const i of c.i) { const [x, y] = c.p[i]; if (c.h[i] >= 20 && c.state[i] === H && (y > 500 || (x > 180 && y > 430))) give.push(i); }
    States.setCells(I, give); }
  { const owner = Array.from(c.state); let queue = []; for (const i of c.i) if (c.h[i] >= 20 && owner[i]) queue.push(i);
    while (queue.length) { const next = []; for (const i of queue) for (const j of c.c[i]) if (c.h[j] >= 20 && !owner[j]) { owner[j] = owner[i]; next.push(j); } queue = next; }
    const by = {}; for (const i of c.i) if (c.h[i] >= 20 && !c.state[i] && owner[i]) (by[owner[i]] ||= []).push(i);
    for (const [s, cells] of Object.entries(by)) States.setCells(+s, cells); }
  // 1. capitals: sea ports on the main sea for Haverland, Borea, Izmara
  const valmont = pack.states[A].capital;
  const kostrograd = alive(B).filter(b => !b.port && !b.capital && b.y < 250).sort((a, b) => b.population - a.population)[0].i;
  const seaCapital = (s, x, y) => { const [px, py] = nearestCoast(s, x, y); const id = Burgs.add(px, py); Burgs.setPort(id, true); Burgs.setCapital(id); return id; };
  const ostmere = seaCapital(H, 129, 318), novomor = seaCapital(B, 1350, 480), sar = seaCapital(I, 290, 563);
  // 2. culture-fitting names for every other burg
  const fixed = new Set([ostmere, valmont, novomor, kostrograd, sar]);
  for (const b of pack.burgs) if (b.i && !b.removed && b.state && !fixed.has(b.i)) Burgs.rename(b.i, cultureName(b.culture));
  // 3. provinces from scratch; each gets a center burg; tiny ones join a neighbour of the same state
  Provinces.regenerate();
  const live = () => pack.provinces.filter(p => p && p.i && !p.removed);
  const cellsOf = p => { const r = []; for (const i of c.i) if (c.province[i] === p.i) r.push(i); return r; };
  for (const p of live()) { const cs = cellsOf(p); if (cs.length >= 8) continue;
    const nb = new Map(); for (const i of cs) for (const j of c.c[i]) { const q = c.province[j]; if (q && q !== p.i && pack.provinces[q].state === p.state) nb.set(q, (nb.get(q) || 0) + 1); }
    let target = [...nb.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!target) { const [x, y] = c.p[cs[0]]; target = live().filter(q => q.i !== p.i && q.state === p.state).sort((a, b) => Math.hypot(c.p[a.center][0] - x, c.p[a.center][1] - y) - Math.hypot(c.p[b.center][0] - x, c.p[b.center][1] - y))[0]?.i; }
    if (target) Provinces.merge(target, [p.i]); }
  // detached land pieces of a province go to the neighbouring province of the same state they touch most
  for (let pass = 0; pass < 3; pass++) for (const p of live()) {
    const own = new Set(cellsOf(p).filter(i => c.h[i] >= 20)); const seen = new Set(); const parts = [];
    for (const s0 of own) { if (seen.has(s0)) continue; const part = [s0]; seen.add(s0);
      for (let k = 0; k < part.length; k++) for (const j of c.c[part[k]]) if (own.has(j) && !seen.has(j)) { seen.add(j); part.push(j); } parts.push(part); }
    if (parts.length < 2) continue;
    const keep = parts.find(part => part.includes(p.center)) || parts.sort((a, b) => b.length - a.length)[0];
    for (const part of parts) { if (part === keep) continue;
      const nb = new Map(); for (const i of part) for (const j of c.c[i]) { const q = c.province[j]; if (c.h[j] >= 20 && q && q !== p.i && pack.provinces[q].state === p.state) nb.set(q, (nb.get(q) || 0) + 1); }
      const target = [...nb.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (target && !part.some(i => c.burg[i] && pack.burgs[c.burg[i]].i === p.burg)) Provinces.setCells(target, part); }
  }
  for (const p of live()) { const cs = cellsOf(p); if (cs.length >= 8) continue;
    const nb = new Map(); for (const i of cs) for (const j of c.c[i]) { const q = c.province[j]; if (q && q !== p.i && pack.provinces[q].state === p.state) nb.set(q, (nb.get(q) || 0) + 1); }
    let target = [...nb.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!target) { const [x, y] = c.p[cs[0]]; target = live().filter(q => q.i !== p.i && q.state === p.state).sort((a, b) => Math.hypot(c.p[a.center][0] - x, c.p[a.center][1] - y) - Math.hypot(c.p[b.center][0] - x, c.p[b.center][1] - y))[0]?.i; }
    if (target) Provinces.merge(target, [p.i]); }
  for (const p of live()) if (!p.burg || pack.burgs[p.burg].removed) {
    const cs = cellsOf(p).filter(i => !c.burg[i]); if (!cs.length) continue;
    const mx = cs.reduce((s, i) => s + c.p[i][0], 0) / cs.length, my = cs.reduce((s, i) => s + c.p[i][1], 0) / cs.length;
    const cell = cs.sort((a, b) => (c.pop[b] - c.pop[a]) * 0.02 + Math.hypot(c.p[a][0] - mx, c.p[a][1] - my) - Math.hypot(c.p[b][0] - mx, c.p[b][1] - my))[0];
    const id = Burgs.add(c.p[cell][0], c.p[cell][1]); Burgs.rename(id, cultureName(pack.burgs[id].culture)); Provinces.setCapital(p.i, id);
  }
  // 4. states
  const setState = (id, name, form, full) => { States.rename(id, name); States.setForm(id, form); States.setFullName(id, full); };
  setState(H, 'Haverland', 'Republic', 'Free Provinces of Haverland');
  setState(A, 'Aurenne', 'Kingdom', 'Kingdom of Aurenne');
  setState(B, 'Borea', 'Empire', 'Borean Empire');
  setState(I, 'Izmara', 'Sultanate', 'Sultanate of Izmara');
  let phais = ''; for (let k = 0; k < 20; k++) { phais = Names.getState(Names.getCultureShort(pack.states[P].culture), pack.states[P].culture); if (phais.length <= 9 && good(phais)) break; }
  States.rename(P, phais); States.setFullName(P, `Principality of ${phais}`);
  // 5. capital names and sizes
  Burgs.rename(ostmere, 'Ostmere'); Burgs.setPopulation(ostmere, 120000);
  Burgs.rename(valmont, 'Valmont'); Burgs.setPopulation(valmont, 180000);
  Burgs.rename(novomor, 'Novomor'); Burgs.setPopulation(novomor, 35000);
  Burgs.rename(kostrograd, 'Kostrograd'); Burgs.setPopulation(kostrograd, 90000);
  Burgs.rename(sar, 'Sarayhan'); Burgs.setPopulation(sar, 220000);
  // 6. cities: Haverland 3, Aurenne 3, Borea 5, Izmara 5, Byblia 2, Ticumiegia 1, Phais 1
  const cities = new Set([ostmere, valmont, novomor, kostrograd, sar, pack.states[BY].capital, pack.states[T].capital, pack.states[P].capital]);
  const top = (s, k) => alive(s).filter(b => !cities.has(b.i)).sort((a, b) => b.population - a.population).slice(0, k).forEach(b => cities.add(b.i));
  top(H, 2); top(A, 2); top(B, 3); top(I, 4); top(BY, 1);
  for (const b of pack.burgs) if (b.i && !b.removed && !b.capital) {
    if (cities.has(b.i)) Burgs.setGroup(b.i, 'city'); else if (b.group === 'city') Burgs.setGroup(b.i, 'town');
  }
  // 7. roads, trails and sea routes again: the capitals added above must be on them
  for (const b of pack.burgs) if (b.i && !b.removed && !b.port && pack.features[c.f[b.cell]].group !== 'continent' && c.t[b.cell] === 1) Burgs.setPort(b.i, true); // island towns need a harbour
  Routes.regenerate();
  // 8. sea zones: connected regions of the main sea grown from four seeds; bays of the off-map northern sea apart
  for (const z of [...pack.zones]) if (z && !z.removed) Zones.remove(z.i);
  const seeds = { 'Western Ocean': [10, 560], 'The Strait': [230, 470], 'Inner Sea (west)': [620, 380], 'Inner Sea (east)': [1060, 470] };
  const zoneOf = new Map(); let queue = [];
  for (const [name, [x, y]] of Object.entries(seeds)) { let best = -1, bd = Infinity; for (const i of c.i) if (c.f[i] === MAIN_SEA) { const d = Math.hypot(c.p[i][0] - x, c.p[i][1] - y); if (d < bd) { bd = d; best = i; } } zoneOf.set(best, name); queue.push(best); }
  while (queue.length) { const next = []; for (const i of queue) for (const j of c.c[i]) if (c.f[j] === MAIN_SEA && !zoneOf.has(j)) { zoneOf.set(j, zoneOf.get(i)); next.push(j); } queue = next; }
  const zones = { 'Western Ocean': [], 'The Strait': [], 'Inner Sea (west)': [], 'Inner Sea (east)': [], 'Northern Sea': [] };
  for (const [i, name] of zoneOf) zones[name].push(i);
  for (const i of c.i) { const f = pack.features[c.f[i]]; if (f && f.type === 'ocean' && c.f[i] !== MAIN_SEA) zones['Northern Sea'].push(i); }
  for (const [name, cells] of Object.entries(zones)) Zones.add(name, 'Sea', cells);
  Layers.draw('states', 'borders', 'provinces', 'labels', 'burgIcons', 'routes', 'emblems', 'zones');
  const riverPorts = pack.burgs.filter(b => b.i && !b.removed && b.port && !c.c[b.cell].some(j => c.h[j] < 20 && pack.features[c.f[j]].type === 'ocean')).map(b => b.name);
  return `phais=${phais} riverPorts=${riverPorts.length}: ${riverPorts.join(', ')}`;
})()
