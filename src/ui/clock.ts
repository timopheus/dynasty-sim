import { el } from './dom';
import './clock.css';

/**
 * The date and the slot for the time player at the bottom right (D-438). The player comes in S.8: the buttons are there
 * but off, marked "soon", so nothing looks broken and nothing pretends to work.
 */
export function clockPanel(date: string): HTMLElement {
  const buttons = ['Pause', '×1', '×2', '×5'].map((label) => {
    const b = el('button', { className: 'clock-button', type: 'button', disabled: true }, label);
    b.setAttribute('aria-label', `${label} (soon)`);
    return b;
  });
  return el('div', { className: 'clock' },
    el('span', { className: 'date' }, date),
    el('span', { className: 'clock-buttons' }, ...buttons),
    el('span', { className: 'clock-soon' }, 'time controls: soon'));
}
