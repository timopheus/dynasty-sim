import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { applyEffects } from '../effects';
import { findCharacter, getPlayer } from '../helpers';
import type { Ctx, DayPhase } from '../state';
import { fillTemplate } from '../text/text';
import { toYmd } from '../time/calendar';
import type { ContractOutcome } from './contracts';

/**
 * The day phase of contracts (CK.2a), between the arrival (`placePhase`) and the end of the action (`actionEndPhase`):
 * - offers past their last day leave the boards;
 * - on the first day it sees of a new month the boards are refreshed: CK.3 posts the offers of the month here
 *   (`postOffer`); the first day it ever runs only notes the month;
 * - on the last day of the action that serves the hero's contract the contract is settled: as marked by its events
 *   (`contract_outcome`), else as a success. A journey to the work has brought him there the phase before.
 * Returns false: the end of the action hands control back. Without the key `contracts` it does nothing.
 */
export const contractsPhase: DayPhase = {
  id: 'contracts',
  run(ctx) {
    const { state, content } = ctx;
    if (!content.contracts) return false;
    const contracts = state.contracts;
    if (contracts.offers.some((o) => o.expires < state.day)) contracts.offers = contracts.offers.filter((o) => o.expires >= state.day);
    // the month of the boards: CK.3 posts the offers of a new month when it changes, not on the first day the phase runs
    const { year, month } = toYmd(state.day);
    contracts.month = year * 12 + month - 1;
    const current = contracts.current;
    const active = state.activeAction;
    if (current && active?.contract === current.id && !state.interruptRequest && state.day >= active.endDay) settle(ctx, current.outcome ?? 'success');
    return false;
  },
};

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
 * The contract ends: on success the hero is paid; then the outcome of its kind — its effects on the hero and on the
 * employer while alive (the role `employer`) and its line in the journal with the money it brought (CK.3 decides which lines go to
 * the chronicle).
 */
function settle(ctx: Ctx, outcome: ContractOutcome): void {
  const { state, content } = ctx;
  const current = state.contracts.current;
  state.contracts.current = null;
  const kind = current ? content.contracts?.kinds.find((k) => k.id === current.kind) : undefined;
  if (!current || !kind) return;
  const hero = getPlayer(state);
  const employer = findCharacter(state, current.employer);
  const scope = { hero: hero.id, protagonist: hero.id, ...(employer && employer.deathDay === null ? { employer: employer.id } : {}) };
  const end = kind[outcome];
  const before = hero.money;
  if (outcome === 'success') hero.money += current.pay;
  applyEffects(ctx, hero, end.effects, scope);
  if (employer && employer.deathDay === null) applyEffects(ctx, employer, end.on?.employer, scope);
  const parts = fillTemplate(end.text, { ...placeholderValues(hero, state.day), employer: employer ? { id: employer.id, name: fullName(employer) } : current.employer });
  log(ctx, { subject: hero, kind: 'contract', level: 'journal', parts, money: hero.money - before });
}
