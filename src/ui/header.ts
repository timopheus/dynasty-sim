import { el } from './dom';
import { withTip } from './tooltip';
import type { Figure } from './header-model';
import './header.css';
import { tr } from './i18n';

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

/** The menu of the game (New game…), also on screens without the header (the early years). */
export function menuNode({ menuOpen, onMenuToggle, items, devNotes }: Pick<HeaderProps, 'menuOpen' | 'onMenuToggle' | 'items' | 'devNotes'>): HTMLElement {
  const button = el('button', { className: 'menu-button', type: 'button', onclick: onMenuToggle }, tr('Menu ▾'));
  button.setAttribute('aria-expanded', String(menuOpen));
  button.setAttribute('aria-controls', 'menu-list');
  button.setAttribute('data-focus', 'menu');
  withTip(button, { title: tr('Menu'), text: tr('A new game, the language and the other settings of the game.') });
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
  const node = withTip(el('div', { className: 'figure' }, el('span', { className: 'figure-value' }, f.value), el('span', { className: 'figure-label' }, tr(f.label))), f.tip);
  if (f.note === undefined) return node;
  if (!f.breakdown || f.breakdown.length === 0) {
    node.append(el('span', { className: 'figure-note' }, f.note));
    return node;
  }
  const details = el('details', { className: 'figure-breakdown' },
    Object.assign(el('summary', { className: 'figure-note' }, f.note), { id: `figure-note-${f.label.replace(/\W+/g, '-')}` }),
    el('ul', {}, ...f.breakdown.map((line) => el('li', {}, line))));
  closeOnEscapeOrOutside(details);
  node.append(details);
  return node;
}

/** The header at the top right (D-438): the coat of arms slot, the shared figures, the menu. */
export function headerPanel(props: HeaderProps): HTMLElement {
  return el('header', { className: 'topbar' },
    el('div', { className: 'arms' }, tr('arms')),
    ...props.figures.map(figureNode),
    menuNode(props));
}
