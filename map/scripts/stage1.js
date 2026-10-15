// runs in page: cultures -> burgs -> provinces
(() => {
  Math.random = aleaPRNG('dynasty-sim-343');
  const n = pack.cells.i.length, c = pack.cells;
  const sid = name => pack.states.find(s => s.name === name).i;
  const cid = name => pack.cultures.find(x => x.name === name && !x.removed).i;
  const V = sid('Venteren'), K = sid('Kohtakia'), M = sid('Malegovia'), O = sid('Ogenesia'), P = sid('Phais');
  const landOf = (st, cul) => { const r = []; for (let i = 0; i < n; i++) if (c.h[i] >= 20 && c.state[i] === st && (cul == null || c.culture[i] === cul)) r.push(i); return r; };
  // Haverland: Venteren lands -> Portuzian culture renamed, German names
  const hav = cid('Portuzian');
  Cultures.setCells(cid('Romian'), landOf(M, hav));
  Cultures.setCells(hav, landOf(V).filter(i => c.culture[i] !== 0));
  Cultures.rename(hav, 'Haverish'); Cultures.setBase(hav, 0);
  // Aurenne: Soumi -> French
  const aur = cid('Soumi'); Cultures.rename(aur, 'Aurennese'); Cultures.setBase(aur, 2);
  // Borea: Romian + Astellian -> Ruthenian
  const bor1 = cid('Romian'), bor2 = cid('Astellian');
  // Izmara: Norse -> Turkish; Romian cells inside Ogenesia -> new Levantine community
  const izm = cid('Norse'); Cultures.rename(izm, 'Izmari'); Cultures.setBase(izm, 16);
  const ogRom = landOf(O, bor1);
  const [cx, cy] = c.p[ogRom[Math.floor(ogRom.length / 2)]];
  const lev = Cultures.add(cx, cy); Cultures.setCells(lev, ogRom); Cultures.rename(lev, 'Levantine'); Cultures.setBase(lev, 42);
  Cultures.rename(bor1, 'Borean'); Cultures.setBase(bor1, 5);
  Cultures.rename(bor2, 'Northern Borean'); Cultures.setBase(bor2, 5);
  // minors: Ticumiegia stays Tallian (Italian); Byblia Elladan (Greek); Phais -> Vengrian (Hungarian)
  const hun = cid('Vengrian'); Cultures.setCells(hun, landOf(P).filter(i => c.culture[i] !== 0));
  // states' dominant culture
  States.setCulture(V, hav); States.setCulture(K, aur); States.setCulture(M, bor1); States.setCulture(O, izm); States.setCulture(P, hun);
  Burgs.regenerate();
  Provinces.regenerate();
  Layers.draw('cultures', 'burgIcons', 'labels', 'routes', 'borders', 'provinces', 'states');
  return 'ok';
})()
