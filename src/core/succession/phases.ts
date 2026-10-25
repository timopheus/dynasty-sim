import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { conditionReport } from '../condition-keys';
import { findCharacter, getPlayer } from '../helpers';
import { createCharacter } from '../hooks';
import { childrenOf } from '../family/kin';
import { activeRelationBetween, endRelation, findRelationKind, startRelation } from '../relations/links';
import { addOpinionReason, findReason } from '../relations/opinions';
import { int } from '../rng';
import type { Character, Ctx, DayPhase, DeathHook } from '../state';
import { fillTemplate, type TextPart } from '../text/text';
import { ageYears } from '../time/calendar';
import { stopJourney } from '../place/place';
import { timeContent } from '../time/seasons';
import { isNear } from '../world/world';
import { canGuard, heirOf, lawGuardian, lawOrder, widowOf, willGuardians, willHeirs, willItems, willReceivers, type HeirBasis } from './law';

/**
 * The change of the head of the house (D-016, D-314, D-315, D-360…D-363). `kill` of lifecycle.ts calls `chooseHeir`
 * when the hero dies, then `succeed` or `endHouse`, then the SUCCESSION_HOOKS. This file never imports lifecycle.ts
 * (import cycle): the placeholder heir comes from `createCharacter` of hooks.ts.
 */

/** Share of the main heir when the content says nothing (D-314: half). */
const DEFAULT_HEIR_PERCENT = 50;

const isMinor = (ctx: Ctx, c: Character): boolean => ageYears(c.birthDay, ctx.state.day) < ctx.content.settings.adultAge;

/**
 * The next head after `deceased`, or null when the house has ended (D-315): the heir of the will, then the heir by
 * law. With no kin, while `succession.temporaryHeir` is on (scaffolding until 4.13, D-315) — the placeholder heir of
 * D-007: a new adult of the same surname.
 */
export function chooseHeir(ctx: Ctx, deceased: Character): Character | null {
  const { state, content } = ctx;
  const found = heirOf(state, deceased.id);
  if (found) return found.heir;
  const pace = content.succession;
  if (pace && !pace.temporaryHeir) return null;
  const adult = { min: content.settings.adultAge, max: content.settings.adultAge };
  const age = pace?.temporaryHeirAge ?? content.settings.heirAge ?? adult;
  return createCharacter(ctx, { surname: deceased.surname, age });
}

/**
 * The money of the dead (D-314): `heirPercent` to the main heir, the rest in equal parts to the other living children
 * and the widow; what does not divide, and debts, go to the main heir. The placeholder heir takes all (D-007).
 */
function shareMoney(ctx: Ctx, deceased: Character, heir: Character, kin: boolean): void {
  const { state, content } = ctx;
  const total = deceased.money;
  if (!kin) {
    heir.money = total;
    return;
  }
  const others = childrenOf(state, deceased.id).filter((c) => c.deathDay === null && c.id !== heir.id);
  const widow = widowOf(state, deceased);
  if (widow && widow.id !== heir.id && !others.includes(widow)) others.push(widow);
  if (total <= 0 || others.length === 0) {
    heir.money += total;
    return;
  }
  const percent = content.succession?.heirPercent ?? DEFAULT_HEIR_PERCENT;
  const rest = total - Math.floor((total * percent) / 100);
  const each = Math.floor(rest / others.length);
  for (const c of others) c.money += each;
  heir.money += total - each * others.length;
}

function personPart(c: Character): TextPart {
  return { id: c.id, name: fullName(c) };
}

/**
 * The guardian of a ward under `adultAge` takes charge (D-314, D-362): the relation `guardian` (the guardian is `a`)
 * and its line. A guardian from afar joins the circle while there is room: events take the guardian as a role.
 */
function appoint(ctx: Ctx, ward: Character, guardian: Character | null): void {
  const { state, content } = ctx;
  state.guardian = guardian?.id ?? null;
  if (!guardian) return;
  const population = content.population;
  if (population && !isNear(state, guardian.id) && state.circle.length < population.circle.max) state.circle.push(guardian.id);
  const kindId = content.succession?.guardianRelation;
  const kind = kindId === undefined ? null : findRelationKind(content, kindId);
  if (!kind || activeRelationBetween(state, guardian.id, ward.id, kind.id)) return;
  startRelation(ctx, kind.id, guardian.id, ward.id);
  if (kind.startsAsProtege === undefined) return;
  const parts = fillTemplate(kind.startsAsProtege, { ...placeholderValues(ward, state.day), other: personPart(guardian) });
  log(ctx, { subject: ward, kind: 'guardian', level: 'chronicle', parts });
}

/** An event may end the relation (the guardian removed, 4.13): then there is no guardian any more (D-366). */
function guarding(ctx: Ctx, guardian: string, ward: Character): boolean {
  const kindId = ctx.content.succession?.guardianRelation;
  return kindId === undefined || findRelationKind(ctx.content, kindId) === null || activeRelationBetween(ctx.state, guardian, ward.id, kindId) !== null;
}

