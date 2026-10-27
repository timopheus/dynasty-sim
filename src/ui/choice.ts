import type { Control } from './access';
import { applyAttrs, el } from './dom';

/**
 * A choice as one button (D-448): its name with the key, then inside it the note (chance, days) and, when grey, the
 * reason as text. Everything the player reads about the choice is in the button, so it has no tip (D-465).
 */
export function choiceNode(c: Control, onPick: (() => void) | null): HTMLElement {
  const button = el('button', { className: onPick ? 'choice' : 'choice grey', type: 'button' }, el('span', { className: 'choice-name' }, c.text));
  if (c.note) button.append(el('span', { className: 'note', id: c.noteId }, c.note));
  if (!onPick) button.append(el('span', { className: 'reason', id: c.reasonId }, c.reason));
  applyAttrs(button, c.attrs);
  if (onPick) button.onclick = onPick;
  // no tip: the note and the reason are in the button already (D-465); S.10 moves the chance and the outcome into a tip
  // (D-463). The clock redraws the window every day: this is how the focus finds its button again (keepView)
  button.setAttribute('data-focus', `choice-${c.noteId.replace(/-note$/, '')}`);
  return el('div', { className: onPick ? 'option' : 'unavailable' }, button);
}
