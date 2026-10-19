import type { ChronicleEntry } from '../core/chronicle/log';
import type { Content } from '../core/content/schema';
import { proposalButton } from '../core/family/page';
import type { ProposeOrder } from '../core/family/phases';
import { findCharacter } from '../core/helpers';
import { holderOf, livingHeirlooms } from '../core/heirloom/heirloom';
import { houseById, renownWord } from '../core/house/house';
import { entityPage } from '../core/pages/entity';
import type { PageSection, PersonPage, RelationLine } from '../core/pages/person';
import type { Ctx } from '../core/state';
import type { TextPart } from '../core/text/text';
import { toYmd } from '../core/time/calendar';
import { opinionLineText, withNumber } from './access';
import { heirLine } from './will';

/** What a tab of the side panel is made of. Pure data: the panel draws it, tests read it. */
export type Block =
  | { type: 'facts'; rows: { label: string; parts: TextPart[] }[] }
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'chronicle'; entries: ChronicleEntry[]; own: string | null }
  | { type: 'propose'; text: string; order: ProposeOrder };

export interface Tab {
  id: string;
  label: string;
  blocks: Block[];
}

export interface SidebarPage {
  id: string;
  /** Kind of the page, shown above the title: Person, House, Heirloom. */
  kind: string;
  title: string;
  subtitle: string;
  tabs: Tab[];
}

const sexWord = (p: PersonPage) => (p.sex === 'male' ? 'man' : 'woman');

function relationRows(lines: RelationLine[]): { label: string; parts: TextPart[] }[] {
  return lines.map((l) => {
    const end = l.person.dead ? ' (dead)' : l.endYear !== null ? ` (ended ${l.endYear})` : '';
    return { label: l.kind, parts: [{ id: l.person.id, name: l.person.name }, `${end}, since ${l.startYear}`] };
  });
}

/** Heir row of the hero's profile (D-018): who inherits now, or that the house would end. */
function heirRow(ctx: Ctx): { label: string; parts: TextPart[] } {
  const line = heirLine(ctx.state);
  if (!line) {
    const placeholder = ctx.content.succession?.temporaryHeir ?? true;
    return { label: 'Heir', parts: [placeholder ? 'nobody of the blood; a namesake from afar would take up the house' : 'nobody — the house would end with you'] };
  }
  return { label: 'Heir', parts: [{ id: line.id, name: line.name }, ` (${line.by})`] };
}

/** Names of the education traits among the names of a person's traits, from the content. */
function splitTraits(content: Content, names: string[]): { education: string[]; other: string[] } {
  const education = names.filter((n) => content.traits.some((t) => t.name === n && t.category === 'education'));
  return { education, other: names.filter((n) => !education.includes(n)) };
}

function personTabs(ctx: Ctx, page: PersonPage): Tab[] {
  const house = page.sections.find((s) => s.id === 'house');
  const family = page.sections.find((s) => s.id === 'family');
  const { education, other } = splitTraits(ctx.content, page.traits);
  const rows: { label: string; parts: TextPart[] }[] = [
    { label: 'Age', parts: [[sexWord(page), page.life, page.alive ? '' : 'dead'].filter(Boolean).join(' · ')] },
  ];
  if (page.occupation) rows.push({ label: 'Occupation', parts: [page.occupation] });
  for (const l of house?.lines ?? []) rows.push({ label: l.label, parts: l.parts });
  if (page.fame) rows.push({ label: 'Fame', parts: [page.fame] });
  if (page.conditions !== null) rows.push({ label: 'Health', parts: [page.conditions || 'healthy'] });
  if (page.money !== null) rows.push({ label: 'Money', parts: [`${page.money} crowns`] });
  for (const s of page.stats ?? []) rows.push({ label: s.label, parts: [withNumber(s.word, s.value)] });
  if (education.length) rows.push({ label: 'Education', parts: [education.join(', ')] });
  if (other.length) rows.push({ label: 'Traits', parts: [other.join(', ')] });
  if (page.id === ctx.state.playerId) rows.push(heirRow(ctx));
  if (page.death) rows.push({ label: 'Death', parts: [`${page.death.year}${page.death.cause ? `. ${page.death.cause}` : ''}`] });
  const profile: Block[] = [{ type: 'facts', rows }];
  if (page.secrets.length) profile.push({ type: 'text', text: `Secrets you know: ${page.secrets.join(', ')}.` });
  if (page.opinion) {
    const o = page.opinion;
    profile.push({ type: 'heading', text: 'Opinion of you' }, { type: 'text', text: withNumber(o.word, o.value) });
    if (o.lines.length) {
      profile.push({
        type: 'facts',
        rows: o.lines.map((l) => ({ label: '', parts: [opinionLineText(l)] })),
      });
    }
  }
  return [
    { id: 'profile', label: 'Profile', blocks: profile },
    { id: 'family', label: 'Family', blocks: familyBlocks(family) },
    { id: 'people', label: 'People', blocks: peopleBlocks(page) },
    { id: 'chronicle', label: 'Chronicle', blocks: chronicleBlocks(page.chronicle, page.id, page.journal) },
  ];
}

