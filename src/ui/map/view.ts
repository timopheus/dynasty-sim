import { el } from '../dom';
import { withTip } from '../tooltip';
import type { Camera, Viewport } from './camera';
import { clamp, panBy, toMap, toScreen, zoomAt, zoomBounds } from './camera';
import type { Point } from './data';
import { regionModel } from './data';
import type { MapMode, MapOverlay, PlaceMark } from './render';
import { MAP_MODES, MapRenderer } from './render';
import './map.css';

/** What the game tells the map on each draw of the screen (M.1). */
export interface MapProps {
  places: PlaceMark[];
  roads: MapOverlay['roads'];
  hero: Point | null;
  journey: MapOverlay['journey'];
  /** One line about a place for its tip: kind, realm, days away. */
  describe: (id: string) => string;
  /** The travel the hero can make to a place now: the label of the item, or the reason it is grey. */
  travel: (id: string) => { label: string; enabled: boolean; reason: string };
  onOpen: (id: string) => void;
  onTravel: (id: string) => void;
}

const MODE_NAMES: Record<MapMode, { label: string; tip: string }> = {
  realms: { label: 'Realms', tip: 'The realms of the land and their borders.' },
  terrain: { label: 'Terrain', tip: 'Plains, forests, hills and mountains.' },
  cultures: { label: 'Cultures', tip: 'Where each people lives.' },
  faiths: { label: 'Faiths', tip: 'What each land believes.' },
  roads: { label: 'Roads', tip: 'The places you can reach and the days of road between them.' },
};

/** Keys that move the map (CK3: WASD and the arrows), in screen pixels a frame. */
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [1, 0], a: [1, 0], A: [1, 0],
  ArrowRight: [-1, 0], d: [-1, 0], D: [-1, 0],
  ArrowUp: [0, 1], w: [0, 1], W: [0, 1],
  ArrowDown: [0, -1], s: [0, -1], S: [0, -1],
};

export interface MapView {
  element: HTMLElement;
  update: (props: MapProps) => void;
  /** Centres the map on the hero (Home). */
  focusHero: () => void;
  readonly camera: Camera;
  readonly mode: MapMode;
}

let instance: MapView | null = null;

/**
 * The map of the screen, made once and kept across the redraws of the screen: the camera, the mode and the cached
 * drawings live as long as the page. The screen puts `element` where the map goes and calls `update` on each draw.
 */
