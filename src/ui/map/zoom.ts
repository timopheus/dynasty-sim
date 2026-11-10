import type { MapMode } from './types';

/** 0 below `from`, 1 above `to`, a straight ramp between. */
export const fade = (z: number, from: number, to: number) => Math.max(0, Math.min(1, (z - from) / (to - from)));

/**
 * How strong the realm names and the province names are at a zoom: they change places at one zoom, crossfading
 * (CK3), never both at more than half; the terrain mode has neither, as CK3's plain terrain map.
 */
export function nameAlphas(zoom: number, mode: MapMode): { realm: number; province: number } {
  if (mode === 'terrain') return { realm: 0, province: 0 };
  return { realm: 1 - fade(zoom, 2.2, 2.8), province: fade(zoom, 2.5, 3.1) * (1 - fade(zoom, 7, 9)) };
}
