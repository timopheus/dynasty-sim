import { allChronicle, anyCharacter } from '../archive/archive';
import { fullName, isAlive } from '../character/character';
import { findTrait } from '../character/holding';
import { STAT_IDS } from '../character/stat-ids';
import { fameWord, stats, statWord } from '../character/stats';
import type { ChronicleEntry } from '../chronicle/log';
import { conditionsText } from '../health/course';
import { familySection } from '../family/page';
import { houseSection } from '../house/page';
import { acquaintanceLevel } from '../relations/acquaintance';
import { findRelationKind } from '../relations/links';
import { findReason, opinionCauses, opinionValue, opinionWord } from '../relations/opinions';
import { secretsKnownBy } from '../relations/secrets';
import type { Character, Ctx } from '../state';
import { renderText, type TextPart } from '../text/text';
import { ageYears, toYmd } from '../time/calendar';
import { isNear } from '../world/world';

/**
 * Data of the page of a person (2.10, GDD 8.8-8.9, D-150). A pure query: no randomness, no changes to the state.
 * What is filled in depends on how much the player may know: the hero and former heads of the house fully, others
 * by acquaintance (D-037) and fame. Fields that are hidden are null or empty, never filled and then masked.
 */
export type PageLevel = 'self' | 'close' | 'known' | 'stranger';

export interface PersonRef {
  id: string;
  name: string;
  dead: boolean;
}

export interface RelationLine {
  person: PersonRef;
  /** Relation kind name, e.g. "Friend". */
  kind: string;
  startYear: number;
  /** Year the relation ended; null while it lasts. */
  endYear: number | null;
}

export interface OpinionLine {
  /** Reason name, or a standing part of the opinion. */
  text: string;
  year: number | null;
  /** Number for the hover text; only close acquaintances show it (D-037). */
  value: number | null;
  /** True for a reason that never fades. */
  lasting: boolean;
}

export interface PersonPage {
  id: string;
  name: string;
  level: PageLevel;
  sex: 'male' | 'female';
  alive: boolean;
  /** Years of life such as "1679–1728" or "b. 1679", or a rough age such as "about 40" for strangers. */
  life: string;
  fame: string;
  occupation: string | null;
  /** Visible traits, education and skills included, in the order held. */
  traits: string[];
  /** Words of the stats; `value` is null unless the player may see the number (hero, close). */
  stats: { id: string; label: string; word: string; value: number | null }[] | null;
  conditions: string | null;
  money: number | null;
  allies: RelationLine[];
  rivals: RelationLine[];
  /** What this person thinks of the current hero; null for the hero, for people the hero does not know and for the dead. */
  opinion: { word: string; value: number | null; lines: OpinionLine[] } | null;
  death: { year: number; cause: string | null } | null;
  /** Kinds of secrets about the person that the hero knows. */
  secrets: string[];
  /** Chronicle lines about the person already shown to the player, newest last. */
  chronicle: ChronicleEntry[];
  /**
   * Journal lines; the hero's and former heads' in full, so everyday detail never crowds out the chronicle. For other
   * people the hero knows: only the events the person had themselves (D-166, 3.9).
   */
  journal: ChronicleEntry[];
  /** Sections other modules add (PERSON_SECTIONS), in that order; a module with nothing to show adds none. */
  sections: PageSection[];
}

/** A section of the page of a person from another module (stage 4): a title and lines "label → text with links". */
export interface PageSection {
  /** Module id of the section, e.g. `family`. */
  id: string;
  title: string;
  lines: { label: string; parts: TextPart[] }[];
}

/** Builds a module's section of the page, or null when there is nothing the player may see. A pure query. */
export type PersonSection = (ctx: Ctx, c: Character, level: PageLevel) => PageSection | null;

/**
 * Sections of the page of a person from other modules, in the order shown (4.1): the family (4.5), the house and the
 * nickname (4.7). A module fills its own function and does not touch pages/ (D-052).
 */
