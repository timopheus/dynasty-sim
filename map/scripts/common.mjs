import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
export const pins = { mapWidth:1600, mapHeight:900, points:4, template:'mediterranean', statesNumber:7, provincesRatio:26,
  manors:120, religionsNumber:4, cultures:8, culturesSet:'european', sizeVariety:4, growthRate:1.5,
  distanceUnit:'km', distanceScale:1.25, populationRate:500, urbanization:4 };
export async function open(seed) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(p => { try { if (!sessionStorage.getItem('pinned')) { localStorage.setItem('fmg-locks', JSON.stringify(p)); sessionStorage.setItem('pinned','1'); } } catch {} }, pins);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(`http://localhost:5199/Fantasy-Map-Generator/?seed=${seed}&width=1600&height=900&preset=political`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.pack?.burgs?.length > 1 && window.pack.provinces?.length > 1, null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  return { b, p };
}
