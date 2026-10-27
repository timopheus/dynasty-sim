import { el } from './dom';
import type { WhereView } from './where-model';
import './where.css';

/**
 * The centre of the screen (D-438, D-443): the map takes all the room the block "where I am" leaves; the block sits at the
 * bottom with the picture of the place (a placeholder until the art bible), the table of the place and what is going on.
 */
export function wherePanel(view: WhereView): HTMLElement {
  const table = el('dl', { className: 'place-table' }, ...view.table.flatMap((r) => [el('dt', {}, r.label), el('dd', {}, r.value)]));
  const block = el('section', { className: 'where' },
    el('div', { className: 'place-picture', ariaHidden: 'true' }, 'picture of the place'),
    el('div', { className: 'where-text' },
      table,
      el('h2', { tabIndex: -1, id: 'where-heading' }, view.heading),
      ...(view.line ? [el('p', {}, view.line)] : [])));
  return el('div', { className: 'center-slots' }, el('div', { className: 'map-slot' }, 'World map — later'), block);
}
