import type { Content } from '../content/schema';
import { findCharacter, isInt, newId } from '../helpers';
import { routesFrom, standingIn } from '../place/place';
import type { DeathHook, GameState, Invariant, RefsFn } from '../state';

/**
 * Contracts (CK.2a, D-473, D-474): work a person of the world offers on the board of a place, at a level 0–3 that sets
 * the pay. The hero takes one at a time by starting an action with `target: contract` (actions/): from then on it is
 * his `current` contract, served by that action (`activeAction.contract`). Work elsewhere (`to`) is a journey there;
 * other work takes its own days where it is offered. When the action ends the contract is settled (`contracts/phases.ts`):
 * success pays and runs the outcome of its kind, failure or a contract left half done runs the other outcome.
 *
 * CK.2a lays the part of the state and its points of connection; the boards are filled by CK.3.
 */
export interface Contract {
  /** Permanent id, `k` and digits: a record without a page (D-311). */
  id: string;
  /** Id of a kind in `contracts.kinds`. */
  kind: string;
  /** Record id of the place whose board offers it. */
  place: string;
  /** The person who offers the work and pays for it. */
  employer: string;
  /** 0–3 (D-474): the pay doubles from level to level. */
  level: number;
  /** Crowns paid on success (D-441: from the level, not from the hero's status, D-473). */
  pay: number;
  /** Record id of the place the work leads to; null for work where it is offered. */
  to: string | null;
  /** Days of work where it is offered; work elsewhere takes the days of the road instead. */
  days: number;
  /** The last day the offer stays on the board. */
  expires: number;
}

/** Outcome marked on the contract under way by the effect `contract_outcome` (an event of the contract); null: none yet. */
export type ContractOutcome = 'success' | 'failure';

export interface CurrentContract extends Contract {
  outcome: ContractOutcome | null;
  /** Day the hero took it. */
  start: number;
  /** The complication of its kind has been rolled for (CK.3): it comes at most once, halfway through the work. */
  rolled: boolean;
}

export interface ContractsState {
  contracts: {
    /** Offers on the boards of all places, in the order they were posted. */
    offers: Contract[];
    /** The contract the hero has taken and serves now; null when he has none. */
    current: CurrentContract | null;
    /** Month number (year × 12 + month − 1) the boards were last refreshed in; null before the first. */
    month: number | null;
    /** Record ids of the places whose boards were refreshed in that month, in the order refreshed (CK.3). */
    posted: string[];
  };
}

export function initContractsState(): ContractsState {
  return { contracts: { offers: [], current: null, month: null, posted: [] } };
}

/** The highest level of a contract (D-474: levels 0–3). */
export const MAX_CONTRACT_LEVEL = 3;

/**
 * Posts an offer on the board of a place and returns it (CK.3 fills the boards through it). The id is new; nothing is
 * checked here beyond what the invariants check after the command.
 */
export function postOffer(state: GameState, offer: Omit<Contract, 'id'>): Contract {
  const posted: Contract = { id: newId(state, 'k'), ...offer };
  state.contracts.offers.push(posted);
  return posted;
}

/** Offers on the board of the place the hero stands in (not passing through, D-462), in the order posted. Pure. */
export function offersHere(state: GameState, content: Content): Contract[] {
  const here = standingIn(state, content);
  if (here === null) return [];
  return state.contracts.offers.filter((o) => o.place === here && o.expires >= state.day);
}

/** Why the hero cannot take work now, as reason texts (D-043): he has some, or the board here is empty. Pure. */
export function contractReasons(state: GameState, content: Content): string[] {
  const reasons = content.contracts?.reasons;
  if (!reasons) return [''];
  if (state.contracts.current !== null) return [reasons.busy];
  if (offersHere(state, content).length === 0) return [reasons.none];
  return [];
}

/** What taking the offer means: the place a journey leads to (null for work here) and the days it takes. */
export interface ContractPlan {
  to: string | null;
  days: number;
}

/**
 * The plan of the offer `id` for the hero now: work here takes its own days, work elsewhere the days of the shortest way
 * there (D-462). Throws when the offer cannot be taken: unknown, not on the board where he stands, he already has work,
 * or no way leads to its place. Pure.
 */
export function contractPlan(state: GameState, content: Content, id: string): ContractPlan {
  if (state.contracts.current !== null) throw new Error('The hero already has work under way');
  const offer = offersHere(state, content).find((o) => o.id === id);
  if (!offer) throw new Error(`No offer "${id}" on the board where the hero stands`);
  if (offer.to === null) return { to: null, days: offer.days };
  const way = routesFrom(state, content).find((r) => r.to === offer.to);
  if (!way) throw new Error(`No way leads to the place of the offer "${id}"`);
  return { to: offer.to, days: way.days };
}

