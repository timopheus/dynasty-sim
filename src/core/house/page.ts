import { allChronicle } from '../archive/archive';
import { fullName, isAlive } from '../character/character';
import type { ChronicleEntry } from '../chronicle/log';
import type { EntityPage } from '../pages/entity';
import type { PageSection, PersonSection } from '../pages/person';
import type { Ctx } from '../state';
import type { TextPart } from '../text/text';
import { isNear } from '../world/world';
import { toYmd } from '../time/calendar';
import { houseById, nicknameOf, renownWord, statusName } from './house';

/** Section of the page of a person about their house and nickname (4.7). Both are public: any level sees them. */
export const houseSection: PersonSection = (ctx, c): PageSection | null => {
  const lines: PageSection['lines'] = [];
  const house = houseById(ctx.state, c.house);
  if (house) lines.push({ label: 'House', parts: [{ id: house.id, name: house.name }] });
  const nickname = nicknameOf(ctx.content, c);
  if (nickname !== null) lines.push({ label: 'Nickname', parts: [nickname] });
  return lines.length === 0 ? null : { id: 'house', title: 'House', lines };
};

/** Lines of the chronicle the page shows, as on every page of an entity (pages/entity.ts). */
const CHRONICLE_LIMIT = 30;

/**
 * The last lines of level `chronicle` that link to the house, newest last. Same rule as `entityChronicle`, kept here: a
 * page function cannot import pages/entity.ts, which imports it (import cycle).
 */
function houseChronicle(ctx: Ctx, id: string): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const all = allChronicle(ctx.state);
  for (let i = all.length - 1; i >= 0 && out.length < CHRONICLE_LIMIT; i--) {
    const e = all[i] as ChronicleEntry;
    if (e.level === 'chronicle' && (e.subject === id || e.parts.some((p) => typeof p !== 'string' && p.id === id))) out.push(e);
  }
  return out.reverse();
}

/** The most living members the page lists. */
const MEMBER_LIMIT = 20;

/** The page of a house `h…` (D-311): status, renown in words, heads with their years and nicknames, living members. */
export function housePage(ctx: Ctx, id: string): EntityPage | null {
  const { state, content } = ctx;
  const house = houseById(state, id);
  if (!house) return null;
  const facts: EntityPage['facts'] = [];
  const status = statusName(content, house.status);
  if (status !== '') facts.push({ label: 'Status', parts: [status] });
  const word = renownWord(content, house.renown);
  if (word !== '') facts.push({ label: 'Renown', parts: [word] });
  facts.push({ label: 'Founded', parts: [String(toYmd(house.founded).year)] });
  for (const head of house.heads) {
    const years = `${toYmd(head.from).year}–${head.to === null ? '' : toYmd(head.to).year}`;
    const parts: TextPart[] = [{ id: head.id, name: head.name }];
    if (head.nickname !== null) parts.push(`, ${head.nickname}`);
    facts.push({ label: years, parts });
  }
  const living = state.characters.filter((c) => c.house === id && isAlive(c) && isNear(state, c.id));
  if (living.length > 0) {
    const parts: TextPart[] = [];
    living.slice(0, MEMBER_LIMIT).forEach((c, i) => {
      if (i > 0) parts.push(', ');
      parts.push({ id: c.id, name: fullName(c) });
    });
    if (living.length > MEMBER_LIMIT) parts.push(` and ${living.length - MEMBER_LIMIT} more`);
    facts.push({ label: 'Living', parts });
  }
  return { id, kind: 'house', title: `House ${house.name}`, subtitle: status, facts, chronicle: houseChronicle(ctx, id) };
}
