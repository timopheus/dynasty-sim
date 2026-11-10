import { conceptTip } from './concepts';
import { el } from './dom';
import { flatTip, type MouseHint, type Tip } from './tips';
import './tooltip.css';

const ATTR = 'data-tip';
const ATTR_TITLE = 'data-tip-title';
const ATTR_DATA = 'data-tip-data';

/** How long the pointer or the focus rests on a thing before its tip opens (D-477, as in CK3). No ring at the pointer. */
export const TIP_DELAY_MS = 350;
/** How long an open tip takes to freeze by itself: the ring in its top right corner fills in this time. */
export const TIP_LOCK_MS = 2000;
/** How long after the pointer has left the thing and the tip the stack closes. */
export const TIP_CLOSE_MS = 200;
/** The tips nest up to this deep; a fourth one does not open. */
export const TIP_MAX_LEVELS = 3;
/** The pointer going from a thing to its frozen tip may stray this far from the way between them. */
const INTENT_PX = 15;
/** Distance of a tip from the pointer, right and down. */
const OFFSET_PX = 16;

/**
 * Marks a node as one that has a tooltip (D-477). It opens on hover and on keyboard focus after `TIP_DELAY_MS`, so a node
 * that cannot take focus by itself gets `tabindex=0` (nothing is reachable by hover only, D-444). The whole tip is kept in
 * `data-tip-data`; `data-tip` and `data-tip-title` carry its words in flat form for a screen reader and for the tests.
 */
export function withTip<T extends HTMLElement>(node: T, tip: Tip | null | undefined): T {
  if (!tip) return node;
  node.setAttribute(ATTR, flatTip(tip));
  node.setAttribute(ATTR_DATA, JSON.stringify(tip));
  if (tip.title) node.setAttribute(ATTR_TITLE, tip.title);
  // the clock redraws the screen every day, and `keepView` finds the focused node again by this key: the title, or the
  // words on the node itself (a text shared by many nodes would send the focus to the first), with the numbers cut, so
  // a sum or a date that changes does not lose the focus
  // a link is found again by its place among the focusable nodes (`keepView`): many links share a name, and a key would send the focus to the first
  if (!node.hasAttribute('data-focus') && !(node instanceof HTMLAnchorElement)) node.setAttribute('data-focus', `tip:${(tip.title ?? node.textContent ?? tip.text).replace(/[\d+\-−().,%]+/g, '').trim()}`);
  const focusable = node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement || node.tabIndex >= 0;
  if (!focusable) node.tabIndex = 0;
  return node;
}

type By = 'pointer' | 'focus';

/** What a tip is known by across redraws: its title and text (a sum in the title may change) and the focus key of its node. */
interface TipId {
  title: string | null;
  text: string | null;
  key: string | null;
}

/** One tip of the stack: its box, the thing it is for, and whether it has frozen. */
interface Level {
  box: HTMLElement;
  body: HTMLElement;
  /** A node with `data-tip` (level 0), or a link inside the box of the level above. */
  source: HTMLElement;
  by: By;
  locked: boolean;
  /** The tips of the lines of its breakdown, opened by the links `data-inner`. */
  inner: Tip[];
  id: TipId;
  raw: string | null;
  ring: HTMLElement | null;
  lockTimer: number;
  /** What `aria-describedby` of the source was before the tooltip added its own id. */
  describedBefore: string | null;
}

const stack: Level[] = [];
/** A tip that waits for its delay: the thing it is for, the level above it (-1 for the first) and the timer. */
let pending: { target: HTMLElement; by: By; parent: number; timer: number } | null = null;
let closeTimer: number | null = null;
let mouse = { x: -1, y: -1 };
/** The tip the keyboard asked for: a redraw that gives the focus back to the same thing opens it again, until Esc, a click, the pointer or the next key that moves the focus. */
let focusIntent: TipId | null = null;
/** When the player last moved the focus with the keyboard: only such a focus opens a tip. */
let lastNavKey = -Infinity;
const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

