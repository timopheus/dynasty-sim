import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { applyEffects } from '../effects';
import { findEvent, fireEvent } from '../events/events';
import { grantFavor } from '../favors/favors';
import { findCharacter, getPlayer } from '../helpers';
import { chancePer } from '../rng';
import type { Ctx, DayPhase, NewGameHook, Scope } from '../state';
import { fillTemplate } from '../text/text';
import { isNear } from '../world/world';
import { refreshBoards } from './board';
import type { ContractOutcome, CurrentContract } from './contracts';

/**
 * The day phase of contracts (CK.2a, CK.3), between the arrival (`placePhase`) and the end of the action (`actionEndPhase`):
 * - offers past their last day leave the boards;
 * - boards within reach of the hero get their offers of the month (`refreshBoards`);
 * - halfway through the work the complication of its kind comes with the chance of its risk (the hunt of CK3: start,
 *   complication, end); an event that waits for the player ends the day;
 * - on the last day of the action that serves the hero's contract the contract is settled: as marked by its events
 *   (`contract_outcome`), else as a success. A journey to the work has brought him there the phase before.
 * Without the key `contracts` it does nothing.
 */
export const contractsPhase: DayPhase = {
  id: 'contracts',
  run(ctx) {
    const { state, content } = ctx;
    if (!content.contracts) return false;
    const contracts = state.contracts;
    if (contracts.offers.some((o) => o.expires < state.day)) contracts.offers = contracts.offers.filter((o) => o.expires >= state.day);
    refreshBoards(ctx);
    const current = contracts.current;
    const active = state.activeAction;
    if (!current || active?.contract !== current.id || state.interruptRequest) return false;
    if (state.day >= active.endDay) {
      settle(ctx, current.outcome ?? 'success');
      return false;
    }
    return complication(ctx, current, active.endDay);
  },
};

/** The boards within reach of the founder are there from the first day (CK.3). Uses no randomness of the world. */
export const contractsOnNewGame: NewGameHook = (ctx) => {
  refreshBoards(ctx);
};

/**
 * Halfway through the work, once: the complication of the kind comes with the chance of its risk, to the hero, with the
 * employer handed over while alive and near. Returns true when it waits for the player. The narrator counts it as an
 * event of the day, so its quiet days follow (D-168).
 */
function complication(ctx: Ctx, current: CurrentContract, endDay: number): boolean {
  const { state, content } = ctx;
  if (current.rolled || state.day < current.start + Math.floor((endDay - current.start) / 2)) return false;
  current.rolled = true;
  const offer = content.contracts?.kinds.find((k) => k.id === current.kind)?.offer;
  const chance = content.contracts?.board?.risks.find((r) => r.id === offer?.risk)?.chance ?? 0;
  if (!offer?.complication || !chancePer(state.rng, chance, 100)) return false;
  const employer = findCharacter(state, current.employer);
  const given: Scope = employer && employer.deathDay === null && isNear(state, employer.id) ? { employer: employer.id } : {};
  const event = findEvent(content, offer.complication);
  const result = fireEvent(ctx, event, getPlayer(state), given);
  if (result === 'failed') return false;
  state.lastFired[event.id] = state.day;
  state.lastEventDay = state.day;
  return result === 'waiting';
}

/**
 * Settles the hero's contract once the action that served it is gone (game.ts calls it after every command): another
 * occupation, an illness or a window broke it off. Work left half done is a failure, unless an event already marked it a
 * success. Does nothing while the action still serves it, or without a contract.
 */
export function settleContract(ctx: Ctx): void {
  const current = ctx.state.contracts.current;
  if (!current || ctx.state.activeAction?.contract === current.id) return;
  settle(ctx, current.outcome === 'success' ? 'success' : 'failure');
}

/**
 * The contract ends: on success the hero is paid, and from `favorLevel` the employer owes him a favor (a strong one at
 * level 3 for a kind with `strongFavor`); then the outcome of its kind — its effects on the hero and on the employer
 * while alive (the role `employer`) and its line with the money it brought: in the chronicle for a failure and from
 * `chronicleLevel`, else in the journal (D-203).
 */
function settle(ctx: Ctx, outcome: ContractOutcome): void {
  const { state, content } = ctx;
  const current = state.contracts.current;
  state.contracts.current = null;
  const contracts = content.contracts;
  const kind = current ? contracts?.kinds.find((k) => k.id === current.kind) : undefined;
  if (!current || !contracts || !kind) return;
  const hero = getPlayer(state);
  const employer = findCharacter(state, current.employer);
  const alive = employer !== null && employer.deathDay === null;
  const scope = { hero: hero.id, protagonist: hero.id, ...(alive ? { employer: current.employer } : {}) };
  const end = kind[outcome];
  const before = hero.money;
  if (outcome === 'success') {
    hero.money += current.pay;
    if (alive && contracts.favorLevel !== undefined && current.level >= contracts.favorLevel) {
      grantFavor(state, content, current.employer, hero.id, kind.offer?.strongFavor && current.level >= 3 ? 'strong' : 'weak');
    }
  }
  applyEffects(ctx, hero, end.effects, scope);
  if (employer && alive) applyEffects(ctx, employer, end.on?.employer, scope);
  const parts = fillTemplate(end.text, { ...placeholderValues(hero, state.day), employer: employer ? { id: employer.id, name: fullName(employer) } : current.employer });
  const chronicle = outcome === 'failure' || (contracts.chronicleLevel !== undefined && current.level >= contracts.chronicleLevel);
  log(ctx, { subject: hero, kind: 'contract', level: chronicle ? 'chronicle' : 'journal', parts, money: hero.money - before });
}
