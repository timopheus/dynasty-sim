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

function show(target: HTMLElement): void {
  if (target === shownFor) return;
  // the node the tip leaves gets its own `aria-describedby` back
  if (shownFor) hideTip();
  // an open menu is what the player is reading: no tip over it
  if (document.querySelector('.person-menu')) { hideTip(); return; }
  const tip = ensureBox();
  tip.replaceChildren(el('strong', {}, target.getAttribute(ATTR_TITLE) ?? ''), el('span', {}, target.getAttribute(ATTR) ?? ''));
  tip.hidden = false;
  shownFor = target;
  describedBefore = target.getAttribute('aria-describedby');
  target.setAttribute('aria-describedby', [describedBefore, 'tooltip'].filter(Boolean).join(' '));
  place(target, tip);
}

let mouse = { x: -1, y: -1 };

/**
 * The screen is drawn anew after a command and every day of the clock: a tooltip that was open follows the new copy of
 * its node (under the pointer or on the focus), and goes if there is none.
 */
export function syncTip(): void {
  if (shownFor === null) return;
  const target = holder(document.activeElement) ?? holder(document.elementFromPoint(mouse.x, mouse.y));
  shownFor = null;
  if (target) show(target);
  else hideTip();
}

const holder = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>(`[${ATTR}]`) : null);

/** Once per page: tooltips by delegation, so the panels that are drawn anew after each command need no wiring. */
export function installTooltips(): void {
  document.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
  document.addEventListener('mouseover', (e) => { const t = holder(e.target); if (t) show(t); else hideTip(); });
  document.addEventListener('focusin', (e) => { const t = holder(e.target); if (t) show(t); else hideTip(); });
  document.addEventListener('focusout', hideTip);
  // a click did what the tip said: it must not lie over what the click opened
  document.addEventListener('click', hideTip);
  document.addEventListener('contextmenu', hideTip);
  document.addEventListener('mouseleave', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
}