export const PERSON_SECTIONS: readonly PersonSection[] = [familySection, houseSection];

const ENTRY_LIMIT = 30;

/** Heads of the house are open books to the player: the hero and those who were before. */
export function isHouseHead(ctx: Ctx, id: string): boolean {
  return id === ctx.state.playerId || allChronicle(ctx.state).some((e) => e.subject === id && (e.kind === 'start' || e.kind === 'succession'));
}

/** How much of the person the player may see. */
export function pageLevel(ctx: Ctx, id: string): PageLevel {
  if (isHouseHead(ctx, id)) return 'self';
  return acquaintanceLevel(ctx.state, ctx.content, ctx.state.playerId, id) ?? 'stranger';
}

function ref(ctx: Ctx, id: string): PersonRef {
  const c = anyCharacter(ctx.state, id);
  return c ? { id, name: fullName(c), dead: !isAlive(c) } : { id, name: id, dead: false };
}

function year(day: number): number {
  return toYmd(day).year;
}

function roughAge(age: number): string {
  return age < 5 ? 'a small child' : `about ${Math.round(age / 5) * 5}`;
}

function lifeText(c: Character, day: number, exact: boolean): string {
  const born = year(c.birthDay);
  if (exact) return c.deathDay === null ? `b. ${born}` : `${born}–${year(c.deathDay)}`;
  return c.deathDay === null ? roughAge(ageYears(c.birthDay, day)) : `died ${year(c.deathDay)}`;
}

function relationLines(ctx: Ctx, c: Character): { allies: RelationLine[]; rivals: RelationLine[] } {
  const allies: RelationLine[] = [];
  const rivals: RelationLine[] = [];
  for (const r of ctx.state.relations) {
    if (r.a !== c.id && r.b !== c.id) continue;
    const kind = findRelationKind(ctx.content, r.kind);
    if (!kind) continue;
    const mine = r.a === c.id ? kind.opinion.a : kind.opinion.b;
    const line: RelationLine = {
      person: ref(ctx, r.a === c.id ? r.b : r.a),
      kind: kind.name,
      startYear: year(r.start),
      endYear: r.end === null ? null : year(r.end),
    };
    (mine < 0 ? rivals : allies).push(line);
  }
  return { allies, rivals };
}

const BACKGROUND_TEXT = 'Their own temper and yours';
const TIES_TEXT = 'The ties between you';

function opinionOfHero(ctx: Ctx, c: Character, numbers: boolean): PersonPage['opinion'] {
  const { state, content } = ctx;
  if (!content.opinions) return null;
  const hero = state.playerId;
  const near = isNear(state, c.id);
  if (!near && !state.opinionReasons.some((r) => r.holder === c.id && r.target === hero)) return null;
  const value = opinionValue(ctx, c.id, hero);
  const lines = numbers
    ? opinionCauses(ctx, c.id, hero).map((cause): OpinionLine => {
        if (cause.id === 'background') return { text: BACKGROUND_TEXT, year: null, value: cause.value, lasting: true };
        if (cause.id === 'relation') return { text: TIES_TEXT, year: null, value: cause.value, lasting: false };
        const records = state.opinionReasons.filter((r) => r.holder === c.id && r.target === hero && r.reason === cause.id);
        const latest = records.reduce((a, b) => (b.day > a.day ? b : a), records[0] ?? { day: state.day });
        return {
          text: findReason(content, cause.id)?.name ?? cause.id,
          year: year(latest.day),
          value: cause.value,
          lasting: findReason(content, cause.id)?.decay.kind === 'never',
        };
      })
    : [];
  return { word: opinionWord(content, value), value: numbers ? value : null, lines };
}

