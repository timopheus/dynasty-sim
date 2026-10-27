import { el } from './dom';
import type { Tip } from './tips';
import './tooltip.css';

const ATTR = 'data-tip';
const ATTR_TITLE = 'data-tip-title';

/**
 * How long the pointer or the focus rests on a thing before its tip opens (D-465, as in CK3): a pointer that only
 * passes over the screen opens nothing. A small ring at the pointer fills while it waits.
 */
export const TIP_DELAY_MS = 500;

/**
 * Marks a node as one that has a tooltip (D-465: only where the name does not say it all). It opens on hover and on
 * keyboard focus after `TIP_DELAY_MS`, so a node that cannot take focus by itself gets `tabindex=0` (nothing is
 * reachable by hover only, D-444).
 */
export function withTip<T extends HTMLElement>(node: T, tip: Tip | null | undefined): T {
  if (!tip) return node;
  node.setAttribute(ATTR, tip.text);
  if (tip.title) node.setAttribute(ATTR_TITLE, tip.title);
  // the clock redraws the screen every day, and `keepView` finds the focused node again by this key: the title (or the
  // text) with its numbers cut, so a sum or a date that changes does not lose the focus
  if (!node.hasAttribute('data-focus')) node.setAttribute('data-focus', `tip:${(tip.title ?? tip.text).replace(/[\d+\-−().,%]+/g, '').trim()}`);
  const focusable = node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement || node.tabIndex >= 0;
  if (!focusable) node.tabIndex = 0;
  return node;
}

type By = 'pointer' | 'focus';

let box: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let shownFor: HTMLElement | null = null;
/** What opened the tip: the pointer's tip is not closed by the focus moving, the focus's tip not by the pointer. */
let shownBy: By = 'pointer';
/** What `aria-describedby` of the node was before the tooltip added its own id. */
let describedBefore: string | null = null;
/** A tip that waits for its delay: the node it is for (followed across redraws by `syncTip`) and the timer. */
let pending: { target: HTMLElement; by: By; timer: number } | null = null;

function ensureBox(): HTMLElement {
  if (!box) {
    box = el('div', { className: 'tooltip', id: 'tooltip', hidden: true });
    box.setAttribute('role', 'tooltip');
    document.body.append(box);
  }
  return box;
}

/** The ring that fills while a tip waits; drawn anew each time, so its fill starts from nothing. */
function showRing(x: number, y: number): void {
  ring?.remove();
  ring = document.createElement('div');
  ring.className = 'tip-timer';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.setProperty('--tip-delay', `${TIP_DELAY_MS}ms`);
  ring.innerHTML = '<svg viewBox="0 0 20 20"><circle class="ground" cx="10" cy="10" r="9.5"/><circle class="track" cx="10" cy="10" r="6.5"/><circle class="fill" cx="10" cy="10" r="6.5" pathLength="100"/></svg>';
  document.body.append(ring);
  moveRing(x, y);
}

function moveRing(x: number, y: number): void {
  if (!ring) return;
  ring.style.left = `${Math.round(x + 12)}px`;
  ring.style.top = `${Math.round(y + 12)}px`;
}

function hideRing(): void {
  ring?.remove();
  ring = null;
}

function cancelPending(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
  hideRing();
}

export function hideTip(): void {
  cancelPending();
  if (shownFor?.isConnected) {
    if (describedBefore) shownFor.setAttribute('aria-describedby', describedBefore);
    else shownFor.removeAttribute('aria-describedby');
  }
  shownFor = null;
  describedBefore = null;
  if (box) box.hidden = true;
}

function place(target: HTMLElement, tip: HTMLElement): void {
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const margin = 8;
  let left = Math.min(Math.max(margin, r.left), window.innerWidth - w - margin);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - h - 6);
  left = Math.max(margin, left);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** Whether a node carries the same tip as the one described: the same title, or the same text. */
function sameTip(node: Element | null, title: string | null, text: string | null): boolean {
  if (!node) return false;
  return (title !== null && node.getAttribute(ATTR_TITLE) === title) || (text !== null && node.getAttribute(ATTR) === text);
}

function show(target: HTMLElement, by: By): void {
  cancelPending();
  if (target === shownFor) return;
  // the node the tip leaves gets its own `aria-describedby` back
  if (shownFor) hideTip();
  // an open menu is what the player is reading: no tip over it
  if (document.querySelector('.person-menu')) return;
  const tip = ensureBox();
  const title = target.getAttribute(ATTR_TITLE);
  tip.replaceChildren(...(title ? [el('strong', {}, title)] : []), el('span', {}, target.getAttribute(ATTR) ?? ''));
  tip.hidden = false;
  shownFor = target;
  shownBy = by;
  focusIntent = by === 'focus' ? { title, text: target.getAttribute(ATTR) } : null;
  describedBefore = target.getAttribute('aria-describedby');
  target.setAttribute('aria-describedby', [describedBefore, 'tooltip'].filter(Boolean).join(' '));
  place(target, tip);
}

