import { actionControl } from './access';
import { choiceNode } from './choice';
import { el } from './dom';
import type { WhereView } from './where-model';
import './where.css';

export interface WhereProps {
  view: WhereView;
  onStart: (actionId: string) => void;
  /** Present when a will can be written: a link that opens the will window. */
  onWill: (() => void) | null;
}

/**
 * The centre of the screen (D-438): the slot for the world map (later), the "where I am" block with the occupation and
 * the actions. The slot of the picture of the place stays empty until the art bible.
 */
export function wherePanel({ view, onStart, onWill }: WhereProps): HTMLElement {
  const block = el('section', { className: 'where' },
    el('div', { className: 'place-picture', ariaHidden: 'true' }, 'picture of the place'),
    el('div', { className: 'where-text' }, el('h2', { tabIndex: -1, id: 'where-heading' }, view.heading), ...(view.line ? [el('p', {}, view.line)] : [])));
  if (view.actions.length > 0) {
    const controls = view.actions.map((a, i) => actionControl(a, i));
    // no digit keys: without a window the digits pick the speed of the clock (D-448)
    const picks = view.actions.map((a) => (a.grey ? null : () => onStart(a.id)));
    const list = el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(c, picks[i] ?? null)));
    block.querySelector('.where-text')?.append(list);
    if (onWill) block.querySelector('.where-text')?.append(el('p', {}, el('button', { className: 'link', type: 'button', onclick: onWill }, 'Make a will…')));
  }
  return el('div', { className: 'center-slots' }, el('div', { className: 'map-slot' }, 'World map — later'), block);
}