/** The offer leaves the board and becomes the hero's contract (`startAction` calls it after its checks). */
export function takeContract(state: GameState, id: string): CurrentContract {
  const index = state.contracts.offers.findIndex((o) => o.id === id);
  if (index < 0) throw new Error(`No offer "${id}"`);
  const [offer] = state.contracts.offers.splice(index, 1) as [Contract];
  const current: CurrentContract = { ...offer, outcome: null, start: state.day, rolled: false };
  state.contracts.current = current;
  return current;
}

/** The kind of the contract the hero serves now: taken and its action under way; null otherwise. Pure. */
export function contractUnderWay(state: GameState): CurrentContract | null {
  const current = state.contracts.current;
  return current !== null && state.activeAction?.contract === current.id ? current : null;
}

/**
 * Death (CK.2a): the offers of a dead employer leave the boards; the hero's death drops his contract (his heir does not
 * serve it). A contract whose employer dies stays: it is settled as any other.
 */
export const contractsOnDeath: DeathHook = ({ state }, c) => {
  state.contracts.offers = state.contracts.offers.filter((o) => o.employer !== c.id);
  if (c.id === state.playerId) state.contracts.current = null;
};

/** The employers of the offers and of the hero's contract stay in the hot part (D-312). */
export const contractsRefs: RefsFn = ({ state }) => [
  ...state.contracts.offers.map((o) => o.employer),
  ...(state.contracts.current ? [state.contracts.current.employer] : []),
];

function contractProblems(state: GameState, content: Content, c: Contract, what: string): string[] {
  const problems: string[] = [];
  const places = new Set(state.place.places.map((p) => p.id));
  if (!/^k\d+$/.test(c.id)) problems.push(`${what} ${c.id}: id is not k and digits`);
  if (!content.contracts?.kinds.some((k) => k.id === c.kind)) problems.push(`${what} ${c.id}: unknown kind ${c.kind}`);
  if (!places.has(c.place)) problems.push(`${what} ${c.id}: unknown place ${c.place}`);
  if (c.to !== null && (!places.has(c.to) || c.to === c.place)) problems.push(`${what} ${c.id}: leads to ${c.to}`);
  if (!findCharacter(state, c.employer)) problems.push(`${what} ${c.id}: unknown employer ${c.employer}`);
  if (!isInt(c.level) || c.level < 0 || c.level > MAX_CONTRACT_LEVEL) problems.push(`${what} ${c.id}: level ${String(c.level)}`);
  if (!isInt(c.pay) || c.pay < 0) problems.push(`${what} ${c.id}: pay ${String(c.pay)}`);
  if (!isInt(c.days) || c.days < 1) problems.push(`${what} ${c.id}: days ${String(c.days)}`);
  if (!isInt(c.expires)) problems.push(`${what} ${c.id}: expires ${String(c.expires)}`);
  return problems;
}

export const contractsInvariants: Invariant = ({ state, content }) => {
  const { offers, current, month } = state.contracts;
  const problems: string[] = [];
  if (!content.contracts && (offers.length > 0 || current !== null)) problems.push('contracts in the state without contracts in the content');
  const ids = new Set<string>();
  for (const o of [...offers, ...(current ? [current] : [])]) {
    if (ids.has(o.id)) problems.push(`contract ${o.id} twice`);
    ids.add(o.id);
  }
  for (const o of offers) {
    problems.push(...contractProblems(state, content, o, 'offer'));
    const employer = findCharacter(state, o.employer);
    if (employer && employer.deathDay !== null) problems.push(`offer ${o.id}: the employer is dead`);
  }
  if (current) {
    problems.push(...contractProblems(state, content, current, 'contract'));
    if (current.outcome !== null && current.outcome !== 'success' && current.outcome !== 'failure') problems.push(`contract ${current.id}: outcome ${String(current.outcome)}`);
    // after every command a contract is served by the action under way, or has been settled (`settleContract`)
    if (state.activeAction?.contract !== current.id) problems.push(`contract ${current.id} without its action`);
  }
  const serving = state.activeAction?.contract ?? null;
  if (serving !== null && current?.id !== serving) problems.push(`the action serves ${serving}, which is not the hero's contract`);
  if (month !== null && !isInt(month)) problems.push(`contracts: month is not a whole number: ${String(month)}`);
  const places = new Set(state.place.places.map((p) => p.id));
  const posted = state.contracts.posted;
  if (new Set(posted).size !== posted.length || posted.some((id) => !places.has(id))) problems.push(`contracts: boards refreshed ${posted.join(', ')}`);
  if (current && (!isInt(current.start) || current.start > state.day || typeof current.rolled !== 'boolean')) problems.push(`contract ${current.id}: start ${String(current.start)}, rolled ${String(current.rolled)}`);
  return problems;
};