/** Starts the wait for a tip (D-465); the ring stands at the pointer, or at the corner of a node the keyboard reached. */
function wait(target: HTMLElement, by: By): void {
  if (pending?.target === target || target === shownFor) return;
  if (shownFor) hideTip();
  cancelPending();
  if (document.querySelector('.person-menu')) return;
  const timer = window.setTimeout(() => {
    const t = pending?.target ?? null;
    pending = null;
    hideRing();
    if (t?.isConnected) show(t, by);
  }, TIP_DELAY_MS);
  pending = { target, by, timer };
  if (by === 'focus') {
    focusIntent = { title: target.getAttribute(ATTR_TITLE), text: target.getAttribute(ATTR) };
    const r = target.getBoundingClientRect();
    showRing(r.right - 6, r.top - 10);
  } else showRing(mouse.x, mouse.y);
}

let mouse = { x: -1, y: -1 };
/** The tip the keyboard asked for: a redraw that gives the focus back to the same thing opens it again, until Esc, a click or the next key that moves the focus. */
let focusIntent: { title: string | null; text: string | null } | null = null;
/** When the player last moved the focus with the keyboard: only such a focus opens a tip. */
let lastNavKey = -Infinity;
const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** The new copy of a node after a redraw: under a still pointer, or on the focus. */
function copyOf(by: By, title: string | null, text: string | null): HTMLElement | null {
  // under a still pointer only the same thing keeps its tip: a new window must not answer for the old hover
  const node = by === 'pointer' ? holder(document.elementFromPoint(mouse.x, mouse.y)) : holder(document.activeElement);
  return node && sameTip(node, title, text) ? node : null;
}

/**
 * The screen is drawn anew after a command and every day of the clock: a tooltip that was open, or waits to open,
 * follows the new copy of its node (under the pointer, or on the focus), and goes if there is none. The wait goes on
 * from where it was, so a running clock does not hold a tip back for ever.
 */
export function syncTip(): void {
  if (pending) {
    const old = pending.target;
    const target = old.isConnected ? old : copyOf(pending.by, old.getAttribute(ATTR_TITLE), old.getAttribute(ATTR));
    if (target) pending.target = target;
    // the focus comes back to its node only after the redraw (`keepView`, then `focusin`): the wait stays for it
    else if (pending.by === 'pointer') cancelPending();
  }
  if (shownFor === null) return;
  const by = shownBy;
  const target = copyOf(by, shownFor.getAttribute(ATTR_TITLE), shownFor.getAttribute(ATTR));
  shownFor = null;
  if (target) show(target, by);
  else hideTip();
}

const holder = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>(`[${ATTR}]`) : null);

/** Once per page: tooltips by delegation, so the panels that are drawn anew after each command need no wiring. */
export function installTooltips(): void {
  // the pointer must really move: a window that opens under a still pointer shows no tip over its choices
  document.addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    const t = holder(e.target);
    if (!t) {
      if (pending?.by === 'pointer' || (shownFor !== null && shownBy === 'pointer')) hideTip();
      return;
    }
    if (pending?.target === t && pending.by === 'pointer') moveRing(mouse.x, mouse.y);
    else wait(t, 'pointer');
  });
  // a redraw moves the focus off a node and back: only a tip that the focus itself opened closes with it
  document.addEventListener('focusin', (e) => {
    const t = holder(e.target);
    // a focus the program gives back after a redraw is not the player's: only a key that moves the focus opens a tip
    const kept = t !== null && focusIntent !== null && sameTip(t, focusIntent.title, focusIntent.text);
    if (t && kept) {
      // the tip was open: it opens again at once; it was waiting: the wait goes on with the new copy
      if (pending?.by === 'focus') pending.target = t;
      else show(t, 'focus');
    } else if (t && performance.now() - lastNavKey < 200) wait(t, 'focus');
    else if (shownBy === 'focus' || pending?.by === 'focus') hideTip();
  });
  // the tip goes with the focus; `focusIntent` stays, so a redraw that gives the focus back opens it again
  document.addEventListener('focusout', () => { if (shownFor !== null && shownBy === 'focus') hideTip(); });
  // a click did what the tip said: it must not lie over what the click opened
  document.addEventListener('click', () => { focusIntent = null; hideTip(); });
  document.addEventListener('contextmenu', () => { focusIntent = null; hideTip(); });
  document.addEventListener('mouseleave', () => { if (pending?.by === 'pointer' || (shownFor !== null && shownBy === 'pointer')) hideTip(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { focusIntent = null; hideTip(); }
    if (NAV_KEYS.has(e.key)) {
      focusIntent = null;
      lastNavKey = performance.now();
    }
  }, true);
}
