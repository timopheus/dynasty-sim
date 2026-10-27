import type { ChronicleEntry } from '../core/chronicle/log';
import type { Content } from '../core/content/schema';
import { findCharacter } from '../core/helpers';
import { holderOf, livingHeirlooms } from '../core/heirloom/heirloom';
import { houseById, renownWord } from '../core/house/house';
import { PROPOSE_MARRIAGE, PROPOSE_MATCH } from '../core/family/page';
import { entityPage } from '../core/pages/entity';
import type { PageSection, PersonPage, RelationLine } from '../core/pages/person';
import type { Ctx } from '../core/state';
import type { TextPart } from '../core/text/text';
import { toYmd } from '../core/time/calendar';
import { opinionLineText, withNumber } from './access';
import { ROW_TIPS, statTip, traitTip } from './tips';
import type { Tip } from './tips';
import { anyCharacter } from '../core/archive/archive';
import { kinship } from './people-model';
import { heirLine } from './will';

/** What a page of the side panel is made of. Pure data: the panel draws it, tests read it. */
export type Block =
  | { type: 'facts'; rows: { label: string; parts: TextPart[]; tip?: Tip }[] }
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'traits'; items: { name: string; tip: Tip | null }[] }
  | { type: 'chronicle'; entries: ChronicleEntry[]; own: string | null }
  /** The link to the whole chronicle of the page (D-448: the page is one sheet, the rest is behind a link). */
  | { type: 'whole' };

/** The tabs of the panel are kinds of pages (D-448): the person, their house. `id` null: that kind has nothing to show. */
export interface KindTab {
  label: string;
  id: string | null;
  active: boolean;
}

export interface SidebarPage {
  id: string;
  /** Kind of the page, shown above the title: Person, House, Heirloom. */
  kind: string;
  title: string;
  subtitle: string;
  /** The page as one sheet. */
  blocks: Block[];
  /** What the link "Whole chronicle" shows instead of the sheet. */
  whole: Block[];
  tabs: KindTab[];
  /** The menu of the person can be opened from the page: the button "Interact ▾" (D-448). */
  interact: boolean;
}

/** How many of the latest lines the sheet shows before the link to the whole chronicle. */
export const SHEET_LINES = 5;

const sexWord = (p: PersonPage) => (p.sex === 'male' ? 'man' : 'woman');

function relationRows(lines: RelationLine[]): { label: string; parts: TextPart[]; tip?: Tip }[] {
  return lines.map((l) => {
    const end = l.person.dead ? ' (dead)' : l.endYear !== null ? ` (ended ${l.endYear})` : '';
    return { label: l.kind, parts: [{ id: l.person.id, name: l.person.name }, `${end}, since ${l.startYear}`] };
  });
}