/** The hero has come of age: the guardianship ends (D-314). */
function endGuardianship(ctx: Ctx, hero: Character): void {
  const { state, content } = ctx;
  const guardian = state.guardian === null ? null : findCharacter(state, state.guardian);
  state.guardian = null;
  const kindId = content.succession?.guardianRelation;
  const kind = kindId === undefined ? null : findRelationKind(content, kindId);
  if (!guardian || !kind) return;
  const relation = activeRelationBetween(state, guardian.id, hero.id, kind.id);
  if (!relation) return;
  endRelation(ctx, relation, 'came_of_age');
  if (kind.endsAsProtege === undefined) return;
  const parts = fillTemplate(kind.endsAsProtege, { ...placeholderValues(hero, state.day), other: personPart(guardian) });
  log(ctx, { subject: hero, kind: 'guardian', level: 'journal', parts });
}

/**
 * The heir takes over (D-314): the money is shared out, the heir leaves the circle and the household for the place of
 * the hero, the line "by will" / "by law", the heir by law passed over by the will gets a grudge, the will of the dead
 * is spent, and an heir under `adultAge` gets a guardian. The player picks an action next.
 */
export function succeed(ctx: Ctx, deceased: Character, heir: Character): void {
  const { state, content } = ctx;
  const found = heirOf(state, deceased.id);
  const by: HeirBasis | null = found?.heir.id === heir.id ? found.by : null;
  const firstByLaw = lawOrder(state, deceased.id)[0] ?? null;
  const namedGuardian = state.will?.guardian ?? null;
  shareMoney(ctx, deceased, heir, by !== null);
  state.circle = state.circle.filter((id) => id !== heir.id);
  state.household = state.household.filter((id) => id !== heir.id);
  state.playerId = heir.id;
  const pace = content.succession;
  if (by === null || !pace) {
    log(ctx, { subject: heir, kind: 'succession', level: 'chronicle', template: content.settings.texts.succession });
  } else {
    const parts = fillTemplate(by === 'will' ? pace.texts.byWill : pace.texts.byLaw, { ...placeholderValues(heir, state.day), deceased: personPart(deceased) });
    log(ctx, { subject: heir, kind: 'succession', level: 'chronicle', parts });
  }
  if (by === 'will' && pace && firstByLaw && firstByLaw.id !== heir.id && findReason(content, pace.passedOverReason)) {
    addOpinionReason(ctx, firstByLaw.id, heir.id, pace.passedOverReason);
  }
  state.executedWill = state.will;
  state.will = null;
  state.willDraft = null;
  state.guardian = null;
  if (isMinor(ctx, heir)) {
    const named = namedGuardian === null ? null : findCharacter(state, namedGuardian);
    appoint(ctx, heir, canGuard(ctx, named, heir, deceased.id) ? named : lawGuardian(ctx, heir, deceased.id));
  }
  state.status = 'awaiting_action';
}

/**
 * The house comes to an end (D-315): nobody inherits, or the player ends it (`end`). The lines the effects of a waiting
 * event held back go to the chronicle, as at a death (D-176); the event, the action and the will at the notary are
 * dropped; the line of the end. No command is taken after this. The summary of the house is 4.14.
 */
export function endHouse(ctx: Ctx): void {
  const { state, content } = ctx;
  const pending = state.pendingEvent;
  if (pending) state.chronicle.push(...pending.after);
  stopJourney(ctx);
  state.activeAction = null;
  state.interruptRequest = null;
  state.pendingEvent = null;
  state.willDraft = null;
  const last = findCharacter(state, state.playerId);
  const pace = content.succession;
  if (last && pace) {
    const parts = fillTemplate(pace.texts.ended, { ...placeholderValues(last, state.day), house: last.surname });
    log(ctx, { subject: last, kind: 'house_end', level: 'chronicle', parts });
  }
  state.status = 'ended';
}

/** The will is out of date (D-314): a journal line; the narrator and the events see it by `will_stale` (D-363). */
function markStale(ctx: Ctx, hero: Character, dead: Character | null): void {
  const { state, content } = ctx;
  if (!state.will || !content.succession) return;
  const first = !state.will.stale;
  state.will.stale = true;
  if (!first && dead === null) return;
  const { texts } = content.succession;
  const parts = dead
    ? fillTemplate(texts.willStaleDeath, { ...placeholderValues(hero, state.day), other: personPart(dead) })
    : fillTemplate(texts.willStaleBirth, placeholderValues(hero, state.day));
  log(ctx, { subject: hero, kind: 'will', level: 'journal', parts });
}

/**
 * Succession phase, after the family phase (births): a draft left by an interrupted notary action is dropped; the
 * guardianship ends when the hero comes of age; a child born after the will makes it out of date (D-314). Children
 * under `adultAge` live in the household (D-313), so only the household is looked at.
 */
