import type { TextPart } from '../core/text/text';
import { formatDate } from '../core/time/calendar';
import { hrefOf } from './address';
import type { EntryView } from './entry';
import type { Make } from './dom';
import { el } from './dom';

/** Text parts of a chronicle line: strings as they are, references as links to the page (D-020). */
export function partNodes(make: Make, parts: readonly TextPart[]): (Node | string)[] {
  return parts.map((p) => (typeof p === 'string' ? p : make('a', { href: hrefOf(p.id), className: 'person' }, p.name)));
}

/** A line of the chronicle: its date, the marks ◆ (the circle's) and ▸ (the player's choice), the text with links. */
export function entryNode(v: EntryView, day: number): HTMLElement {
  return el('li', {}, el('span', { className: 'date' }, formatDate(day)), v.world ? '◆ ' : '', ...partNodes(el, v.parts), v.mark ? ' ▸' : '');
}
