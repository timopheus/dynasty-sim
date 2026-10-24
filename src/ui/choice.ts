import type { Control } from './access';
import { applyAttrs, el } from './dom';
import { withTip } from './tooltip';

/**
 * A choice as one button (D-448): its name with the key, then inside it the note (chance, days) and, when grey, the
 * reason as text. Everything the player reads about the choice is in the button.
 */
export function choiceNode(c: Control, onPick: (() => void) | null): HTMLElement {
  const button = el('button', { className: onPick ? 'choice' : 'choice grey', type: 'button' }, el('span', { className: 'choice-name' }, c.text));
  if (c.note) button.append(el('span', { className: 'note', id: c.noteId }, c.note));
  if (!onPick) button.append(el('span', { className: 'reason', id: c.reasonId }, c.reason));
  applyAttrs(button, c.attrs);
  if (onPick) button.onclick = onPick;
  withTip(button, { title: c.text.replace(/^\d+\.\s*/, ''), text: [c.note, c.reason].filter(Boolean).join(' · ') || 'Your answer.' });
  return el('div', { className: onPick ? 'option' : 'unavailable' }, button);
}
