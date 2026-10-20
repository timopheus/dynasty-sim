import { el } from './dom';
import type { Figure } from './header-model';
import './header.css';

export interface MenuItem {
  label: string;
  onClick: () => void;
}

export interface HeaderProps {
  figures: Figure[];
  menuOpen: boolean;
  onMenuToggle: () => void;
  items: MenuItem[];
  /** Developer notes of `?dev=1` (the seed); empty for a player. */
  devNotes: string[];
}

function menuNode({ menuOpen, onMenuToggle, items, devNotes }: HeaderProps): HTMLElement {
  const button = el('button', { className: 'menu-button', type: 'button', onclick: onMenuToggle }, 'Menu ▾');
  button.setAttribute('aria-expanded', String(menuOpen));
  button.setAttribute('aria-controls', 'menu-list');
  button.setAttribute('data-focus', 'menu');
  const node = el('div', { className: 'menu' }, button);
  if (menuOpen) {
    node.append(el('div', { className: 'menu-list', id: 'menu-list' },
      ...items.map((i) => el('button', { className: 'link', type: 'button', onclick: i.onClick }, i.label)),
      ...devNotes.map((n) => el('span', { className: 'dev-seed' }, n))));
  }
  return node;
}

/** The header at the top right (D-438): the coat of arms slot, the shared figures, the menu. */
export function headerPanel(props: HeaderProps): HTMLElement {
  return el('header', { className: 'topbar' },
    el('div', { className: 'arms' }, 'arms'),
    ...props.figures.map((f) => el('div', { className: 'figure' }, el('span', { className: 'figure-value' }, f.value), el('span', { className: 'figure-label' }, f.label))),
    menuNode(props));
}