const idOf = (node: Element): TipId => ({ title: node.getAttribute(ATTR_TITLE), text: node.getAttribute(ATTR), key: node.getAttribute('data-focus') });

/** Whether a node is the same thing as the one described: the same focus key, and the same title or the same text. */
function sameTip(node: Element | null, id: TipId): boolean {
  if (!node || node.getAttribute('data-focus') !== id.key) return false;
  return (id.title !== null && node.getAttribute(ATTR_TITLE) === id.title) || (id.text !== null && node.getAttribute(ATTR) === id.text);
}

const LINKS = '[data-concept], [data-inner]';

/** The thing with a tip that a node belongs to: a link inside a tooltip, or a node with `data-tip`. */
function holder(t: EventTarget | null): HTMLElement | null {
  if (!(t instanceof Element)) return null;
  if (t.closest('.tooltip')) return t.closest<HTMLElement>(LINKS);
  return t.closest<HTMLElement>(`[${ATTR}]`);
}

const levelOfBox = (t: EventTarget | null): number => (t instanceof Node ? stack.findIndex((l) => l.box.contains(t)) : -1);

/** The pointer, or the focus, owns the tip that is open or waits. */
const owns = (by: By): boolean => pending?.by === by || (stack.length > 0 && stack[0]?.by === by);

function boxFor(index: number): HTMLElement {
  const box = el('div', { className: `tooltip tip-l${index + 1}` });
  box.setAttribute('role', 'tooltip');
  box.id = index === 0 ? 'tooltip' : `tooltip-${index + 1}`;
  document.body.append(box);
  return box;
}

/** The drawing of a mouse button: a mouse from above with the button that is meant filled. */
function mouseIcon(button: MouseHint['button']): HTMLElement {
  const parts: Record<MouseHint['button'], string> = {
    left: '<path class="on" d="M3 5.5C3 3.6 4.6 2 6.5 2H8v5H3z"/>',
    right: '<path class="on" d="M9 2h1.5C12.4 2 14 3.6 14 5.5V7H9z"/>',
    middle: '<rect class="on" x="7.6" y="2.6" width="1.8" height="3.8" rx=".9"/>',
  };
  const icon = el('span', { className: 'tip-mouse-icon' });
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 17 17"><rect class="body" x="2.5" y="1.5" width="12" height="14" rx="6"/>${parts[button]}<path class="line" d="M3 7h11M8.5 2v5"/></svg>`;
  return icon;
}

const LINK_MARK = /\[\[([a-z-]+)(?:\|([^\]]*))?\]\]/g;

