import type { FaceSpec } from '../../core/looks';
import { portraitGrid } from './draw';
import { INK, LIGHT, type Grid } from './grid';

/** The two paints (D-300): warm parchment and brown-black ink; the page shows through empty pixels. */
export const PAINTS = { light: '#e9d6a6', ink: '#2a1a10' } as const;

/** One path per paint, a run of pixels per segment: a small string, crisp at any scale. */
function runs(g: Grid, paint: number): string {
  let d = '';
  for (let y = 0; y < g.height; y++) {
    let x = 0;
    while (x < g.width) {
      if (g.pixels[y * g.width + x] !== paint) { x++; continue; }
      const start = x;
      while (x < g.width && g.pixels[y * g.width + x] === paint) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

/** SVG markup of a grid; `label` is the text for screen readers (D-248). Every character in it is escaped. */
export function gridSvg(g: Grid, label: string, scale = 4): string {
  const text = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" width="${g.width * scale}" height="${g.height * scale}" shape-rendering="crispEdges" role="img" aria-label="${text}">`
    + `<title>${text}</title>`
    + `<path fill="${PAINTS.light}" d="${runs(g, LIGHT)}"/>`
    + `<path fill="${PAINTS.ink}" d="${runs(g, INK)}"/>`
    + '</svg>';
}

export function portraitSvg(spec: FaceSpec, label: string, scale = 4): string {
  return gridSvg(portraitGrid(spec), label, scale);
}
