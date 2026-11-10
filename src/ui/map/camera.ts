import type { Point } from './model';

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

/** How much of the window the panels cover on each side, in pixels: the map centres things in the rest. */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

/** How far past its edge the map may go into the free part of the screen, as a share of half of that part. */
const PAST_EDGE = 0.5;

/** The point of the map at the middle of the free part of the screen (the part no panel covers). */
export function freeCentre(cam: Camera, insets: Insets): Point {
  return { x: cam.x + (insets.left - insets.right) / 2 / cam.zoom, y: cam.y + (insets.top - insets.bottom) / 2 / cam.zoom };
}

/**
 * Keeps the map in the free part of the screen: any point of the map can be brought into it, even one at the very
 * edge under a panel, and past the edge only a strip of mist shows (`PAST_EDGE`); a map smaller than the free part
 * sits in its middle.
 */
export function clamp(cam: Camera, view: Viewport, mapWidth: number, mapHeight: number, insets: Insets = NO_INSETS): Camera {
  const { min, max } = zoomBounds(view, mapWidth, mapHeight);
  const zoom = Math.min(max, Math.max(min, cam.zoom));
  const halfW = Math.max(1, view.width - insets.left - insets.right) / 2 / zoom;
  const halfH = Math.max(1, view.height - insets.top - insets.bottom) / 2 / zoom;
  const fit = (c: number, half: number, size: number) => {
    const keep = half * (1 - PAST_EDGE);
    return keep * 2 >= size ? size / 2 : Math.min(size - keep, Math.max(keep, c));
  };
  const centre = freeCentre({ ...cam, zoom }, insets);
  const ox = centre.x - cam.x, oy = centre.y - cam.y;
  return { x: fit(centre.x, halfW, mapWidth) - ox, y: fit(centre.y, halfH, mapHeight) - oy, zoom };
}

/** The camera that puts a point of the map at the middle of the free part of the screen. */
export function centreOn(p: Point, zoom: number, insets: Insets): Camera {
  return { x: p.x - (insets.left - insets.right) / 2 / zoom, y: p.y - (insets.top - insets.bottom) / 2 / zoom, zoom };
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