/** A text with its `[[id|word]]` made into links to concepts. */
function linked(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_MARK)) {
    const id = m[1] ?? '';
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const word = m[2] ?? conceptTip(id)?.title ?? id;
    const link = el('span', { className: 'tip-concept' }, word);
    link.setAttribute('data-concept', id);
    out.push(link);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The tip drawn: title, crumb, a line, the text, the breakdown, the conditions, the lines of the mouse. */
function build(tip: Tip, level: Level): Node[] {
  const out: Node[] = [];
  const rule = () => out.push(el('hr', { className: 'tip-rule' }));
  if (tip.title) out.push(el('div', { className: 'tip-title' }, tip.title));
  if (tip.crumb) out.push(el('div', { className: 'tip-crumb' }, tip.crumb));
  const body = Boolean(tip.text) || Boolean(tip.rows?.length) || Boolean(tip.conds?.length);
  if ((tip.title || tip.crumb) && body) rule();
  if (tip.text) out.push(el('div', { className: 'tip-text' }, ...linked(tip.text)));
  const row = (label: string, value: string, tone: string | undefined, inner: Tip | undefined, total = false): HTMLElement => {
    const name = el('span', { className: 'tip-label' }, ...linked(label));
    if (inner) {
      level.inner.push(inner);
      name.classList.add('tip-concept');
      name.setAttribute('data-inner', String(level.inner.length - 1));
    }
    return el('div', { className: total ? 'tip-row total' : 'tip-row' }, name, el('span', { className: `tip-value ${tone ?? ''}`.trim() }, value));
  };
  if (tip.rows?.length) {
    out.push(el('div', { className: tip.rows.length > 8 ? 'tip-rows two' : 'tip-rows' }, ...tip.rows.map((r) => row(r.label, r.value, r.tone, r.tip))));
  }
  if (tip.total) {
    out.push(el('hr', { className: 'tip-rule thin' }));
    out.push(row(tip.total.label, tip.total.value, tip.total.tone, undefined, true));
  }
  if (tip.conds?.length) {
    out.push(el('ul', { className: 'tip-conds' }, ...tip.conds.map((c) => el('li', { className: c.ok ? 'ok' : 'no' }, `${c.ok ? '✓' : '✗'} ${c.text}`))));
  }
  if (tip.mouse?.length) {
    rule();
    out.push(el('div', { className: 'tip-mouse' }, ...tip.mouse.map((m) => el('div', {}, mouseIcon(m.button), el('span', {}, m.text)))));
  }
  return out;
}

function fill(level: Level, tip: Tip): void {
  level.inner = [];
  level.body.replaceChildren(...build(tip, level));
  level.box.classList.toggle('object', Boolean(tip.crumb));
}

/** The tip of a node: of a concept, of a line of a breakdown, or the one kept in the node. */
function tipOf(target: HTMLElement, parent: number): Tip | null {
  const concept = target.getAttribute('data-concept');
  if (concept) return conceptTip(concept);
  const inner = target.getAttribute('data-inner');
  if (inner !== null) return stack[parent]?.inner[Number(inner)] ?? null;
  const raw = target.getAttribute(ATTR_DATA);
  if (raw) {
    try {
      return JSON.parse(raw) as Tip;
    } catch {
      // a broken attribute falls back to the flat words
    }
  }
  return { ...(target.getAttribute(ATTR_TITLE) ? { title: target.getAttribute(ATTR_TITLE) ?? '' } : {}), text: target.getAttribute(ATTR) ?? '' };
}

function place(level: Level, index: number): void {
  const { box, source } = level;
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const margin = 8;
  const r = source.getBoundingClientRect();
  // a tip of a choice stands beside its window, so it never covers the choices below (D-463)
  const frame = index === 0 ? source.closest('.modal') : null;
  if (frame) {
    const m = frame.getBoundingClientRect();
    const right = m.right + margin;
    const x = right + w <= window.innerWidth - margin ? right : Math.max(margin, m.left - w - margin);
    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(Math.min(Math.max(margin, r.top), window.innerHeight - h - margin))}px`;
    return;
  }
  let left: number;
  let top: number;
  const above = index > 0 ? stack[index - 1]?.box : undefined;
  if (above) {
    // a tip inside a tip stands beside the one it came from, level with its link, so the lines of the first stay readable
    const p = above.getBoundingClientRect();
    left = p.right + 4;
    if (left + w > window.innerWidth - margin) left = p.left - 4 - w;
    top = r.top;
  } else if (level.by === 'pointer' && mouse.x >= 0) {
    // right and down of the pointer; at the right edge to the left of it, at the bottom above it
    left = mouse.x + OFFSET_PX;
    top = mouse.y + OFFSET_PX;
    if (left + w > window.innerWidth - margin) left = mouse.x - OFFSET_PX - w;
    if (top + h > window.innerHeight - margin) top = mouse.y - OFFSET_PX - h;
  } else {
    left = r.left;
    top = r.bottom + 6;
    if (top + h > window.innerHeight - margin) top = r.top - h - 6;
  }
  box.style.left = `${Math.round(Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - w - margin)))}px`;
  box.style.top = `${Math.round(Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - h - margin)))}px`;
}

function cancelPending(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}

function cancelClose(): void {
  if (closeTimer !== null) clearTimeout(closeTimer);
  closeTimer = null;
}

/** Closes the levels from `count` on, the deepest first. */
function truncate(count: number): void {
  while (stack.length > count) {
    const level = stack.pop();
    if (!level) break;
    clearTimeout(level.lockTimer);
    if (stack.length === 0 && level.source.isConnected && level.source.hasAttribute(ATTR)) {
      if (level.describedBefore) level.source.setAttribute('aria-describedby', level.describedBefore);
      else level.source.removeAttribute('aria-describedby');
    }
    level.box.remove();
  }
}

/** Closes the whole stack and what waits to open. */
export function hideTip(): void {
  cancelPending();
  cancelClose();
  truncate(0);
}

/** Freezes a tip: the ring goes, the second frame shows, the pointer may enter, and its links take the keyboard. */
function lock(level: Level): void {
  if (level.locked) return;
  level.locked = true;
  clearTimeout(level.lockTimer);
  level.ring?.remove();
  level.ring = null;
  level.box.classList.add('locked');
  const depth = stack.indexOf(level);
  if (depth >= 0 && depth + 1 < TIP_MAX_LEVELS) for (const link of level.box.querySelectorAll<HTMLElement>(LINKS)) link.tabIndex = 0;
}

function open(target: HTMLElement, by: By, parent: number): void {
  // an open menu is what the player is reading: no tip over it
  if (document.querySelector('.person-menu')) return;
  const index = parent + 1;
  if (index >= TIP_MAX_LEVELS) return;
  const tip = tipOf(target, parent);
  if (!tip) return;
  if (index === 0 && stack[0]?.source === target) return;
  truncate(index);
  cancelClose();
  const box = boxFor(index);
  const ring = el('span', { className: 'tip-ring' });
  ring.setAttribute('aria-hidden', 'true');
  ring.style.setProperty('--tip-lock-time', `${TIP_LOCK_MS}ms`);
  ring.innerHTML = '<svg viewBox="0 0 20 20"><circle class="track" cx="10" cy="10" r="7"/><circle class="fill" cx="10" cy="10" r="7" pathLength="100"/></svg>';
  const body = el('div', { className: 'tip-body' });
  box.append(body, ring);
  const level: Level = { box, body, source: target, by, locked: false, inner: [], id: idOf(target), raw: target.getAttribute(ATTR_DATA), ring, lockTimer: 0, describedBefore: null };
  stack.push(level);
  fill(level, tip);
  level.lockTimer = window.setTimeout(() => lock(level), TIP_LOCK_MS);
  if (index === 0) {
    focusIntent = by === 'focus' ? level.id : null;
    level.describedBefore = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [level.describedBefore, 'tooltip'].filter(Boolean).join(' '));
  }
  place(level, index);
}

/** Starts the wait for a tip; `parent` is the level whose box holds the thing (-1 for a thing of the screen). */
function wait(target: HTMLElement, by: By, parent: number): void {
  if (pending?.target === target || stack[parent + 1]?.source === target) return;
  cancelPending();
  if (document.querySelector('.person-menu')) return;
  const fire = (tries: number): void => {
    const p = pending;
    if (!p) return;
    const t = p.target;
    // still under the pointer (a scroll may have moved it away), still with the focus (the window may have lost it)
    const still = p.by === 'pointer' ? holder(document.elementFromPoint(mouse.x, mouse.y)) === t : holder(document.activeElement) === t && document.hasFocus();
    if (t.isConnected && still) {
      pending = null;
      open(t, p.by, p.parent);
    } else if (p.by === 'focus' && focusIntent !== null && tries < 20) {
      // a redraw of the day may hold the focus off its node for a moment: the keyboard's wish is still there, so wait on
      p.timer = window.setTimeout(() => fire(tries + 1), 100);
    } else pending = null;
  };
  const timer = window.setTimeout(() => fire(0), TIP_DELAY_MS);
  pending = { target, by, parent, timer };
  // the keyboard's wish lasts until the pointer or a key takes over
  if (parent < 0) focusIntent = by === 'focus' ? idOf(target) : null;
}

/** The new copy of a node after a redraw: under a still pointer, or on the focus. */
function copyOf(by: By, id: TipId): HTMLElement | null {
  // under a still pointer only the same thing keeps its tip: a new window must not answer for the old hover
  const node = by === 'pointer' ? holder(document.elementFromPoint(mouse.x, mouse.y)) : holder(document.activeElement);
  return node && sameTip(node, id) ? node : null;
}

/** Whether the pointer stands on the way from the source of a frozen tip to its box (a strip of `INTENT_PX` around both). */
function inCorridor(level: Level): boolean {
  if (!level.locked) return false;
  const a = level.source.getBoundingClientRect();
  const b = level.box.getBoundingClientRect();
  const left = Math.min(a.left, b.left) - INTENT_PX;
  const right = Math.max(a.right, b.right) + INTENT_PX;
  const top = Math.min(a.top, b.top) - INTENT_PX;
  const bottom = Math.max(a.bottom, b.bottom) + INTENT_PX;
  return mouse.x >= left && mouse.x <= right && mouse.y >= top && mouse.y <= bottom;
}

/** The deepest level the pointer still holds: on its source, in its box, or on the way to its box. -1 if none. */
function heldLevel(over: Element | null): number {
  let held = -1;
  stack.forEach((level, i) => {
    if ((over && (level.box.contains(over) || level.source.contains(over))) || inCorridor(level)) held = i;
  });
  return held;
}

/** Closes what the pointer no longer holds, `TIP_CLOSE_MS` after it let go. */
function scheduleClose(): void {
  if (stack[0]?.by !== 'pointer') return;
  if (heldLevel(document.elementFromPoint(mouse.x, mouse.y)) >= stack.length - 1) {
    cancelClose();
    return;
  }
  if (closeTimer !== null) return;
  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    if (stack[0]?.by !== 'pointer') return;
    truncate(heldLevel(document.elementFromPoint(mouse.x, mouse.y)) + 1);
  }, TIP_CLOSE_MS);
}

/**
 * The screen is drawn anew after a command and every day of the clock: a tooltip that was open, or waits to open,
 * follows the new copy of its node (under the pointer, or on the focus), and goes if there is none. A frozen tip and
 * the tips inside it stay as they are; the text of the first is drawn again if it changed.
 */
export function syncTip(): void {
  if (pending && pending.parent < 0) {
    const old = pending.target;
    const target = old.isConnected ? old : copyOf(pending.by, idOf(old));
    if (target) pending.target = target;
    // the focus comes back to its node only after the redraw (`keepView`, then `focusin`): the wait stays for it
    else if (pending.by === 'pointer') cancelPending();
  }
  const first = stack[0];
  if (!first || first.source.isConnected) return;
  let target = copyOf(first.by, first.id);
  // a pointer inside a frozen tip is not on the thing any more: look for the thing itself
  if (!target && first.by === 'pointer' && first.locked && heldLevel(document.elementFromPoint(mouse.x, mouse.y)) >= 0) {
    target = findCopy(first);
  }
  // the focus is inside a frozen tip (it lies outside `#app`, so a redraw leaves it be): look for the thing itself
  if (!target && first.by === 'focus' && levelOfBox(document.activeElement) >= 0) target = findCopy(first);
  if (target) {
    retarget(first, target);
    return;
  }
  // the focus comes back to its node only after the redraw (`keepView`, then `focusin`): the tip stays for it, and goes
  // if the focus does not come back
  if (first.by === 'focus') window.setTimeout(checkFocus, 0);
  else hideTip();
}

