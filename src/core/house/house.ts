import { fullName, isAlive } from '../character/character';
import { hasTrait } from '../character/holding';
import type { Content } from '../content/schema';
import { findCharacter, isInt, newId } from '../helpers';
import type { Character, CreateHook, Ctx, DeathHook, GameState, Invariant, MarriageHook, RefsFn } from '../state';

/**
 * House part of the game state (stage 4, D-237, D-316). A house is an entity `h…` (D-311): the hero's house and the
 * houses of spouses. The status is a right (an id from `house.statuses`), the renown a memory (a whole number that
 * does not fade); the nickname of a head is the public form of their reputation and stays in the memory of the house.
 */
export interface HouseHead {
  /** Id of the person; they stay readable after death (page, archive). */
  id: string;
  /** Name at the time, so the list of heads reads without the person. */
  name: string;
  /** First and last day as head; `to` is null for the current head. */
  from: number;
  to: number | null;
  /** The nickname at death (kept in the memory of the house); null while alive or when none was earned. */
  nickname: string | null;
}

export interface House {
  id: string;
  /** The surname the house is known by. */
  name: string;
  /** Day the house first appeared in the game. */
  founded: number;
  /** Id from `house.statuses`; null when the content has none. */
  status: string | null;
  /** Renown of the house (D-316): any whole number, does not fade. */
  renown: number;
  /** Heads in the order they led, the current one last. Only the heads of the hero's line are recorded. */
  heads: HouseHead[];
}

export interface HouseState {
  /** In the order they were made. */
  houses: House[];
}

/** House part of a character. */
export interface HouseCharacter {
  /** Id of the house the person belongs to; null when none is known. */
  house: string | null;
}

export function initHouseState(): HouseState {
  return { houses: [] };
}

export function houseById(state: GameState, id: string | null): House | null {
  return id === null ? null : (state.houses.find((h) => h.id === id) ?? null);
}

/** The house of a person, or null. */
export function houseOf(state: GameState, c: Character): House | null {
  return houseById(state, c.house);
}

/** A new house with the lowest status and no renown. */
export function makeHouse(ctx: Ctx, name: string): House {
  const { state, content } = ctx;
  const house: House = { id: newId(state, 'h'), name, founded: state.day, status: content.house?.statuses[0]?.id ?? null, renown: 0, heads: [] };
  state.houses.push(house);
  return house;
}

/** Opens the record of a head in the house, if it is not open yet. */
export function openHead(state: GameState, house: House, head: Character): void {
  if (house.heads.some((h) => h.id === head.id && h.to === null)) return;
  house.heads.push({ id: head.id, name: fullName(head), from: state.day, to: null, nickname: null });
}

/** Name of a status; the id when the content does not know it. */
export function statusName(content: Content, id: string | null): string {
  if (id === null) return '';
  return content.house?.statuses.find((s) => s.id === id)?.name ?? id;
}

/** Rank of a status in `house.statuses` (0 is the lowest); -1 for none or unknown. */
export function statusRank(content: Content, id: string | null): number {
  return content.house?.statuses.findIndex((s) => s.id === id) ?? -1;
}

/** The word for renown: the last entry whose `from` is <= the number, the first one below all of them. */
export function renownWord(content: Content, renown: number): string {
  const words = content.house?.renown.words ?? [];
  let word = words[0]?.word ?? '';
  for (const w of words) if (w.from <= renown) word = w.word;
  return word;
}

/** The word of the step that starts at the renown `n` (a threshold of a condition is always the start of a step, D-374). */
export function renownWordFor(content: Content, n: number): string {
  const words = content.house?.renown.words ?? [];
  return (words.find((w) => w.from === n) ?? words.find((w) => w.from >= n) ?? words.at(-1))?.word ?? '';
}

/** The nickname people give the person for their deeds: the first entry of `house.nicknames` whose reputation trait they hold. */
export function nicknameOf(content: Content, c: Character): string | null {
  for (const n of content.house?.nicknames ?? []) if (hasTrait(c, n.trait)) return n.nickname;
  return null;
}