export function mapView(): MapView {
  if (instance) return instance;
  const model = regionModel();
  const renderer = new MapRenderer(model);
  const canvas = el('canvas', { className: 'map-canvas' });
  canvas.setAttribute('aria-label', 'Map of the region');
  canvas.tabIndex = 0;
  const hotspots = el('div', { className: 'map-hotspots' });
  const menu = el('div', { className: 'map-menu', hidden: true });
  menu.setAttribute('role', 'menu');
  const modes = el('div', { className: 'map-modes', role: 'group' });
  modes.setAttribute('aria-label', 'Map modes');
  const root = el('div', { className: 'map-view' }, canvas, hotspots, modes, menu);

  let props: MapProps | null = null;
  let mode: MapMode = 'realms';
  let view: Viewport = { width: 800, height: 450 };
  let cam: Camera = { x: model.width / 2, y: model.height / 2, zoom: 0.5 };
  let target: Camera = cam;
  let fitted = false;
  let frame = 0;
  let selected: string | null = null;
  let hovered: string | null = null;
  const held = new Set<string>();

  const modeButtons = MAP_MODES.map((m) => {
    const b = el('button', { className: 'map-mode', type: 'button', onclick: () => setMode(m) }, MODE_NAMES[m].label);
    b.setAttribute('data-focus', `map-mode-${m}`);
    b.setAttribute('aria-pressed', String(m === mode));
    withTip(b, { text: MODE_NAMES[m].tip });
    modes.append(b);
    return { m, b };
  });

  function setMode(m: MapMode): void {
    mode = m;
    for (const { m: k, b } of modeButtons) {
      b.classList.toggle('current', k === m);
      b.setAttribute('aria-pressed', String(k === m));
    }
    request();
  }
  setMode(mode);

  function request(): void {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function overlay(): MapOverlay {
    return {
      places: props?.places ?? [],
      roads: props?.roads ?? [],
      hero: props?.hero ?? null,
      journey: props?.journey ?? null,
      selected,
      hovered,
    };
  }

  function draw(): void {
    frame = 0;
    // the camera eases toward its target (a smooth zoom and pan, as in CK3)
    const ease = 0.28;
    const next = {
      x: cam.x + (target.x - cam.x) * ease,
      y: cam.y + (target.y - cam.y) * ease,
      zoom: cam.zoom * Math.pow(target.zoom / cam.zoom, ease),
    };
    const done = Math.abs(next.x - target.x) * next.zoom < 0.3 && Math.abs(next.y - target.y) * next.zoom < 0.3 && Math.abs(next.zoom / target.zoom - 1) < 0.002;
    cam = done ? target : next;
    // keys held down keep the map moving
    if (held.size > 0) {
      let dx = 0, dy = 0;
      for (const k of held) { const v = PAN_KEYS[k]; if (v) { dx += v[0]; dy += v[1]; } }
      target = clamp(panBy(target, dx * 14, dy * 14), view, model.width, model.height);
      cam = clamp(panBy(cam, dx * 14, dy * 14), view, model.width, model.height);
    }
    const ctx = canvas.getContext('2d');
    if (ctx) renderer.draw(ctx, cam, view, window.devicePixelRatio || 1, mode, overlay());
    placeHotspots();
    if (!done || held.size > 0) request();
  }

  function placeHotspots(): void {
    for (const node of hotspots.children) {
      const id = (node as HTMLElement).dataset.place;
      const p = props?.places.find((x) => x.id === id);
      if (!p) continue;
      const s = toScreen(cam, view, p.at);
      const out = s.x < -20 || s.y < -20 || s.x > view.width + 20 || s.y > view.height + 20;
      (node as HTMLElement).style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      (node as HTMLElement).hidden = out;
    }
  }

  function buildHotspots(): void {
    const list = props?.places ?? [];
    const same = hotspots.children.length === list.length && list.every((p, i) => (hotspots.children[i] as HTMLElement | undefined)?.dataset.place === p.id);
    if (!same) {
      hotspots.replaceChildren(...list.map((p) => {
        const b = el('button', { className: 'map-place', type: 'button' }, el('span', { className: 'sr-only' }, p.name));
        b.dataset.place = p.id;
        b.setAttribute('data-focus', `map-place-${p.id}`);
        b.onclick = (e) => { e.stopPropagation(); selected = p.id; closeMenu(); props?.onOpen(p.id); request(); };
        b.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openMenu(p.id, e.clientX, e.clientY); };
        b.onkeydown = (e) => {
          if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            e.preventDefault();
            const r = b.getBoundingClientRect();
            openMenu(p.id, r.right, r.bottom);
          }
        };
        b.onmouseenter = () => { hovered = p.id; request(); };
        b.onmouseleave = () => { if (hovered === p.id) hovered = null; request(); };
        b.onfocus = () => { hovered = p.id; request(); };
        b.onblur = () => { if (hovered === p.id) hovered = null; request(); };
        return b;
      }));
    }
    for (const node of hotspots.children) {
      const id = (node as HTMLElement).dataset.place ?? '';
      const p = list.find((x) => x.id === id);
      if (p && props) withTip(node as HTMLElement, { title: p.name, text: props.describe(id) });
    }
  }

  function openMenu(id: string, clientX: number, clientY: number): void {
    if (!props) return;
    const p = props.places.find((x) => x.id === id);
    if (!p) return;
    const travel = props.travel(id);
    const go = el('button', { className: travel.enabled ? 'menu-item' : 'menu-item grey', type: 'button' }, travel.label);
    go.setAttribute('role', 'menuitem');
    if (travel.enabled) go.onclick = () => { closeMenu(); props?.onTravel(id); };
    else {
      go.setAttribute('aria-disabled', 'true');
      go.append(el('span', { className: 'reason' }, travel.reason));
    }
    const page = el('button', { className: 'menu-item', type: 'button', onclick: () => { closeMenu(); selected = id; props?.onOpen(id); request(); } }, 'Open the page');
    page.setAttribute('role', 'menuitem');
    menu.replaceChildren(el('div', { className: 'map-menu-title' }, p.name), go, page);
    menu.hidden = false;
    const r = root.getBoundingClientRect();
    menu.style.left = `${Math.round(Math.min(clientX - r.left, r.width - 260))}px`;
    menu.style.top = `${Math.round(Math.min(clientY - r.top, r.height - 120))}px`;
    (menu.querySelector('.menu-item:not(.grey)') as HTMLElement | null)?.focus();
  }

  function closeMenu(): void {
    menu.hidden = true;
  }

  // the pointer: drag to move, wheel to zoom toward the cursor
  let drag: { x: number; y: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
    closeMenu();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    cam = clamp(panBy(cam, dx, dy), view, model.width, model.height);
    target = cam;
    root.classList.add('dragging');
    request();
  });
  const endDrag = () => { drag = null; root.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    target = clamp(zoomAt(target, view, { x: e.clientX - r.left, y: e.clientY - r.top }, factor), view, model.width, model.height);
    request();
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    target = clamp(zoomAt(target, view, { x: e.clientX - r.left, y: e.clientY - r.top }, 1.8), view, model.width, model.height);
    request();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // the keys move the map while the map has the focus
  root.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('.map-menu')) {
      if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PAN_KEYS[e.key] && e.target === canvas) {
      held.add(e.key);
      e.preventDefault();
      request();
    } else if (e.key === 'Home') {
      e.preventDefault();
      api.focusHero();
    } else if ((e.key === '+' || e.key === '=') && e.target === canvas) {
      target = clamp({ ...target, zoom: target.zoom * 1.4 }, view, model.width, model.height);
      request();
    } else if (e.key === '-' && e.target === canvas) {
      target = clamp({ ...target, zoom: target.zoom / 1.4 }, view, model.width, model.height);
      request();
    }
  });
  root.addEventListener('keyup', (e) => { held.delete(e.key); });
  canvas.addEventListener('blur', () => held.clear());
  document.addEventListener('click', (e) => { if (!menu.hidden && !(e.target instanceof Node && menu.contains(e.target))) closeMenu(); });

  new ResizeObserver(() => {
    const r = root.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const dpr = window.devicePixelRatio || 1;
    view = { width: r.width, height: r.height };
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    if (!fitted) {
      fitted = true;
      // the first view covers the screen with land and sea, as CK3 opens on the map, not on a framed picture
      const cover = Math.max(view.width / model.width, view.height / model.height);
      cam = target = clamp({ x: model.width / 2, y: model.height / 2, zoom: Math.max(zoomBounds(view, model.width, model.height).min, cover * 1.02) }, view, model.width, model.height);
    } else {
      cam = clamp(cam, view, model.width, model.height);
      target = clamp(target, view, model.width, model.height);
    }
    request();
  }).observe(root);

  const api: MapView = {
    element: root,
    update(next) {
      props = next;
      buildHotspots();
      request();
    },
    focusHero() {
      const hero = props?.hero;
      if (!hero) return;
      target = clamp({ x: hero.x, y: hero.y, zoom: Math.max(target.zoom, 2.4) }, view, model.width, model.height);
      request();
    },
    get camera() { return cam; },
    get mode() { return mode; },
  };
  instance = api;
  return api;
}

/** For tests: the point of the map under a point of the map element. */
export function mapPointAt(view: MapView, x: number, y: number): Point {
  const r = view.element.getBoundingClientRect();
  return toMap(view.camera, { width: r.width, height: r.height }, { x, y });
}
