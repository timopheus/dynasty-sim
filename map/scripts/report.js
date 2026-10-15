(() => {
  const n = pack.cells.i.length, c = pack.cells;
  return pack.states.filter(s=>s.i&&!s.removed).map(s=>{ const bs=pack.burgs.filter(b=>b.i&&!b.removed&&b.state===s.i);
    return `${s.i} ${s.fullName||s.name} [${pack.cultures[s.culture]?.name}] prov=${pack.provinces.filter(p=>p.i&&!p.removed&&p.state===s.i).length} burgs=${bs.length}\n  cap: ${pack.burgs[s.capital]?.name}#${s.capital} port=${pack.burgs[s.capital]?.port||0}\n  cities: ${bs.filter(b=>b.group==='city'||b.group==='capital').map(b=>`${b.name}#${b.i}${b.port?'⚓':''}(${b.x|0},${b.y|0}) ${b.population.toFixed(0)}`).join(', ')}\n  ports: ${bs.filter(b=>b.port&&b.group!=='city'&&b.group!=='capital').map(b=>`${b.name}#${b.i}(${b.x|0},${b.y|0}) ${b.population.toFixed(0)} ${b.group}`).join(', ')}`;}).join('\n')
    + `\nTOTAL provinces=${pack.provinces.filter(p=>p.i&&!p.removed).length} burgs=${pack.burgs.filter(b=>b.i&&!b.removed).length} cities=${pack.burgs.filter(b=>b.i&&!b.removed&&(b.group==='city'||b.group==='capital')).length}`;
})()