function visibleTraits(ctx: Ctx, c: Character, level: PageLevel): string[] {
  const fame = c.fame;
  return c.traits.flatMap((id) => {
    const def = findTrait(ctx.content, id);
    if (!def) return [];
    const seen = level === 'self' || def.visibility === 'obvious' || (def.visibility === 'normal' && (level !== 'stranger' || fame >= 2));
    return seen ? [def.name] : [];
  });
}

function entriesAbout(ctx: Ctx, id: string, level: ChronicleEntry['level']): ChronicleEntry[] {
  const about = (e: ChronicleEntry) => e.subject === id || e.parts.some((p: TextPart) => typeof p !== 'string' && p.id === id);
  return allChronicle(ctx.state).filter((e) => e.level === level && about(e)).slice(-ENTRY_LIMIT);
}

/** Journal lines of events that happened to the person themselves, newest last. */
function ownEvents(ctx: Ctx, id: string): ChronicleEntry[] {
  return allChronicle(ctx.state).filter((e) => e.level === 'journal' && e.subject === id && e.kind === 'npc_event').slice(-ENTRY_LIMIT);
}

/**
 * The page of a person as the player may see it, or null for an unknown id (D-150).
 * - hero and former heads: everything, including secret traits and numbers;
 * - close: also the reasons of their opinion of the hero, with the numbers for hover;
 * - known: character, skills, stats in words, the opinion in words, relations, cause of death;
 * - stranger: name, sex, rough age, obvious traits (wounds, looks, reputation); fame lifts the veil a step at a time:
 *   1 occupation and exact years, 2 ordinary traits, 3 cause of death (D-037).
 */
export function personPage(ctx: Ctx, id: string): PersonPage | null {
  const { state, content } = ctx;
  const c = anyCharacter(state, id);
  if (!c) return null;
  const level = pageLevel(ctx, id);
  const full = level === 'self';
  const acquainted = level !== 'stranger';
  const fameStep = c.fame;
  const exactYears = acquainted || fameStep >= 1;
  const occupation = c.occupation === null ? null : (content.population?.occupations.find((o) => o.id === c.occupation)?.name ?? null);
  // the dead do not go on ageing: stats are counted on the day of death
  const values = stats(c.deathDay === null ? ctx : { state: { ...state, day: c.deathDay }, content }, c);
  const numbers = full || level === 'close';
  const rel = acquainted ? relationLines(ctx, c) : { allies: [], rivals: [] };
  const causeText = content.health.causes.find((x) => x.id === c.deathCause)?.text;
  const knowsCause = acquainted || fameStep >= 3;
  const hero = state.playerId === id;
  return {
    id,
    name: fullName(c),
    level,
    sex: c.sex,
    alive: isAlive(c),
    life: lifeText(c, state.day, exactYears),
    fame: fameWord(content, c),
    occupation: acquainted || fameStep >= 1 ? occupation : null,
    traits: visibleTraits(ctx, c, level),
    stats: acquainted
      ? STAT_IDS.map((sid) => ({ id: sid, label: sid[0]?.toUpperCase() + sid.slice(1), word: statWord(content, values[sid]), value: numbers ? values[sid] : null }))
      : null,
    conditions: acquainted && isAlive(c) ? conditionsText(content, c) : null,
    money: full ? c.money : null,
    allies: rel.allies,
    rivals: rel.rivals,
    opinion: !hero && !full && acquainted && isAlive(c) ? opinionOfHero(ctx, c, level === 'close') : null,
    death: c.deathDay === null ? null : { year: year(c.deathDay), cause: knowsCause && causeText ? renderText(causeText, c, c.deathDay) : null },
    secrets: secretsKnownBy(state, state.playerId).filter((s) => s.about === id).map((s) => s.kind.replace(/_/g, ' ')),
    chronicle: entriesAbout(ctx, id, 'chronicle'),
    journal: full ? entriesAbout(ctx, id, 'journal') : acquainted ? ownEvents(ctx, id) : [],
    sections: PERSON_SECTIONS.flatMap((section) => section(ctx, c, level) ?? []),
  };
}
