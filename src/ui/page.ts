import type { Command } from '../core/game';
import type { ChronicleEntry } from '../core/chronicle/log';
import type { AnyPage, EntityPage } from '../core/pages/entity';
import type { PageSection, PersonPage, RelationLine } from '../core/pages/person';
import type { TextPart } from '../core/text/text';
import { formatDate } from '../core/time/calendar';
import { hrefOf, personHref } from './address';
import { opinionLineText, withNumber } from './access';
import { entryView } from './entry';

type Make = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]>, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];

/** Text parts of a chronicle line: strings as they are, references as links to the page (D-020). */
export function partNodes(make: Make, parts: readonly TextPart[]): (Node | string)[] {
  return parts.map((p) => (typeof p === 'string' ? p : make('a', { href: hrefOf(p.id), className: 'person' }, p.name)));
}

export function entryItem(make: Make, e: ChronicleEntry, own: string | null, heads: ReadonlySet<string>): HTMLElement {
  const v = entryView(e, own, heads);
  return make('li', {}, make('span', { className: 'date' }, formatDate(e.day)), v.world ? '◆ ' : '', ...partNodes(make, v.parts), v.mark ? ' ▸' : '');
}

function relationItem(make: Make, line: RelationLine): HTMLElement {
  const end = line.person.dead ? ' (dead)' : line.endYear !== null ? ` (ended ${line.endYear})` : '';
  return make('li', {}, make('a', { href: personHref(line.person.id), className: 'person' }, line.person.name), `${end} · ${line.kind.toLowerCase()} since ${line.startYear}`);
}

function refList(make: Make, label: string, lines: RelationLine[]): HTMLElement | '' {
  if (lines.length === 0) return '';
  return make('section', {}, make('h2', {}, label), make('ul', { className: 'plain' }, ...lines.map((l) => relationItem(make, l))));
}

function sexWord(p: PersonPage): string {
  return p.sex === 'male' ? 'Man' : 'Woman';
}

function sectionNodes(make: Make, sections: readonly PageSection[]): (Node | string)[] {
  return sections.flatMap((s) => [
    make('h2', {}, s.title),
    make('dl', { className: 'facts' }, ...s.lines.flatMap((l) => [make('dt', {}, l.label), make('dd', {}, ...partNodes(make, l.parts))])),
  ]);
}

/** The common page of an entity that is not a person (D-311): facts and the lines of the chronicle about it. */
function entityView(make: Make, page: EntityPage, heads: ReadonlySet<string>): HTMLElement {
  return make(
    'section',
    { className: 'page' },
    make('p', { className: 'meta' }, make('a', { href: '#', className: 'back' }, '← Your house')),
    make('h1', {}, page.title),
    make('p', { className: 'meta' }, page.subtitle),
    ...(page.facts.length
      ? [make('dl', { className: 'facts' }, ...page.facts.flatMap((f) => [make('dt', {}, f.label), make('dd', {}, ...partNodes(make, f.parts))]))]
      : []),
    ...(page.chronicle.length
      ? [make('h2', {}, 'In the chronicle'), make('ul', { className: 'chronicle' }, ...page.chronicle.slice().reverse().map((e) => entryItem(make, e, null, heads)))]
      : []),
  );
}

/**
 * The page of a person (2.10) or of another entity (4.2): only what the player may know; the numbers sit beside the
 * words on request, hover is a bonus (D-031, D-248). `onCommand` sends a command from a button on the page
 * (proposals, 4.5); the page itself never changes the state.
 */
export function pageView(make: Make, shown: AnyPage | null, heads: ReadonlySet<string>, showNumbers = false, onCommand: (cmd: Command) => void = () => {}): HTMLElement {
  void onCommand;
  if (shown?.type === 'entity') return entityView(make, shown.page, heads);
  const page = shown?.page ?? null;
  if (!page) {
    return make('section', { className: 'page' }, make('p', { className: 'meta' }, make('a', { href: '#', className: 'back' }, '← Your house')), make('h1', {}, 'Nobody by that name'));
  }
  const intro = [sexWord(page), page.life, page.fame, page.occupation ?? ''].filter(Boolean).join(' · ');
  const knowledge: Record<string, string> = { self: 'Yours', close: 'A close acquaintance', known: 'An acquaintance', stranger: 'A stranger to you' };
  const nodes: (Node | string)[] = [
    make('p', { className: 'meta' }, make('a', { href: '#', className: 'back' }, '← Your house')),
    make('h1', {}, page.name),
    make('p', { className: 'meta' }, `${knowledge[page.level] ?? ''}${page.alive ? '' : ' · dead'}`),
    make('p', {}, intro),
  ];
  if (page.death) {
    nodes.push(make('p', {}, `Died ${page.death.year}${page.death.cause ? `. ${page.death.cause}` : '.'}`));
  }
  if (page.conditions) nodes.push(make('p', {}, `Health: ${page.conditions}.`));
  if (page.money !== null) nodes.push(make('p', {}, `Money ${page.money}.`));
  if (page.traits.length) nodes.push(make('p', {}, `Traits: ${page.traits.join(', ')}.`));
  if (page.stats) {
    nodes.push(make('dl', { className: 'stats' }, ...page.stats.flatMap((s) => [
      make('dt', {}, s.label),
      make('dd', s.value === null ? {} : { title: String(s.value) }, withNumber(s.word, s.value, showNumbers)),
    ])));
  }
  if (page.secrets.length) nodes.push(make('p', {}, `Secrets you know: ${page.secrets.join(', ')}.`));
  if (page.opinion) {
    const o = page.opinion;
    nodes.push(
      make('h2', {}, 'Opinion of you'),
      make('p', o.value === null ? {} : { title: String(o.value) }, withNumber(o.word, o.value, showNumbers)),
      ...(o.lines.length
        ? [make('ul', { className: 'plain' }, ...o.lines.map((l) =>
            make('li', l.value === null ? {} : { title: String(l.value) },
opinionLineText(l, showNumbers))))]
        : []),
    );
  }
  const allies = refList(make, 'Allies', page.allies);
  const rivals = refList(make, 'Rivals', page.rivals);
  if (allies) nodes.push(allies);
  if (rivals) nodes.push(rivals);
  for (const [label, entries, own] of [['In the chronicle', page.chronicle, page.id], ['In the journal', page.journal, null]] as const) {
    if (entries.length) nodes.push(make('h2', {}, label), make('ul', { className: 'chronicle' }, ...entries.slice().reverse().map((e) => entryItem(make, e, own, heads))));
  }
  nodes.push(...sectionNodes(make, page.sections));
  return make('section', { className: 'page' }, ...nodes);
}
