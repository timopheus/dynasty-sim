import { keepInView, personMenuNode } from '../context-menu';
import { el } from '../dom';
import type { MenuItem } from '../people-model';
import { hideTip, withTip } from '../tooltip';
import type { Camera, Insets, Viewport } from './camera';
import { centreOn, clamp, NO_INSETS, panBy, toMap, toScreen, zoomAt, zoomBounds } from './camera';
import type { Point } from './model';
import { regionModel } from './region';
import { MapRenderer } from './render';
import type { MapMode, MapOverlay, MapProps } from './types';
import { MAP_MODES } from './types';
export type { MapProps } from './types';
import './map.css';
import { tr } from '../i18n';

const MODE_NAMES: Record<MapMode, { label: string; tip: string }> = {
  realms: { label: 'Realms', tip: 'The realms of the land and their borders (E).' },
  terrain: { label: 'Terrain', tip: 'Plains, forests, hills and mountains (G).' },
  cultures: { label: 'Peoples', tip: 'Where each people lives (T).' },
  roads: { label: 'Roads', tip: 'The places you can reach and the days of road between them (R).' },
};

/** Keys of the map modes, as in CK3 where it can be (E realms, T cultures; terrain on G, as Ctrl+G is the browser's). */
const MODE_KEYS: Record<string, MapMode> = { e: 'realms', g: 'terrain', t: 'cultures', r: 'roads' };

/** Keys that move the map (CK3: WASD and the arrows), in screen pixels a frame. */
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [1, 0], a: [1, 0], A: [1, 0],
  ArrowRight: [-1, 0], d: [-1, 0], D: [-1, 0],
  ArrowUp: [0, 1], w: [0, 1], W: [0, 1],
  ArrowDown: [0, -1], s: [0, -1], S: [0, -1],
};

export type { Insets } from './camera';

export interface MapView {
  element: HTMLElement;
  update: (props: MapProps) => void;
  /** The panels over the map (CK3: the map is under everything); the first update with the hero centres on him. */
  setInsets: (insets: Insets) => void;
  /** Centres the map on the hero (Home); `jump` without the easing. */
  focusHero: (jump?: boolean) => void;
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
  // the menu of a place is the menu of a person (D-448): above every panel, in the body of the page
  let menu: HTMLElement | null = null;
  let menuFrom: HTMLElement | null = null;
  const modes = el('div', { className: 'map-modes', role: 'group' });
  modes.setAttribute('aria-label', 'Map modes');
  const home = el('button', { className: 'map-mode map-home', type: 'button', onclick: () => api.focusHero() }, 'Me');
  home.setAttribute('data-focus', 'map-home');
  withTip(home, { text: 'Show where you are on the map (Home).' });
  // the key of a mode's colours (CK3 shows one by the mode buttons)
  const legend = el('div', { className: 'map-legend', hidden: true });
  legend.setAttribute('aria-label', 'Map key');
  const root = el('div', { className: 'map-view' }, canvas, hotspots, modes, legend);

  let props: MapProps | null = null;
  let mode: MapMode = 'realms';
  let view: Viewport = { width: 800, height: 450 };
  let cam: Camera = { x: model.width / 2, y: model.height / 2, zoom: 0.5 };
  let target: Camera = cam;
  let fitted = false;
  let frame = 0;
  let selected: string | null = null;
  let hovered: string | null = null;
  let insets: Insets = NO_INSETS;
  let lastSign = '';
  let metHero = false;
  const held = new Set<string>();

  const modeButtons = MAP_MODES.map((m) => {
    const b = el('button', { className: 'map-mode', type: 'button', onclick: () => setMode(m) });
    b.setAttribute('data-focus', `map-mode-${m}`);
    b.setAttribute('aria-pressed', String(m === mode));
    modes.append(b);
    return { m, b };
  });
  modes.append(home);

  /** Words of the controls in the language chosen (RU.1): set again on every update, the map itself is made once. */
  let labelled = '';
  function relabel(): void {
    const sign = tr('Realms');
    if (sign === labelled) return;
    labelled = sign;
    for (const { m, b } of modeButtons) {
      b.textContent = tr(MODE_NAMES[m].label);
      withTip(b, { text: tr(MODE_NAMES[m].tip) });
    }
    home.textContent = tr('Me');
    withTip(home, { text: tr('Show where you are on the map (Home).') });
    canvas.setAttribute('aria-label', tr('Map of the region'));
    modes.setAttribute('aria-label', tr('Map modes'));
    legend.setAttribute('aria-label', tr('Map key'));
    fillLegend();
  }

  /** The camera kept over the map in the free part of the screen. */
  const fix = (c: Camera): Camera => clamp(c, view, model.width, model.height, insets);

  function setMode(m: MapMode): void {
    mode = m;
    for (const { m: k, b } of modeButtons) {
      b.classList.toggle('current', k === m);
      b.setAttribute('aria-pressed', String(k === m));
    }
    fillLegend();
    request();
  }

