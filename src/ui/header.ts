import { el } from './dom';
import { HEADER_TIPS } from './tips';
import { withTip } from './tooltip';
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
  const button = withTip(el('button', { className: 'menu-button', type: 'button', onclick: onMenuToggle }, 'Menu ▾'), { title: 'Menu', text: 'Start a new game.' });
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

/**
 * The breakdown of the money is closed by Esc and by a click anywhere else (D-448); the header is drawn anew after each
 * command, which closes it too, so nothing is remembered between draws.
 */
function closeOnEscapeOrOutside(details: HTMLDetailsElement): void {
  const close = (e: Event) => {
    if (!details.isConnected) {
      document.removeEventListener('keydown', close);
      document.removeEventListener('click', close);
      return;
    }
    if (e instanceof KeyboardEvent ? e.key !== 'Escape' : details.contains(e.target as Node)) return;
    details.open = false;
  };
  document.addEventListener('keydown', close);
  document.addEventListener('click', close);
}

function figureNode(f: Figure): HTMLElement {
  const tip = HEADER_TIPS[f.label];
  const node = withTip(el('div', { className: 'figure' }, el('span', { className: 'figure-value' }, f.value), el('span', { className: 'figure-label' }, f.label)), tip ? { title: `${f.value} ${f.label}`, text: tip } : null);
  if (f.note === undefined) return node;
  if (!f.breakdown || f.breakdown.length === 0) {
    node.append(el('span', { className: 'figure-note' }, f.note));
    return node;
  }
  const details = el('details', { className: 'figure-breakdown' },
    el('summary', { className: 'figure-note' }, f.note),
    el('ul', {}, ...f.breakdown.map((line) => el('li', {}, line))));
  closeOnEscapeOrOutside(details);
  node.append(details);
  return node;
}

/** The header at the top right (D-438): the coat of arms slot, the shared figures, the menu. */
export function headerPanel(props: HeaderProps): HTMLElement {
  return el('header', { className: 'topbar' },
    withTip(el('div', { className: 'arms' }, 'arms'), { title: 'Coat of arms', text: 'The arms of your house; they are drawn once the art is ready.' }),
    ...props.figures.map(figureNode),
    menuNode(props));
}
