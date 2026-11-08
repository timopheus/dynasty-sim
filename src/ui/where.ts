import { daysWord } from '../core/pages/place';
import { hrefOf } from './address';
import { el } from './dom';
import type { WhereView } from './where-model';
import './where.css';

/**
 * The centre of the screen (D-438, D-443): the map takes all the room the block "where I am" leaves; the block sits at the
 * bottom with the picture of the place (a placeholder until the art bible), the table of the place and what is going on.
 * The name of the place and the places the hero can go to are links to their pages in the side panel (S.9).
 */
export function wherePanel(view: WhereView): HTMLElement {
  const table = el('dl', { className: 'place-table' }, ...view.table.map((r) => el('div', {}, el('dt', {}, r.label), el('dd', {}, r.value))));
  const title = view.place ? el('a', { href: hrefOf(view.place.id), className: 'place-name' }, view.title) : el('span', { className: 'place-name' }, view.title);
  const roads: (Node | string)[] = view.goTo.flatMap((g, i) => [i > 0 ? ' · ' : '', el('a', { href: hrefOf(g.id), className: 'place-link' }, g.name), ` ${daysWord(g.days).replace(' ', '\u00a0')}`]);
  const block = el('section', { className: 'where', ariaLabel: 'Where you are' },
    el('div', { className: 'place-picture', ariaHidden: 'true' }, 'picture of the place'),
    el('div', { className: 'where-text' },
      ...(view.title ? [el('p', { className: 'place-head' }, title, el('span', { className: 'place-status' }, ` — ${view.status}`))] : []),
      table,
      ...(view.description ? [el('p', { className: 'place-line' }, view.description)] : []),
      el('h2', { tabIndex: -1, id: 'where-heading' }, view.heading),
      ...(view.line ? [el('p', {}, view.line)] : []),
      ...(roads.length > 0 ? [el('p', { className: 'place-roads' }, 'Nearby: ', ...roads)] : [])));
  return el('div', { className: 'center-slots' }, el('div', { className: 'map-slot' }, 'World map — later'), block);
}
