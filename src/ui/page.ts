import type { ChronicleEntry } from '../core/chronicle/log';
import type { PersonPage, RelationLine } from '../core/pages/person';
import type { TextPart } from '../core/text/text';
import { formatDate } from '../core/time/calendar';
import { personHref } from './address';

type Make = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]>, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];

/** Text parts of a chronicle line: strings as they are, references as links to the page (D-020). */
export function partNodes(make: Make, parts: readonly TextPart[]): (Node | string)[] {
  return parts.map((p) => (typeof p === 'string' ? p : make('a', { href: personHref(p.id), className: 'person' }, p.name)));
}

export function entryItem(make: Make, e: ChronicleEntry): HTMLElement {
  return make('li', {}, make('span', { className: 'date' }, formatDate(e.day)), ...partNodes(make, e.parts));
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

/** The page of a person (2.10): only what the player may know; the numbers sit in hover texts (D-031). */
export function pageView(make: Make, page: PersonPage | null): HTMLElement {
  if (!page) {
    return make('section', { className: 'page' }, make('p', { className: 'meta' }, make('a', { href: '#' }, '← Your house')), make('h1', {}, 'Nobody by that name'));
  }
  const intro = [sexWord(page), page.life, page.fame, page.occupation ?? ''].filter(Boolean).join(' · ');
  const knowledge: Record<string, string> = { self: 'Yours', close: 'A close acquaintance', known: 'An acquaintance', stranger: 'A stranger to you' };
  const nodes: (Node | string)[] = [
    make('p', { className: 'meta' }, make('a', { href: '#' }, '← Your house')),
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
      make('dd', s.value === null ? {} : { title: String(s.value) }, s.word),
    ])));
  }
  if (page.secrets.length) nodes.push(make('p', {}, `Secrets you know: ${page.secrets.join(', ')}.`));
  if (page.opinion) {
    const o = page.opinion;
    nodes.push(
      make('h2', {}, 'Opinion of you'),
      make('p', o.value === null ? {} : { title: String(o.value) }, o.word),
      ...(o.lines.length
        ? [make('ul', { className: 'plain' }, ...o.lines.map((l) =>
            make('li', l.value === null ? {} : { title: String(l.value) },
              `${l.text}${l.year !== null ? `, ${l.year}` : ''}${l.lasting ? ' (never fades)' : ''}`)))]
        : []),
    );
  }
  const allies = refList(make, 'Allies', page.allies);
  const rivals = refList(make, 'Rivals', page.rivals);
  if (allies) nodes.push(allies);
  if (rivals) nodes.push(rivals);
  for (const [label, entries] of [['In the chronicle', page.chronicle], ['In the journal', page.journal]] as const) {
    if (entries.length) nodes.push(make('h2', {}, label), make('ul', { className: 'chronicle' }, ...entries.slice().reverse().map((e) => entryItem(make, e))));
  }
  return make('section', { className: 'page' }, ...nodes);
}
