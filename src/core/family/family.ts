import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { findCharacter, isInt } from '../helpers';
import type { Character, CreateHook, Ctx, DeathHook, Invariant, RefsFn } from '../state';
import { fillTemplate } from '../text/text';
import { isCloseKin } from './kin';

/**
 * Family part of the game state (stage 4, D-235, D-313). Kinship is kept in two places: `father` and `mother` of a
 * character, and the marriages here, as a list of records (D-195), not a map. An unknown ancestor is null.
 */
export interface Marriage {
  /** The two spouses; no order. */
  a: string;
  b: string;
  start: number;
  /** Day the marriage ended (a death); null while it lasts. */
  end: number | null;
  /** Why it ended, e.g. `death`; null while it lasts. */
  endReason: string | null;
}

/** A child on the way (4.5): born on `due` in the family phase. */
export interface Pregnancy {
  mother: string;
  father: string;
  due: number;
}

export interface FamilyState {
  /** In the order they were made. */
  marriages: Marriage[];
  /** In the order they began; at most one per mother. */
  pregnancies: Pregnancy[];
}

/** Family part of a character. */
export interface FamilyCharacter {
  /** Ids of the parents; null when unknown (D-313: dead ancestors are never made up). */
  father: string | null;
  mother: string | null;
  /** The spouse now, while the marriage lasts; null otherwise. Mirrors the marriage records for quick lookups. */
  spouse: string | null;
  /**
   * The living kin of the person are known (D-313): made when the person first joined the circle (`pedigree.ts`), or
   * the person was born in the game or made as somebody's kin. False only for people the world made without a family
   * who have not been in the circle yet.
   */
  kinKnown: boolean;
}

export function initFamilyState(): FamilyState {
  return { marriages: [], pregnancies: [] };
}

/** Born in the game: the parents are known, and so is the family. */
export const createFamily: CreateHook = (_ctx, c, spec) => {
  c.father = spec.father ?? null;
  c.mother = spec.mother ?? null;
  c.spouse = null;
  c.kinKnown = spec.father !== undefined || spec.mother !== undefined;
};

/** Id of the spouse of the person now, if any. */
export function spouseId(ctx: Ctx, id: string): string | null {
  return findCharacter(ctx.state, id)?.spouse ?? null;
}

/** The spouse of the person now, if any. */
export function spouseOf(ctx: Ctx, id: string): Character | null {
  const other = spouseId(ctx, id);
  return other === null ? null : findCharacter(ctx.state, other);
}

/** A line about the hero with `{other}` (and more) filled; nothing if the content has no family texts. */
export function logAboutHero(ctx: Ctx, kind: string, template: string, values: Record<string, Character | string>): void {
  const { state } = ctx;
  const hero = findCharacter(state, state.playerId);
  if (!hero || hero.deathDay !== null) return;
  const filled = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === 'string' ? v : { id: v.id, name: fullName(v) }]));
  log(ctx, { subject: hero, kind, level: 'chronicle', parts: fillTemplate(template, { ...placeholderValues(hero, state.day), ...filled }) });
}

/** "son" or "daughter". */
export function childWord(c: Character): string {
  return c.sex === 'male' ? 'son' : 'daughter';
}

/**
 * A death ends the marriages of the dead (widowhood; a new marriage is allowed) and the pregnancy of a dead mother.
 * The hero hears of the death of a spouse or of a child of theirs: a chronicle line (4.5).
 */
export const familyOnDeath: DeathHook = (ctx, c) => {
  const { state, content } = ctx;
  const hero = state.playerId;
  const spouse = c.spouse === null ? null : findCharacter(state, c.spouse);
  const widowed = spouse !== null && spouse.id === hero;
  if (c.spouse !== null) {
    const m = state.marriages.find((x) => x.end === null && (x.a === c.id || x.b === c.id));
    if (m) {
      m.end = state.day;
      m.endReason = 'death';
    }
    if (spouse) spouse.spouse = null;
    c.spouse = null;
  }
  state.pregnancies = state.pregnancies.filter((p) => p.mother !== c.id);
  const texts = content.family?.texts;
  if (!texts || c.id === hero) return;
  if (widowed) logAboutHero(ctx, 'family', texts.spouseDied, { other: c });
  else if (c.father === hero || c.mother === hero) logAboutHero(ctx, 'family', texts.childDied, { other: c, kind: childWord(c) });
};