function familyBlocks(family: PageSection | undefined): Block[] {
  const facts = (family?.lines ?? []).filter((l) => proposalButton(l) === null);
  const blocks: Block[] = [];
  if (facts.length) blocks.push({ type: 'facts', rows: facts.map((l) => ({ label: l.label, parts: l.parts })) });
  for (const l of family?.lines ?? []) {
    const b = proposalButton(l);
    if (b) blocks.push({ type: 'propose', text: b.text, order: b.order });
  }
  return blocks.length ? blocks : [{ type: 'text', text: 'No family known.' }];
}

function peopleBlocks(page: PersonPage): Block[] {
  const blocks: Block[] = [];
  if (page.allies.length) blocks.push({ type: 'heading', text: 'Allies' }, { type: 'facts', rows: relationRows(page.allies) });
  if (page.rivals.length) blocks.push({ type: 'heading', text: 'Rivals' }, { type: 'facts', rows: relationRows(page.rivals) });
  return blocks.length ? blocks : [{ type: 'text', text: 'No ties known.' }];
}

function chronicleBlocks(chronicle: ChronicleEntry[], own: string | null, events: ChronicleEntry[]): Block[] {
  const blocks: Block[] = [{ type: 'heading', text: 'Chronicle' }];
  blocks.push(chronicle.length ? { type: 'chronicle', entries: chronicle.slice().reverse(), own } : { type: 'text', text: 'Nothing recorded yet.' });
  if (events.length) blocks.push({ type: 'heading', text: 'All events' }, { type: 'chronicle', entries: events.slice().reverse(), own: null });
  return blocks;
}

function houseTabs(ctx: Ctx, id: string, facts: { label: string; parts: TextPart[] }[], chronicle: ChronicleEntry[]): Tab[] {
  const { state, content } = ctx;
  const house = houseById(state, id);
  const overview = facts.filter((f) => ['Status', 'Founded', 'Living'].includes(f.label));
  if (house) {
    const word = renownWord(content, house.renown);
    const at = overview.findIndex((f) => f.label === 'Status');
    overview.splice(at + 1, 0, { label: 'Renown', parts: [withNumber(word || 'Unknown', house.renown)] });
  }
  const heads: Block = {
    type: 'facts',
    rows: (house?.heads ?? []).map((h) => ({
      label: `${toYmd(h.from).year}–${h.to === null ? '' : toYmd(h.to).year}`,
      parts: [{ id: h.id, name: h.name }, ...(h.nickname !== null ? [`, ${h.nickname}`] : [])],
    })),
  };
  const things = livingHeirlooms(state).flatMap((h) => {
    const holder = holderOf(state, h);
    const who = holder === null ? null : findCharacter(state, holder);
    if (!who || who.house !== id) return [];
    return [{ label: 'Held', parts: [{ id: h.id, name: h.name }, ' — with ', { id: who.id, name: `${who.givenName} ${who.surname}` }] as TextPart[] }];
  });
  return [
    { id: 'overview', label: 'Overview', blocks: [{ type: 'facts', rows: overview }] },
    { id: 'heads', label: 'Heads', blocks: heads.rows.length ? [heads] : [{ type: 'text', text: 'No heads recorded.' }] },
    { id: 'heirlooms', label: 'Heirlooms', blocks: things.length ? [{ type: 'facts', rows: things }] : [{ type: 'text', text: 'No heirlooms held.' }] },
    { id: 'chronicle', label: 'Chronicle', blocks: chronicleBlocks(chronicle, null, []) },
  ];
}

/** The page of an entity as the side panel shows it: a person, a house, an heirloom; `missing` for an unknown id. Pure. */
export function sidebarPage(ctx: Ctx, id: string): SidebarPage {
  const found = entityPage(ctx, id);
  if (!found) return { id, kind: 'Page', title: 'Nobody by that name', subtitle: '', tabs: [{ id: 'overview', label: 'Overview', blocks: [{ type: 'text', text: 'There is nothing at this address.' }] }] };
  if (found.type === 'person') {
    const p = found.page;
    const knowledge: Record<string, string> = { self: 'Yours', close: 'A close acquaintance', known: 'An acquaintance', stranger: 'A stranger to you' };
    return { id, kind: 'Person', title: p.name, subtitle: knowledge[p.level] ?? '', tabs: personTabs(ctx, p) };
  }
  const e = found.page;
  if (e.kind === 'house') return { id, kind: 'House', title: e.title, subtitle: e.subtitle, tabs: houseTabs(ctx, id, e.facts, e.chronicle) };
  const blocks: Block[] = [{ type: 'facts', rows: e.facts }];
  if (e.chronicle.length) blocks.push({ type: 'heading', text: 'Chronicle' }, { type: 'chronicle', entries: e.chronicle.slice().reverse(), own: null });
  return { id, kind: 'Heirloom', title: e.title, subtitle: e.subtitle, tabs: [{ id: 'overview', label: 'Overview', blocks }] };
}

/** Moves the trail of visited pages to `id`: the same page stays, an earlier one cuts the trail back to it, a new one is added. */
export function visit(trail: readonly string[], id: string): string[] {
  const at = trail.indexOf(id);
  return at >= 0 ? trail.slice(0, at + 1) : [...trail, id];
}