/** Shift of renown when a head dies: from their fame step and the reputation traits they held (D-316). */
export function renownShift(content: Content, c: Character): number {
  const renown = content.house?.renown;
  if (!renown) return 0;
  let shift = renown.fame[c.fame] ?? 0;
  for (const t of renown.traits) if (hasTrait(c, t.trait)) shift += t.value;
  return shift;
}

/** A child takes the house of the father; of a heroine-head, hers (D-313). Parents are read from the hot part (D-312). */
export const createHouse: CreateHook = ({ state }, c, spec) => {
  const father = spec.father === undefined ? null : findCharacter(state, spec.father);
  const mother = spec.mother === undefined ? null : findCharacter(state, spec.mother);
  const heroine = mother !== null && mother.id === state.playerId;
  c.house = (heroine ? mother.house : null) ?? father?.house ?? mother?.house ?? null;
};

/**
 * A head dies: the nickname goes to the memory of the house and the renown moves by their fame and reputation
 * (D-316). The record of the head closes. Runs before the heir takes over.
 */
export const houseOnDeath: DeathHook = ({ state, content }, c) => {
  if (c.id !== state.playerId) return;
  const house = houseOf(state, c);
  if (!house) return;
  const head = house.heads.find((h) => h.id === c.id && h.to === null);
  if (head) {
    head.to = state.day;
    head.nickname = nicknameOf(content, c);
  }
  house.renown += renownShift(content, c);
};

/**
 * A marriage was made (MARRIAGE_HOOKS of hooks.ts, called by the marriage of family/, 4.5). The house of a spouse
 * who has none is made now, from their surname, when the other spouse is of the house of the hero (D-370). Lives here, not in phases.ts: the marriage is an effect, and a file an
 * effect reaches must not import events/ or lifecycle.ts.
 */
export const houseOnMarriage: MarriageHook = (ctx, marriage) => {
  const { state } = ctx;
  const a = findCharacter(state, marriage.a);
  const b = findCharacter(state, marriage.b);
  if (!a || !b) return;
  // Lazily, by the plan: only a marriage into the house of the hero makes the house of the other spouse.
  const heroHouse = findCharacter(state, state.playerId)?.house ?? null;
  if (heroHouse === null || (a.house !== heroHouse && b.house !== heroHouse)) return;
  for (const spouse of [a, b]) if (spouse.house === null) spouse.house = makeHouse(ctx, spouse.surname).id;
};

/**
 * People the house part of the hot data refers to (D-312): none. The heads keep their names and stay readable through
 * the archive, so nobody has to be held in the hot part for the house.
 */
export const houseRefs: RefsFn = () => [];

export const houseInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const h of state.houses) {
    if (ids.has(h.id)) problems.push(`duplicate house id ${h.id}`);
    ids.add(h.id);
    if (h.status !== null && content.house && statusRank(content, h.status) < 0) problems.push(`house ${h.id} has unknown status ${h.status}`);
    if (!isInt(h.renown)) problems.push(`house ${h.id} has renown ${String(h.renown)}`);
    if (h.heads.filter((x) => x.to === null).length > 1) problems.push(`house ${h.id} has more than one head`);
    for (const head of h.heads) {
      if (!isInt(head.from) || head.from > state.day || (head.to !== null && (!isInt(head.to) || head.to < head.from))) {
        problems.push(`house ${h.id} has an invalid term of ${head.id}`);
      }
    }
  }
  for (const c of state.characters) {
    if (c.house !== null && !ids.has(c.house)) problems.push(`${c.id} belongs to unknown house ${String(c.house)}`);
  }
  // The living hero heads their house (a hero without a house is a hand-made state).
  const hero = findCharacter(state, state.playerId);
  if (hero && isAlive(hero) && state.status !== 'ended' && hero.house !== null) {
    const house = houseById(state, hero.house);
    if (house && !house.heads.some((x) => x.id === hero.id && x.to === null)) problems.push(`${hero.id} heads house ${house.id} without a record`);
  }
  return problems;
};