/**
 * People the family part of the hot data refers to (D-312): both sides of every marriage with a living spouse, and the
 * parents of a child on the way. Parents of the living stay hot by the closure of the archive.
 */
export const familyRefs: RefsFn = ({ state }) => {
  const out: string[] = [];
  const alive = (id: string) => findCharacter(state, id)?.deathDay === null;
  for (const m of state.marriages) if (alive(m.a) || alive(m.b)) out.push(m.a, m.b);
  for (const p of state.pregnancies) out.push(p.mother, p.father);
  return out;
};

export const familyInvariants: Invariant = (ctx) => {
  const { state } = ctx;
  const problems: string[] = [];
  const lasting = new Set<string>();
  for (const m of state.marriages) if (m.end === null) lasting.add(`${m.a} ${m.b}`).add(`${m.b} ${m.a}`);
  for (const c of state.characters) {
    if (typeof c.kinKnown !== 'boolean') problems.push(`${c.id} has no flag of known kin`);
    if (c.spouse !== null) {
      const spouse = typeof c.spouse === 'string' ? findCharacter(state, c.spouse) : null;
      if (!spouse || spouse.spouse !== c.id) problems.push(`${c.id} has a spouse ${String(c.spouse)} who is not married to them`);
      if (!lasting.has(`${c.id} ${String(c.spouse)}`)) problems.push(`${c.id} has a spouse ${String(c.spouse)} without a marriage that lasts`);
    }
    for (const parent of [c.father, c.mother]) {
      if (parent === null) continue;
      if (typeof parent !== 'string' || parent === c.id) problems.push(`${c.id} has an invalid parent ${String(parent)}`);
      // Parents of the living stay in the hot part (D-312), so they can be looked up.
      else if (c.deathDay === null && !findCharacter(state, parent)) problems.push(`${c.id} has an unknown parent ${parent}`);
    }
  }
  const married = new Set<string>();
  for (const m of state.marriages) {
    const at = `marriage ${m.a} - ${m.b}`;
    if (m.a === m.b) problems.push(`${m.a} is married to themself`);
    if (!isInt(m.start) || m.start > state.day) problems.push(`${at} has an invalid start ${m.start}`);
    if (m.end !== null && (!isInt(m.end) || m.end < m.start || m.end > state.day)) problems.push(`${at} has an invalid end ${m.end}`);
    if ((m.end === null) !== (m.endReason === null)) problems.push(`${at} has an end without a reason or back`);
    if (m.end !== null) continue;
    // A marriage that lasts: both alive, each in one marriage, not close kin (D-313).
    const a = findCharacter(state, m.a);
    const b = findCharacter(state, m.b);
    if (!a || !b) {
      problems.push(`${at} lasts with an unknown spouse`);
      continue;
    }
    if (a.deathDay !== null || b.deathDay !== null) problems.push(`${at} lasts although a spouse is dead`);
    if (a.spouse !== b.id || b.spouse !== a.id) problems.push(`${at} lasts but the spouses do not name each other`);
    for (const id of [m.a, m.b]) {
      if (married.has(id)) problems.push(`${id} is in two marriages at once`);
      married.add(id);
    }
    if (isCloseKin(state, m.a, m.b)) problems.push(`${at} is a marriage of close kin`);
  }
  const mothers = new Set<string>();
  for (const p of state.pregnancies) {
    const mother = findCharacter(state, p.mother);
    if (!mother || mother.deathDay !== null) problems.push(`pregnancy of ${p.mother}: the mother is not alive`);
    else if (mother.sex !== 'female') problems.push(`pregnancy of ${p.mother}: the mother is not a woman`);
    if (!findCharacter(state, p.father)) problems.push(`pregnancy of ${p.mother}: unknown father ${p.father}`);
    if (mothers.has(p.mother)) problems.push(`${p.mother} is pregnant twice`);
    mothers.add(p.mother);
    if (!isInt(p.due) || p.due < state.day) problems.push(`pregnancy of ${p.mother} is overdue (${p.due})`);
  }
  return problems;
};