/** Heir row of the hero's profile (D-018): who inherits now, or that the house would end. */
function heirRow(ctx: Ctx): { label: string; parts: TextPart[]; tip?: Tip } {
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

function chronicleBlocks(chronicle: ChronicleEntry[], own: string | null, events: ChronicleEntry[]): Block[] {
  const blocks: Block[] = [{ type: 'heading', text: 'Chronicle' }];
  blocks.push(chronicle.length ? { type: 'chronicle', entries: chronicle.slice().reverse(), own } : { type: 'text', text: 'Nothing recorded yet.' });
  if (events.length) blocks.push({ type: 'heading', text: 'All events' }, { type: 'chronicle', entries: events.slice().reverse(), own: null });
  return blocks;
}

/** The last lines of the chronicle and the link to all of it. */
function latelyBlocks(chronicle: ChronicleEntry[], own: string | null, more = false): Block[] {
  if (chronicle.length === 0) return [{ type: 'heading', text: 'Lately' }, { type: 'text', text: 'Nothing recorded yet.' }, ...(more ? [{ type: 'whole' } as Block] : [])];
  return [
    { type: 'heading', text: 'Lately' },
    { type: 'chronicle', entries: chronicle.slice(-SHEET_LINES).reverse(), own },
    ...(chronicle.length > SHEET_LINES || more ? [{ type: 'whole' } as Block] : []),
  ];
}

/** The page of a person as one sheet (D-448): who they are, traits, family, ties, the latest lines of the chronicle. */
function personSheet(ctx: Ctx, page: PersonPage): Block[] {
  const house = page.sections.find((s) => s.id === 'house');
  const family = page.sections.find((s) => s.id === 'family');
  const c = anyCharacter(ctx.state, page.id);
  const row = (label: string, parts: TextPart[]) => ({ label, parts, ...(ROW_TIPS[label] ? { tip: { text: ROW_TIPS[label] } } : {}) });
  const rows: { label: string; parts: TextPart[]; tip?: Tip }[] = [
    row('Age', [[sexWord(page), page.life, page.alive ? '' : 'dead'].filter(Boolean).join(' · ')]),
  ];
  if (page.occupation) rows.push(row('Occupation', [page.occupation]));
  for (const l of house?.lines ?? []) rows.push(row(l.label, l.parts));
  if (page.fame) rows.push(row('Fame', [page.fame]));
  if (page.conditions !== null) rows.push(row('Health', [page.conditions || 'healthy']));
  if (page.money !== null) rows.push(row('Money', [`${page.money} crowns`]));
  for (const s of page.stats ?? []) {
    const shown = withNumber(s.word, s.value);
    const tip = statTip(ctx, s.value !== null ? c : null, s.id);
    rows.push({ label: s.label, parts: [shown], ...(tip ? { tip } : {}) });
  }
  if (page.id === ctx.state.playerId) rows.push(heirRow(ctx));
  if (page.death) rows.push({ label: 'Death', parts: [`${page.death.year}${page.death.cause ? `. ${page.death.cause}` : ''}`] });
  const blocks: Block[] = [{ type: 'facts', rows }];
  if (page.traits.length) blocks.push({ type: 'heading', text: 'Traits' }, { type: 'traits', items: page.traits.map((name) => ({ name, tip: traitTip(ctx.content, name) })) });
  if (page.secrets.length) blocks.push({ type: 'text', text: `Secrets you know: ${page.secrets.join(', ')}.` });
  if (page.opinion) {
    const o = page.opinion;
    blocks.push({ type: 'heading', text: 'Opinion of you' }, { type: 'text', text: withNumber(o.word, o.value) });
    if (o.lines.length) blocks.push({ type: 'facts', rows: o.lines.map((l) => ({ label: '', parts: [opinionLineText(l)] })) });
  }
  const kin = (family?.lines ?? []).filter((l) => proposalLabels.indexOf(l.label) < 0);
  if (kin.length) blocks.push({ type: 'heading', text: 'Family' }, { type: 'facts', rows: kin.map((l) => ({ label: l.label, parts: l.parts, ...(ROW_TIPS[l.label] ? { tip: { text: ROW_TIPS[l.label] ?? '' } } : {}) })) });
  if (page.allies.length) blocks.push({ type: 'heading', text: 'Allies' }, { type: 'facts', rows: relationRows(page.allies) });
  if (page.rivals.length) blocks.push({ type: 'heading', text: 'Rivals' }, { type: 'facts', rows: relationRows(page.rivals) });
  // the small events of the journal are behind the link too, however few lines the chronicle has
  blocks.push(...latelyBlocks(page.chronicle, page.id, page.journal.length > 0));
  return blocks;
}

const proposalLabels: string[] = [PROPOSE_MARRIAGE, PROPOSE_MATCH];

function houseSheet(ctx: Ctx, id: string, facts: { label: string; parts: TextPart[] }[], chronicle: ChronicleEntry[]): Block[] {
  const { state, content } = ctx;
  const house = houseById(state, id);
  const overview = facts.filter((f) => ['Status', 'Founded', 'Living'].includes(f.label));
  if (house) {
    const word = renownWord(content, house.renown);
    const at = overview.findIndex((f) => f.label === 'Status');
    overview.splice(at + 1, 0, { label: 'Renown', parts: [withNumber(word || 'Unknown', house.renown)] });
  }
  const heads = (house?.heads ?? []).map((h) => ({
    label: `${toYmd(h.from).year}–${h.to === null ? '' : toYmd(h.to).year}`,
    parts: [{ id: h.id, name: h.name }, ...(h.nickname !== null ? [`, ${h.nickname}`] : [])] as TextPart[],
  }));
  const things = livingHeirlooms(state).flatMap((h) => {
    const holder = holderOf(state, h);
    const who = holder === null ? null : findCharacter(state, holder);
    if (!who || who.house !== id) return [];
    return [{ label: 'Held', parts: [{ id: h.id, name: h.name }, ' — with ', { id: who.id, name: `${who.givenName} ${who.surname}` }] as TextPart[] }];
  });
  const blocks: Block[] = [{ type: 'facts', rows: overview.map((r) => ({ ...r, ...(ROW_TIPS[r.label] ? { tip: { text: ROW_TIPS[r.label] ?? '' } } : {}) })) }];
  if (heads.length) blocks.push({ type: 'heading', text: 'Heads' }, { type: 'facts', rows: heads });
  if (things.length) blocks.push({ type: 'heading', text: 'Heirlooms' }, { type: 'facts', rows: things });
  blocks.push(...latelyBlocks(chronicle, null));
  return blocks;
}

/**
 * The page of an entity as the side panel shows it: one sheet for a person, a house, an heirloom (D-448); a page of an
 * unknown id says so. `lastPerson` is the person the tab "Person" goes back to from a house. Pure.
 */
export function sidebarPage(ctx: Ctx, id: string, lastPerson: string = ctx.state.playerId): SidebarPage {
  const found = entityPage(ctx, id);
  const none = { whole: [], tabs: [], interact: false };
  if (!found) return { id, kind: 'Page', title: 'Nobody by that name', subtitle: '', blocks: [{ type: 'text', text: 'There is nothing at this address.' }], ...none };
  if (found.type === 'person') {
    const p = found.page;
    const houseId = anyCharacter(ctx.state, id)?.house ?? null;
    const tabs: KindTab[] = [{ label: 'Person', id, active: true }, ...(houseId ? [{ label: 'House', id: houseId, active: false }] : [])];
    return {
      id, kind: 'Person', title: p.name, subtitle: kinship(ctx, id), blocks: personSheet(ctx, p),
      whole: chronicleBlocks(p.chronicle, p.id, p.journal), tabs, interact: id !== ctx.state.playerId && p.alive,
    };
  }
  const e = found.page;
  if (e.kind === 'house') {
    const tabs: KindTab[] = [{ label: 'Person', id: lastPerson, active: false }, { label: 'House', id, active: true }];
    return { id, kind: 'House', title: e.title, subtitle: e.subtitle, blocks: houseSheet(ctx, id, e.facts, e.chronicle), whole: chronicleBlocks(e.chronicle, null, []), tabs, interact: false };
  }
  const blocks: Block[] = [{ type: 'facts', rows: e.facts }];
  if (e.chronicle.length) blocks.push({ type: 'heading', text: 'Chronicle' }, { type: 'chronicle', entries: e.chronicle.slice().reverse(), own: null });
  return { id, kind: 'Heirloom', title: e.title, subtitle: e.subtitle, blocks, whole: [], tabs: [], interact: false };
}

/** Moves the trail of visited pages to `id`: the same page stays, an earlier one cuts the trail back to it, a new one is added. */
export function visit(trail: readonly string[], id: string): string[] {
  const at = trail.indexOf(id);
  return at >= 0 ? trail.slice(0, at + 1) : [...trail, id];
}
