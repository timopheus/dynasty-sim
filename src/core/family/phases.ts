import { inheritStatsAndTraits } from '../character/generate';
import { findEvent, startEvent } from '../events/events';
import { findCharacter, getPlayer } from '../helpers';
import { createCharacter } from '../hooks';
import { chancePer, int } from '../rng';
import type { Character, Ctx, DayPhase, NewGameHook, SuccessionHook } from '../state';
import { ageYears, birthDayRange } from '../time/calendar';
import { ageRow, type FamilyContent } from './content';
import { childWord, logAboutHero, type Pregnancy } from './family';
import { dropHouseholdFromCircle, ensureOccupation, syncHousehold } from './household';
import { isAncestor } from './kin';
import { makePedigree } from './pedigree';
import { proposalAllowed } from './proposals';

/**
 * Code of the family module that runs as a phase or a hook (4.5). Like every file a succession hook lives in, this one
 * never imports lifecycle.ts: a new character comes from `createCharacter` of hooks.ts, a death goes through
 * `state.deathRequests` (D-164).
 */

/** The hero's house (D-313): the hero and the hero's descendants. Their couples have children whatever the ceiling. */
function ofHeroHouse(ctx: Ctx, id: string): boolean {
  const hero = ctx.state.playerId;
  return id === hero || isAncestor(ctx.state, hero, id);
}

function livingCount(ctx: Ctx): number {
  let n = 0;
  for (const c of ctx.state.characters) if (c.deathDay === null) n += 1;
  return n;
}

/** Married couples with a spouse near the hero (the hero, the household, the circle), each once, wife first seen. */
function nearCouples(ctx: Ctx): { husband: Character; wife: Character }[] {
  const { state } = ctx;
  const out: { husband: Character; wife: Character }[] = [];
  const seen = new Set<string>();
  for (const id of [state.playerId, ...state.household, ...state.circle]) {
    const c = findCharacter(state, id);
    const spouse = c?.spouse ? findCharacter(state, c.spouse) : null;
    if (!c || !spouse || c.sex === spouse.sex) continue;
    const wife = c.sex === 'female' ? c : spouse;
    if (seen.has(wife.id)) continue;
    seen.add(wife.id);
    out.push({ husband: c.sex === 'male' ? c : spouse, wife });
  }
  return out;
}

/**
 * Conceptions (4.5): every couple that lasts with a spouse near the hero (the hero's house, the circle) rolls the
 * yearly chance of the wife's new age once a year, on her birthday, from the world stream (a day that stops before
 * the family phase skips that year's roll). People far away do not (stage 5). While the living reach `livingMax`, only
 * the couples of the hero's house do (D-313).
 */
function conceive(ctx: Ctx, family: FamilyContent, delivered: ReadonlySet<string>): void {
  const { state } = ctx;
  // A mother who gave birth today does not conceive the same day.
  const pregnant = new Set([...state.pregnancies.map((p) => p.mother), ...delivered]);
  let crowded: boolean | null = null;
  for (const pair of nearCouples(ctx)) {
    if (pregnant.has(pair.wife.id)) continue;
    const age = ageYears(pair.wife.birthDay, state.day);
    if (age === ageYears(pair.wife.birthDay, state.day - 1)) continue;
    crowded ??= livingCount(ctx) >= family.livingMax;
    if (crowded && !ofHeroHouse(ctx, pair.wife.id) && !ofHeroHouse(ctx, pair.husband.id)) continue;
    const perYear = ageRow(family.conception, age);
    if (perYear === 0 || !chancePer(state.rng, perYear, 10000)) continue;
    const due = state.day + int(state.rng, family.pregnancyDays.min, family.pregnancyDays.max);
    state.pregnancies.push({ mother: pair.wife.id, father: pair.husband.id, due });
    pregnant.add(pair.wife.id);
  }
}

/**
 * A child is born (4.5): parents, the father's surname (a heroine-head's own, D-313), stats and body traits from the
 * parents. The hero's child joins the household (`syncHousehold`), any other stays with the parents, far from the
 * hero. The mother may die in childbirth: a death request (D-164), carried out by the death phase.
 */
export function giveBirth(ctx: Ctx, family: FamilyContent, p: Pregnancy): Character | null {
  const { state } = ctx;
  const mother = findCharacter(state, p.mother);
  const father = findCharacter(state, p.father);
  state.pregnancies = state.pregnancies.filter((x) => x !== p);
  if (!mother || !father || mother.deathDay !== null) return null;
  const surname = mother.id === state.playerId ? mother.surname : father.surname;
  const child = createCharacter(ctx, { surname, age: { min: 0, max: 0 }, father: father.id, mother: mother.id });
  child.birthDay = state.day;
  inheritStatsAndTraits(ctx, child, father, mother);
  const texts = family.texts;
  if (mother.id === state.playerId) logAboutHero(ctx, 'birth', texts.bornToHer, { child, kind: childWord(child) });
  else if (father.id === state.playerId) logAboutHero(ctx, 'birth', texts.born, { other: mother, child, kind: childWord(child) });
  if (chancePer(state.rng, family.childbirthDeathPer10k, 10000)) state.deathRequests.push({ characterId: mother.id, cause: 'childbirth' });
  return child;
}