/** The new copy of the thing of the first tip, found anywhere on the page. */
function findCopy(first: Level): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[${ATTR}]`)].find((n) => sameTip(n, first.id)) ?? null;
}

/** The first tip follows the new copy of its node after a redraw, with its frozen state, ring and the tips inside it. */
function retarget(first: Level, target: HTMLElement): void {
  const raw = target.getAttribute(ATTR_DATA);
  first.source = target;
  first.id = idOf(target);
  first.describedBefore = target.getAttribute('aria-describedby');
  target.setAttribute('aria-describedby', [first.describedBefore, 'tooltip'].filter(Boolean).join(' '));
  if (raw !== first.raw && stack.length === 1 && levelOfBox(document.activeElement) < 0) {
    const tip = tipOf(target, -1);
    if (tip) fill(first, tip);
    // the links of a frozen tip drawn anew must take the keyboard again
    if (first.locked) for (const link of first.box.querySelectorAll<HTMLElement>(LINKS)) link.tabIndex = 0;
  }
  first.raw = raw;
}

/** The source of a level, as a node that is on the page: a key may come between a redraw and the tip following its thing. */
function liveSource(level: Level): HTMLElement {
  const first = stack[0];
  if (level === first && !first.source.isConnected) {
    const copy = findCopy(first);
    if (copy) retarget(first, copy);
  }
  return level.source;
}

/** After a moment: a tip of the focus stays only if the focus is on its thing, or in its boxes. */
function checkFocus(): void {
  const first = stack[0];
  if (!first || first.by !== 'focus') return;
  const active = document.activeElement;
  if (levelOfBox(active) >= 0) {
    // the thing was drawn anew while the focus stood in the tip: the tip follows the new copy
    if (!first.source.isConnected) {
      const copy = findCopy(first);
      if (copy) retarget(first, copy);
    }
    return;
  }
  if (stack.some((l) => l.source === active)) return;
  const copy = holder(active);
  if (copy && !first.source.isConnected && sameTip(copy, first.id)) {
    retarget(first, copy);
    return;
  }
  hideTip();
}

/** Tab and Shift+Tab with a frozen tip: the links of its box follow its thing in the order, then the order goes on. */
function tabThroughTip(e: KeyboardEvent): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const linksOf = (level: Level): HTMLElement[] => [...level.box.querySelectorAll<HTMLElement>(LINKS)].filter((l) => l.tabIndex >= 0);
  const inBox = levelOfBox(active);
  const own = stack.findIndex((l) => l.source === active);
  // forward, from a thing or a link that has a frozen tip with links of its own: into that tip
  if (!e.shiftKey && own >= 0) {
    const level = stack[own];
    const first = level && level.locked && own + 1 < TIP_MAX_LEVELS ? linksOf(level)[0] : undefined;
    if (first) {
      e.preventDefault();
      first.focus();
      return;
    }
  }
  if (inBox < 0) return;
  const level = stack[inBox];
  if (!level) return;
  const links = linksOf(level);
  const i = links.indexOf(active);
  if (i < 0) return;
  if (e.shiftKey && i === 0) {
    e.preventDefault();
    liveSource(level).focus();
    truncate(inBox + 1);
  } else if (!e.shiftKey && i === links.length - 1) {
    // the last link: the focus goes back up to the thing the order goes on from, and the browser takes the next step
    let k = inBox;
    let back = liveSource(level);
    while (k > 0) {
      const above = linksOf(stack[k - 1] as Level);
      if (above[above.length - 1] !== back) break;
      k--;
      back = liveSource(stack[k] as Level);
    }
    back.focus();
  }
}

/** Once per page: tooltips by delegation, so the panels that are drawn anew after each command need no wiring. */
export function installTooltips(): void {
  // the pointer must really move: a window that opens under a still pointer shows no tip over its choices
  document.addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    const t = holder(e.target);
    const inBox = levelOfBox(e.target);
    if (t) {
      // a link in a tip opens only from a frozen one
      const parent = inBox;
      if (inBox >= 0 && !stack[inBox]?.locked) return;
      if (stack[parent + 1]?.source === t) cancelPending();
      else if (parent + 1 < TIP_MAX_LEVELS) wait(t, 'pointer', parent);
    } else if (pending?.by === 'pointer') cancelPending();
    scheduleClose();
  });
  // a middle click freezes the tip at once, on the thing or in the tip
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return;
    const inBox = levelOfBox(e.target);
    const level = inBox >= 0 ? stack[inBox] : null;
    const t = holder(e.target);
    if (level) {
      e.preventDefault();
      lock(level);
      return;
    }
    if (t && inBox < 0) {
      e.preventDefault();
      cancelPending();
      if (stack[0]?.source !== t) open(t, 'pointer', -1);
      const first = stack[0];
      if (first?.source === t) lock(first);
    }
  });
  // the middle click of a link would open it in a new tab: it freezes the tip instead
  document.addEventListener('auxclick', (e) => {
    if (e.button === 1 && holder(e.target)) e.preventDefault();
  });
  // a redraw moves the focus off a node and back: only a tip that the focus itself opened closes with it
  document.addEventListener('focusin', (e) => {
    const inBox = levelOfBox(e.target);
    const t = holder(e.target);
    if (inBox >= 0) {
      // the keyboard walks into a frozen tip: its link opens a tip of its own after the delay
      if (t && performance.now() - lastNavKey < 200 && stack[inBox + 1]?.source !== t) wait(t, 'focus', inBox);
      return;
    }
    // a focus the program gives back after a redraw is not the player's: only a key that moves the focus opens a tip
    const kept = t !== null && focusIntent !== null && sameTip(t, focusIntent);
    if (stack.some((l) => l.source === e.target)) return;
    // the redraw gave the focus back to the new copy of the thing whose tip is open: the tip, frozen or not, follows it
    const first = stack[0];
    if (t && first?.by === 'focus' && !first.source.isConnected && sameTip(t, first.id)) {
      retarget(first, t);
      return;
    }
    if (t && kept) {
      // the tip was open: it opens again at once; it was waiting: the wait goes on with the new copy
      if (pending?.by === 'focus') pending.target = t;
      else {
        hideTip();
        open(t, 'focus', -1);
      }
    } else if (t && performance.now() - lastNavKey < 200) {
      if (stack.length) hideTip();
      wait(t, 'focus', -1);
    } else if (owns('focus')) hideTip();
  });
  // the tip goes with the focus; `focusIntent` stays, so a redraw that gives the focus back opens it again (a wait
  // stays too: the redraw gives the focus back to its node, and the timer checks the focus before it opens the tip)
  document.addEventListener('focusout', (e) => {
    if (stack[0]?.by !== 'focus') return;
    const next = e.relatedTarget;
    if (next instanceof Node && (levelOfBox(next) >= 0 || stack.some((l) => l.source.contains(next)))) return;
    // a redraw takes the focus off its node and gives it back at once: look again when it has settled
    window.setTimeout(checkFocus, 0);
  });
  // a click did what the tip said: it must not lie over what the click opened; a click inside a tip leaves it be
  document.addEventListener('click', (e) => {
    if (levelOfBox(e.target) >= 0) return;
    focusIntent = null;
    hideTip();
  });
  document.addEventListener('contextmenu', () => { focusIntent = null; hideTip(); });
  document.addEventListener('mouseleave', () => { if (owns('pointer')) hideTip(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      focusIntent = null;
      const head = stack[0];
      const back = head ? liveSource(head) : undefined;
      const inside = levelOfBox(document.activeElement) >= 0;
      hideTip();
      // the focus was in the tip: it goes back to the thing the tip opened from
      if (inside && back?.isConnected) back.focus();
    }
    // first note the key, then move the focus by it: the focus that follows is the player's
    if (NAV_KEYS.has(e.key)) {
      focusIntent = null;
      lastNavKey = performance.now();
    }
    if (e.key === 'Tab' && stack.length) tabThroughTip(e);
  }, true);
}
