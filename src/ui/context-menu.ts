import { applyAttrs, el } from './dom';
import type { MenuItem, PersonMenu } from './people-model';
import './context-menu.css';

/** Where the menu of a person is open (session state): at a point of the screen, for a person, and who opened it. */
export interface MenuAnchor {
  id: string;
  x: number;
  y: number;
  /** `data-focus` key of the control that opened it by keyboard or button; focus returns there on close. */
  from: string | null;
}

/** Attribute that marks a node as a person: right click, the menu key and Shift+F10 on it open the person's menu. */
export const PERSON_ATTR = 'data-person';

export function markPerson<T extends HTMLElement>(node: T, id: string): T {
  node.setAttribute(PERSON_ATTR, id);
  // where focus returns to when the menu closes; a control that has its own key keeps it
  if (!node.hasAttribute('data-focus')) node.setAttribute('data-focus', `person:${id}`);
  return node;
}

export function personOf(target: EventTarget | null): string | null {
  return target instanceof Element ? (target.closest(`[${PERSON_ATTR}]`)?.getAttribute(PERSON_ATTR) ?? null) : null;
}

/** The menu of a person (D-448). Grey lines stay in it with their reason; arrows move, Enter chooses, Esc closes. */
export function personMenuNode(menu: PersonMenu, anchor: MenuAnchor, onChoose: (item: MenuItem) => void): HTMLElement {
  const list = el('div', { className: 'person-menu', role: 'menu' }, el('p', { className: 'menu-title' }, menu.title));
  list.setAttribute('aria-label', `What to do with ${menu.title}`);
  list.style.left = `${anchor.x}px`;
  list.style.top = `${anchor.y}px`;
  menu.items.forEach((item, i) => {
    const button = el('button', { className: item.grey ? 'menu-item grey' : 'menu-item', type: 'button', role: 'menuitem' }, el('span', {}, item.label));
    const small = item.grey ? item.reason : item.note;
    if (small) button.append(el('small', {}, small));
    button.setAttribute('data-focus', `menu-item-${i}`);
    if (item.grey) applyAttrs(button, { 'aria-disabled': 'true' });
    else button.onclick = () => onChoose(item);
    list.append(button);
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll<HTMLElement>('.menu-item')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to === null || items.length === 0) return;
    e.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  });
  return list;
}

/** Keeps the open menu inside the window once it has its size. */
export function keepInView(node: HTMLElement): void {
  const r = node.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
  const top = Math.max(8, Math.min(r.top, window.innerHeight - r.height - 8));
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
}