/** Births due today, in the order the pregnancies began; the mothers who gave birth. */
function births(ctx: Ctx, family: FamilyContent): Set<string> {
  const { state } = ctx;
  const mothers = new Set<string>();
  for (const p of state.pregnancies.filter((x) => x.due <= state.day)) if (giveBirth(ctx, family, p) !== null) mothers.add(p.mother);
  return mothers;
}

/**
 * Whether the household may be out of step: someone was born today, or a member is of age though only the spouse
 * may be (a child came of age; the parents of a hero under age always are). Marriages, deaths and the change of the
 * head bring it in step themselves. Saves the walk over everyone on the other days.
 */
function householdStale(ctx: Ctx, born: boolean): boolean {
  if (born) return true;
  const { state, content } = ctx;
  const spouse = findCharacter(state, state.playerId)?.spouse ?? null;
  const latest = birthDayRange(state.day, content.settings.adultAge, content.settings.adultAge).latest;
  return state.household.some((id) => {
    if (id === spouse) return false;
    const c = findCharacter(state, id);
    return c !== null && c.birthDay <= latest;
  });
}

/** People of the circle who have just joined it get their pedigree (D-313), in the order of the circle. */
function pedigrees(ctx: Ctx): void {
  const { state } = ctx;
  for (const id of [...state.circle]) {
    const c = findCharacter(state, id);
    if (c && !c.kinKnown) makePedigree(ctx, c);
  }
}

/**
 * Days ahead of coming of age when the occupation is given: a day may stop before the family phase (the hero's death,
 * an interruption), and the world invariant wants an occupation from the birthday on.
 */
const OCCUPATION_LEAD_DAYS = 30;

/**
 * Children far from the hero who come of age (`adultAge`) within OCCUPATION_LEAD_DAYS get an occupation (world
 * invariant); the household is exempt. From the world stream, in the order of the state.
 */
function comingOfAge(ctx: Ctx): void {
  const { state, content } = ctx;
  if (!content.population) return;
  const latest = birthDayRange(state.day + OCCUPATION_LEAD_DAYS, content.settings.adultAge, content.settings.adultAge).latest;
  for (const c of state.characters) {
    if (c.occupation !== null || c.deathDay !== null || c.birthDay > latest || c.id === state.playerId) continue;
    if (state.household.includes(c.id)) continue;
    ensureOccupation(ctx, c);
  }
}

/**
 * Family phase (4.5), after the world phase: pedigrees of newcomers to the circle, births due, conceptions, the
 * household, occupations of those who came of age. Never stops the day.
 */
export const familyPhase: DayPhase = {
  id: 'family',
  run(ctx) {
    const family = ctx.content.family;
    let born = false;
    if (family) {
      pedigrees(ctx);
      const mothers = births(ctx, family);
      born = mothers.size > 0;
      conceive(ctx, family, mothers);
    }
    if (householdStale(ctx, born)) syncHousehold(ctx);
    else dropHouseholdFromCircle(ctx);
    comingOfAge(ctx);
    return false;
  },
};

/**
 * New game (D-313, D-315): the living kin of the founder — parents, brothers and sisters, the first line of succession
 * — and the pedigrees of the circle, already filled by the world hook; then the household.
 */
export const familyOnNewGame: NewGameHook = (ctx) => {
  makePedigree(ctx, getPlayer(ctx.state));
  pedigrees(ctx);
  syncHousehold(ctx);
};

/** The household of the new head (D-313): the old one leaves, the new one joins. */
export const familyOnSuccession: SuccessionHook = (ctx) => {
  syncHousehold(ctx);
};

/** What the `propose` command carries (D-313): a match of the hero or a child of theirs with a person or their child. */
export interface ProposeOrder {
  suitor: string;
  target: string;
}

/**
 * The `propose` command (D-313): fires the proposal event of the content (`family.proposalEvent`) as the hero's event
 * with the roles `suitor` and `target` handed over; the answer is the event. No time passes. Refused (an error) while
 * the player is not choosing an action, or for a match `proposalOptions` would not offer.
 */
export function proposeCommand(ctx: Ctx, order: ProposeOrder): void {
  const { state, content } = ctx;
  const family = content.family;
  if (!family) throw new Error('Proposals of marriage need the family section of the content');
  if (state.status !== 'awaiting_action') throw new Error(`Cannot propose a marriage while ${state.status}`);
  if (!proposalAllowed(ctx, order.suitor, order.target)) throw new Error(`No match can be proposed between ${order.suitor} and ${order.target}`);
  const event = findEvent(content, family.proposalEvent);
  if (!startEvent(ctx, event, getPlayer(state), { suitor: order.suitor, target: order.target })) {
    throw new Error(`The proposal event "${event.id}" could not start`);
  }
}
