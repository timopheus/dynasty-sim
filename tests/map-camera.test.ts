import { describe, expect, it } from 'vitest';
import { centreOn, clamp, freeCentre, toScreen } from '../src/ui/map/camera';
import { partOf, pointOf } from '../src/ui/map/roads';

/** M.1: the camera keeps the map in the part of the screen no panel covers; ways are cut by shares of their length. */
describe('the map camera (M.1)', () => {
  const view = { width: 1440, height: 900 };
  const insets = { left: 352, right: 304, top: 80, bottom: 224 };
  const map = { w: 1600, h: 900 };
  const free = (p: { x: number; y: number }) => p.x >= insets.left && p.x <= view.width - insets.right && p.y >= insets.top && p.y <= view.height - insets.bottom;

  it('brings a place at the very edge of the map into the free part of the screen', () => {
    for (const edge of [{ x: 1.8, y: 122.7 }, { x: 1598, y: 441 }, { x: 239, y: 1 }, { x: 800, y: 899 }]) {
      const cam = clamp(centreOn(edge, 2.2, insets), view, map.w, map.h, insets);
      expect(free(toScreen(cam, view, edge)), `${edge.x},${edge.y}`).toBe(true);
    }
  });

  it('lets no more than half of the free part look past an edge', () => {
    const cam = clamp({ x: -500, y: -500, zoom: 2.2 }, view, map.w, map.h, insets);
    const c = freeCentre(cam, insets);
    const halfW = (view.width - insets.left - insets.right) / 2 / cam.zoom;
    const halfH = (view.height - insets.top - insets.bottom) / 2 / cam.zoom;
    expect(c.x - halfW).toBeCloseTo(-halfW / 2, 5);
    expect(c.y - halfH).toBeCloseTo(-halfH / 2, 5);
  });

  it('centres a point in the free part, not in the window', () => {
    const p = { x: 800, y: 450 };
    const s = toScreen(clamp(centreOn(p, 3, insets), view, map.w, map.h, insets), view, p);
    expect(s.x).toBeCloseTo((insets.left + view.width - insets.right) / 2, 5);
    expect(s.y).toBeCloseTo((insets.top + view.height - insets.bottom) / 2, 5);
  });

  it('cuts a way by shares of its length', () => {
    const way = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pointOf(way, 0.5)).toEqual({ x: 10, y: 0 });
    expect(pointOf(way, 0.25)).toEqual({ x: 5, y: 0 });
    expect(partOf(way, 0.25, 0.75)).toEqual([{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(partOf(way, 0, 1)).toEqual(way);
  });
});
