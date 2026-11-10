/**
 * Colours of the map (M.1). Our own palette in the spirit of CK3 (D-469): muted terrain colours close up, a parchment
 * "paper map" from afar, ink-brown lines. No colour or texture is taken from the game.
 */

/** Terrain colours, by the kinds of `tools/map-build.ts` (`TERRAINS`). */
export const TERRAIN_COLOR: Record<string, string> = {
  deep_sea: '#2b465c',
  sea: '#355670',
  shallows: '#466b82',
  lake: '#4f7790',
  plains: '#9caa69',
  farmlands: '#b7b26a',
  floodplains: '#8fac66',
  drylands: '#c4ad73',
  steppe: '#b4ab72',
  desert: '#d6c18b',
  forest: '#5c7440',
  taiga: '#526650',
  jungle: '#3d6338',
  wetlands: '#6d7c58',
  tundra: '#a8a891',
  hills: '#a08f60',
  mountains: '#8c8476',
  peaks: '#c9c6bf',
  glacier: '#e7ebea',
};

/** The paper map from afar: parchment land, faded sea, ink. */
export const PAPER = {
  land: '#e6d6b4',
  landShade: '#cdb98f',
  sea: '#9fb3ae',
  seaDeep: '#8ea6a2',
  ink: '#4b3a28',
  inkSoft: 'rgba(75, 58, 40, 0.55)',
  ripple: 'rgba(60, 78, 74, 0.35)',
};

/** Lines and marks close up. */
export const INK = {
  coast: 'rgba(32, 40, 44, 0.85)',
  ripple: 'rgba(200, 220, 225, 0.22)',
  province: 'rgba(40, 32, 22, 0.35)',
  realm: 'rgba(30, 22, 14, 0.9)',
  river: '#4f7d97',
  road: 'rgba(92, 64, 36, 0.85)',
  trail: 'rgba(92, 64, 36, 0.6)',
  sea: 'rgba(225, 235, 238, 0.55)',
  label: '#2a2017',
  labelHalo: 'rgba(240, 230, 205, 0.85)',
  seaLabel: 'rgba(220, 232, 236, 0.9)',
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** `a` mixed with `b` by `t` (0 → a, 1 → b), as a hex colour. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x + (y - x) * t))).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** A colour made lighter (amount > 0) or darker (amount < 0), amount in −1…1. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount);
}
