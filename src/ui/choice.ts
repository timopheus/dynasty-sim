import type { Control } from './access';
import { applyAttrs, el } from './dom';

/** A choice button built from its pure description: key and name, a note beside it, the reason as text when grey. */
export function choiceNode(c: Control, onPick: (() => void) | null): HTMLElement {
  const button = el('button', { className: onPick ? 'choice' : 'choice grey', type: 'button' }, c.text);
  applyAttrs(button, c.attrs);
  if (onPick) button.onclick = onPick;
  const note = c.note ? el('span', { className: 'note', id: c.noteId }, c.note) : '';
  if (onPick) return el('div', { className: 'option' }, button, note);
  return el('div', { className: 'unavailable' }, button, note, el('span', { className: 'reason', id: c.reasonId }, c.reason));
}
