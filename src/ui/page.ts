import type { TextPart } from '../core/text/text';
import { hrefOf } from './address';
import type { EntryView } from './entry';
import type { Make } from './dom';
import { markPerson } from './context-menu';
import { el } from './dom';
import type { Tip } from './tips';
import { withTip } from './tooltip';
import { wordOf } from '../core/entities/registry';
import { dateText, localName, tr } from './i18n';

let personTipOf: (id: string) => Tip | null = () => null;

/** The screen sets, before each draw, how a name explains itself (who the person is to the hero): D-448. */
export function usePersonTips(resolve: (id: string) => Tip | null): void {
  personTipOf = resolve;
}

/** The tip of a link to a house or a place, whose name says the most: what it is, and that a click opens its page. */
function linkTip(id: string, name: string): Tip | null {
  const kind = wordOf(id);
  const crumb = kind === 'house' ? tr('House') : kind === 'place' ? tr('Place') : null;
  return crumb ? { title: name, crumb, text: '', mouse: [{ button: 'left', text: kind === 'house' ? tr('Open the page') : tr('Open the page of the place') }] } : null;
}

/** Text parts of a chronicle line: strings as they are, references as links to the page (D-020). */
export function partNodes(make: Make, parts: readonly TextPart[]): (Node | string)[] {
  return parts.map((p) => {
    if (typeof p === 'string') return p;
    // the name in the language chosen, in the case the line put it in (RU.1)
    const link = make('a', { href: hrefOf(p.id), className: 'person' }, localName(p.name, p.case ?? 'nom'));
    const found = personTipOf(p.id);
    if (!found) return withTip(link, linkTip(p.id, link.textContent ?? p.name));
    // the title repeats the name, as CK3 does (D-477)
    // a person's name opens the menu of the person on a right click (D-448)
    return withTip(/^c\d+$/.test(p.id) ? markPerson(link, p.id) : link, found);
  });
}

/** A line of the chronicle: its date, the marks ◆ (the circle's) and ▸ (the player's choice), the text with links. */
export function entryNode(v: EntryView, day: number): HTMLElement {
  return el('li', {}, el('span', { className: 'date' }, dateText(day)), v.world ? '◆ ' : '', ...partNodes(el, v.parts), v.mark ? ' ▸' : '');
}
