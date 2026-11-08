import type { Point } from './data';

/**
 * The view of the map (M.1): the point of the map at the centre of the screen and the zoom, in screen pixels per map
 * unit. Pure: the view module moves it and redraws.
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Zoom bounds: from the whole region on the screen to a town filling a good part of it. */
export function zoomBounds(view: Viewport, mapWidth: number, mapHeight: number): { min: number; max: number } {
  const fit = Math.min(view.width / mapWidth, view.height / mapHeight);
  return { min: fit * 0.95, max: Math.max(fit * 14, 8) };
}

export function toScreen(cam: Camera, view: Viewport, p: Point): Point {
  return { x: (p.x - cam.x) * cam.zoom + view.width / 2, y: (p.y - cam.y) * cam.zoom + view.height / 2 };
}

export function toMap(cam: Camera, view: Viewport, p: Point): Point {
  return { x: (p.x - view.width / 2) / cam.zoom + cam.x, y: (p.y - view.height / 2) / cam.zoom + cam.y };
}

/** Keeps the centre over the map, with a margin of half a screen of sea at most. */
export function clamp(cam: Camera, view: Viewport, mapWidth: number, mapHeight: number): Camera {
  const { min, max } = zoomBounds(view, mapWidth, mapHeight);
  const zoom = Math.min(max, Math.max(min, cam.zoom));
  const halfW = view.width / 2 / zoom, halfH = view.height / 2 / zoom;
  const fitX = (x: number) => (halfW * 2 >= mapWidth ? mapWidth / 2 : Math.min(mapWidth - halfW * 0.6, Math.max(halfW * 0.6, x)));
  const fitY = (y: number) => (halfH * 2 >= mapHeight ? mapHeight / 2 : Math.min(mapHeight - halfH * 0.6, Math.max(halfH * 0.6, y)));
  return { x: fitX(cam.x), y: fitY(cam.y), zoom };
}

/** Zoom by a factor around a screen point: the point of the map under the cursor stays under it (CK3). */
export function zoomAt(cam: Camera, view: Viewport, at: Point, factor: number): Camera {
  const before = toMap(cam, view, at);
  const zoom = cam.zoom * factor;
  return { zoom, x: before.x - (at.x - view.width / 2) / zoom, y: before.y - (at.y - view.height / 2) / zoom };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

/** The part of the map on the screen, with a margin. */
export function visibleBox(cam: Camera, view: Viewport, margin = 0): { x0: number; y0: number; x1: number; y1: number } {
  const halfW = view.width / 2 / cam.zoom + margin, halfH = view.height / 2 / cam.zoom + margin;
  return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
}
