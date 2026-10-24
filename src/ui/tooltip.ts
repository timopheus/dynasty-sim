import { el } from './dom';
import type { Tip } from './tips';
import './tooltip.css';

const ATTR = 'data-tip';
const ATTR_TITLE = 'data-tip-title';

/**
 * Marks a node as one that has a tooltip. It opens on hover and on keyboard focus, so a node that cannot take focus by
 * itself gets `tabindex=0` (nothing is reachable by hover only, D-444).
 */
export function withTip<T extends HTMLElement>(node: T, tip: Tip | null | undefined): T {
  if (!tip) return node;
  node.setAttribute(ATTR, tip.text);
  node.setAttribute(ATTR_TITLE, tip.title);
  const focusable = node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement || node.tabIndex >= 0;
  if (!focusable) node.tabIndex = 0;
  return node;
}

let box: HTMLElement | null = null;
let shownFor: HTMLElement | null = null;
/** What opened the tip: the pointer's tip is not closed by the focus moving, the focus's tip not by the pointer. */
let shownBy: 'pointer' | 'focus' = 'pointer';
/** What `aria-describedby` of the node was before the tooltip added its own id. */
let describedBefore: string | null = null;

function ensureBox(): HTMLElement {
  if (!box) {
    box = el('div', { className: 'tooltip', id: 'tooltip', hidden: true });
    box.setAttribute('role', 'tooltip');
    document.body.append(box);
  }
  return box;
}

export function hideTip(): void {
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

function show(target: HTMLElement, by: 'pointer' | 'focus'): void {
  if (target === shownFor) return;
  // the node the tip leaves gets its own `aria-describedby` back
  if (shownFor) hideTip();
  // an open menu is what the player is reading: no tip over it
  if (document.querySelector('.person-menu')) return;
  const tip = ensureBox();
  tip.replaceChildren(el('strong', {}, target.getAttribute(ATTR_TITLE) ?? ''), el('span', {}, target.getAttribute(ATTR) ?? ''));
  tip.hidden = false;
  shownFor = target;
  shownBy = by;
  describedBefore = target.getAttribute('aria-describedby');
  target.setAttribute('aria-describedby', [describedBefore, 'tooltip'].filter(Boolean).join(' '));
  place(target, tip);
}

let mouse = { x: -1, y: -1 };

/**
 * The screen is drawn anew after a command and every day of the clock: a tooltip that was open follows the new copy of
 * its node (under the pointer, or on the focus), and goes if there is none.
 */
export function syncTip(): void {
  if (shownFor === null) return;
  const title = shownFor.getAttribute(ATTR_TITLE);
  const by = shownBy;
  // under a still pointer only the same thing keeps its tip: a new window must not answer for the old hover
  const under = holder(document.elementFromPoint(mouse.x, mouse.y));
  const target = by === 'pointer' ? (under?.getAttribute(ATTR_TITLE) === title ? under : null) : holder(document.activeElement);
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
    if (t) show(t, 'pointer');
    else hideTip();
  });
  // a redraw moves the focus off a node and back: only a tip that the focus itself opened closes with it
  document.addEventListener('focusin', (e) => {
    const t = holder(e.target);
    // a focus the program gives back after a redraw is not the keyboard: after a click it is not :focus-visible
    if (t) { if (t.matches(':focus-visible')) show(t, 'focus'); }
    else if (shownBy === 'focus') hideTip();
  });
  document.addEventListener('focusout', () => { if (shownBy === 'focus') hideTip(); });
  // a click did what the tip said: it must not lie over what the click opened
  document.addEventListener('click', hideTip);
  document.addEventListener('contextmenu', hideTip);
  document.addEventListener('mouseleave', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
}
