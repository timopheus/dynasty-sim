import type { FaceSpec } from '../../core/looks';
import { portraitText } from './describe';
import { portraitGrid } from './draw';
import { gridRgba } from './paint';

/** The last portrait drawn: the screen is redrawn after every command, the face changes much less often. */
let last: { key: string; data: Uint8ClampedArray; width: number; height: number } | null = null;

/** A canvas with the portrait; the picture is described in words for screen readers (D-248). */
export function portraitCanvas(spec: FaceSpec): HTMLCanvasElement {
  const key = JSON.stringify(spec);
  if (last?.key !== key) {
    const grid = portraitGrid(spec);
    last = { key, data: gridRgba(grid), width: grid.width, height: grid.height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = last.width;
  canvas.height = last.height;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', portraitText(spec));
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(last.data), last.width, last.height), 0, 0);
  return canvas;
}