  function fillLegend(): void {
    if (mode !== 'cultures') { legend.hidden = true; return; }
    const names = props?.peoples ?? new Map<number, string>();
    const rows = [...model.cultures.values()].filter((c) => c.id !== 0).map((c) => {
      const swatch = el('span', { className: 'map-swatch' });
      swatch.style.background = c.color;
      return el('div', { className: 'map-legend-row' }, swatch, el('span', {}, names.get(c.id) ?? c.name));
    });
    legend.replaceChildren(el('div', { className: 'map-legend-title' }, tr('Peoples')), ...rows);
    legend.hidden = false;
  }
  setMode(mode);
  relabel();

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
      peoples: props?.peoples ?? new Map(),
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
      target = fix(panBy(target, dx * 14, dy * 14));
      cam = fix(panBy(cam, dx * 14, dy * 14));
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
        b.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openMenu(p.id, e.clientX, e.clientY, b); };
        b.onkeydown = (e) => {
          if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            e.preventDefault();
            const r = b.getBoundingClientRect();
            openMenu(p.id, r.right, r.bottom, b);
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

  function openMenu(id: string, clientX: number, clientY: number, from: HTMLElement): void {
    if (!props) return;
    const p = props.places.find((x) => x.id === id);
    if (!p) return;
    closeMenu(false);
    hideTip();
    const travel = props.travel(id);
    const choose = new Map<MenuItem, () => void>();
    const items: MenuItem[] = [];
    const add = (item: Omit<MenuItem, 'action'>, run: () => void) => {
      const full: MenuItem = { ...item, action: { type: 'open', id } };
      items.push(full);
      choose.set(full, run);
    };
    // the journey is offered only when it is a journey: the place you stand in has nothing to travel to
    if (travel.reason !== tr('You are here')) {
      add({ label: travel.label, note: travel.note, grey: !travel.enabled, reason: travel.reason }, () => props?.onTravel(id));
    }
    add({ label: tr('Open the page'), note: '', grey: false, reason: '' }, () => { selected = id; props?.onOpen(id); request(); });
    const node = personMenuNode({ id, title: p.name, items }, { id, x: Math.round(clientX), y: Math.round(clientY), from: null }, (item) => {
      const run = choose.get(item);
      closeMenu(false);
      run?.();
    });
    node.classList.add('map-menu');
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    });
    document.body.append(node);
    keepInView(node);
    menu = node;
    menuFrom = from;
    root.classList.add('menu-open');
    (node.querySelector('.menu-item:not(.grey)') as HTMLElement | null)?.focus();
  }

  /** Closes the menu of a place; `back` returns the focus to the place it was opened from (Esc, D-448). */
  function closeMenu(back = false): void {
    if (!menu) return;
    menu.remove();
    menu = null;
    root.classList.remove('menu-open');
    if (back && menuFrom?.isConnected) menuFrom.focus();
    menuFrom = null;
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
    cam = fix(panBy(cam, dx, dy));
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
    target = fix(zoomAt(target, view, { x: e.clientX - r.left, y: e.clientY - r.top }, factor));
    request();
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    target = fix(zoomAt(target, view, { x: e.clientX - r.left, y: e.clientY - r.top }, 1.8));
    request();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // the keys move the map while the map has the focus
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PAN_KEYS[e.key] && e.target === canvas) {
      held.add(e.key);
      e.preventDefault();
      request();
    } else if ((e.key === '+' || e.key === '=') && e.target === canvas) {
      target = fix({ ...target, zoom: target.zoom * 1.4 });
      request();
    } else if (e.key === '-' && e.target === canvas) {
      target = fix({ ...target, zoom: target.zoom / 1.4 });
      request();
    }
  });
  root.addEventListener('keyup', (e) => { held.delete(e.key); });
  canvas.addEventListener('blur', () => held.clear());
  document.addEventListener('click', (e) => { if (menu && !(e.target instanceof Node && menu.contains(e.target))) closeMenu(); });
  document.addEventListener('contextmenu', (e) => { if (menu && !(e.target instanceof Node && (menu.contains(e.target) || hotspots.contains(e.target)))) closeMenu(); });
  window.addEventListener('resize', () => closeMenu());
  // keys of the whole game screen (CK3), unless a field, a menu or a window has them: Home finds the hero,
  // E/G/T/R change the mode, PgUp/PgDn zoom
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !root.isConnected) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest('input, textarea, select, [contenteditable], .person-menu, [role="dialog"], .modal-layer') || t.isContentEditable)) return;
    if (document.querySelector('.modal-layer')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const m = MODE_KEYS[key];
    if (key === 'Home') api.focusHero();
    else if (m) setMode(m);
    else if (key === 'PageDown' || key === 'PageUp') {
      target = fix({ ...target, zoom: target.zoom * (key === 'PageDown' ? 1.4 : 1 / 1.4) });
      request();
    } else return;
    e.preventDefault();
  });

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
      cam = target = fix({ x: model.width / 2, y: model.height / 2, zoom: Math.max(zoomBounds(view, model.width, model.height).min, cover * 1.02) });
    } else {
      cam = fix(cam);
      target = fix(target);
    }
    if (!metHero && props?.hero) {
      metHero = true;
      api.focusHero(true);
    }
    request();
  }).observe(root);

  const api: MapView = {
    element: root,
    update(next) {
      relabel();
      // the screen is drawn every day of the clock; the map is drawn again only when what it shows has changed
      const sign = JSON.stringify([next.places.map((p) => p.id), next.hero, next.journey, next.places.map((p) => next.describe(p.id))]);
      const changed = sign !== lastSign;
      lastSign = sign;
      props = next;
      if (!changed) return;
      buildHotspots();
      fillLegend();
      // CK3 opens on the player's character: the first time the hero is known, the map goes to him
      if (!metHero && next.hero && fitted) {
        metHero = true;
        api.focusHero(true);
      }
      request();
    },
    setInsets(next) {
      if (next.left === insets.left && next.right === insets.right && next.top === insets.top && next.bottom === insets.bottom) return;
      insets = next;
      target = fix(target);
      request();
    },
    focusHero(jump = false) {
      const hero = props?.hero;
      if (!hero) return;
      // the hero goes to the middle of the free part of the screen, not under a panel
      target = fix(centreOn(hero, Math.max(target.zoom, 2.2), insets));
      if (jump) cam = target;
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