export const successionPhase: DayPhase = {
  id: 'succession',
  run(ctx) {
    const { state, content } = ctx;
    if (state.willDraft && state.activeAction?.actionId !== content.succession?.willAction) state.willDraft = null;
    const hero = getPlayer(state);
    if (state.guardian !== null && !isMinor(ctx, hero)) endGuardianship(ctx, hero);
    else if (state.guardian !== null && !guarding(ctx, state.guardian, hero)) state.guardian = null;
    const will = state.will;
    if (will && !will.stale) {
      const born = state.household.some((id) => {
        const c = findCharacter(state, id);
        return c !== null && (c.father === hero.id || c.mother === hero.id) && c.birthDay > will.day;
      });
      if (born) markStale(ctx, hero, null);
    }
    return false;
  },
};

/**
 * A death that touches the will or the guardian (D-314): a named heir, guardian or receiver of an item who dies leaves
 * an empty term (the law fills it) and makes the will out of date; a dead guardian is replaced by the law. The death
 * of the hero is the change of the head (lifecycle.ts), not this.
 */
export const successionOnDeath: DeathHook = (ctx, c) => {
  const { state } = ctx;
  if (c.id === state.playerId) return;
  const will = state.will;
  if (will && (will.heir === c.id || will.guardian === c.id || will.items.some((i) => i.to === c.id))) {
    if (will.heir === c.id) will.heir = null;
    if (will.guardian === c.id) will.guardian = null;
    will.items = will.items.filter((i) => i.to !== c.id);
    markStale(ctx, getPlayer(state), c);
  }
  if (state.guardian === c.id) {
    const hero = getPlayer(state);
    state.guardian = null;
    if (isMinor(ctx, hero)) appoint(ctx, hero, lawGuardian(ctx, hero, null));
  }
};

/** What the `will` command carries (D-236, D-314). */
export interface WillOrder {
  /** Main heir; null leaves it to the law. */
  heir: string | null;
  /** Guardian of an heir under `adultAge`; null leaves it to the law. */
  guardian: string | null;
  /** Who gets each heirloom. */
  items: { item: string; to: string }[];
}

/**
 * Whether the hero may go to the notary now (D-314): of age, able to pay and not severely ill (the health phase would cut
 * the action short, D-366). The reasons are the texts of the usual conditions (`age_min`, `money_min`, `fit`); null when
 * wills are not in the content. Never consumes randomness.
 */
export function willReasons(ctx: Ctx): string[] | null {
  const { state, content } = ctx;
  const pace = content.succession;
  if (!pace) return null;
  const hero = getPlayer(state);
  const when = { age_min: content.settings.adultAge, money_min: pace.willCost, fit: true as const };
  return conditionReport(ctx, hero, when, { hero: hero.id, protagonist: hero.id }).reasons;
}

/**
 * The `will` command (D-314, D-360): the terms wait while the notary action runs (its duration is rolled as for
 * `start`); they become the will at its end (`will_signed`), and an interrupted action gives no will. The heir must be
 * of the kin the law knows; the guardian a grown-up near the hero.
 */
export function willCommand(ctx: Ctx, order: WillOrder): void {
  const { state, content } = ctx;
  const pace = content.succession;
  if (!pace) throw new Error('Wills are not in the game yet');
  // With live time the hero is nearly always busy (D-439): going to the notary changes the occupation, as `start` does.
  if (state.status !== 'awaiting_action' && state.status !== 'running') throw new Error(`Cannot go to the notary while ${state.status}`);
  const reasons = willReasons(ctx) ?? [];
  if (reasons.length > 0) throw new Error(`Cannot make a will now: ${reasons.join('; ')}`);
  const hero = getPlayer(state);
  if (order.heir !== null && !willHeirs(state, hero.id).some((c) => c.id === order.heir)) throw new Error(`${order.heir} is not of the kin who may inherit`);
  if (order.guardian !== null && !willGuardians(ctx, hero).some((c) => c.id === order.guardian)) throw new Error(`${order.guardian} cannot be named guardian`);
  const seen = new Set<string>();
  const items = willItems(state, hero);
  const receivers = willReceivers(state, hero);
  for (const { item, to } of order.items) {
    if (seen.has(item)) throw new Error(`Item ${item} is left twice`);
    seen.add(item);
    if (!items.some((h) => h.id === item)) throw new Error(`${item} is not a thing the hero holds`);
    if (!receivers.some((c) => c.id === to)) throw new Error(`${to} cannot receive ${item}`);
  }
  const action = content.actions.find((a) => a.id === pace.willAction);
  if (!action) throw new Error(`Unknown action "${pace.willAction}"`);
  const current = state.activeAction;
  if (current?.actionId === action.id) throw new Error('The hero is already at the notary');
  // A change of occupation breaks off the one under way with a journal line, as `start` does; an idle life leaves none.
  if (current && !content.actions.find((a) => a.id === current.actionId)?.idle) {
    log(ctx, { subject: hero, kind: 'interrupt', level: 'journal', template: state.interruptRequest?.template ?? timeContent(content).texts.interrupted });
  }
  const duration = int(state.rng, action.duration.min, action.duration.max);
  state.willDraft = { heir: order.heir, guardian: order.guardian, items: order.items.map((i) => ({ item: i.item, to: i.to })) };
  stopJourney(ctx);
  state.activeAction = { actionId: action.id, endDay: state.day + duration, target: null };
  state.interruptRequest = null;
}
