import { findCharacter } from '../helpers';
import type { Character, Ctx } from '../state';
import { isNear } from '../world/world';
import { canMarry } from './rules';

/** A match the player could propose from the page of a person (D-313): `suitor` is the hero or a child of the hero. */
export interface ProposalOption {
  suitor: string;
  /** The person of the page or a child of theirs. */
  target: string;
}

/** Living and near the hero (the household or the circle): the roles of the proposal event take only such people. */
function nearAlive(ctx: Ctx, c: Character | null): c is Character {
  return c !== null && c.deathDay === null && isNear(ctx.state, c.id);
}

/** People near the hero (the household and the circle), living: the only ones the proposal event can take. */
function nearPeople(ctx: Ctx): Character[] {
  const { state } = ctx;
  return [...state.household, ...state.circle].map((id) => findCharacter(state, id)).filter((c): c is Character => c !== null && c.deathDay === null);
}

/**
 * Who may be the suitor: the hero and the hero's children near the hero, unmarried. Children are looked up among the
 * people near the hero, not among everyone: the bot asks this for every person near the hero before each action (4.6).
 */
function suitors(ctx: Ctx, near: readonly Character[]): Character[] {
  const { state } = ctx;
  const hero = findCharacter(state, state.playerId);
  if (!hero || hero.deathDay !== null) return [];
  return [hero, ...near.filter((c) => c.father === hero.id || c.mother === hero.id)].filter((c) => c.spouse === null);
}

function fits(ctx: Ctx, suitor: Character, target: Character): boolean {
  return target.id !== ctx.state.playerId && nearAlive(ctx, target) && canMarry(ctx, suitor, target);
}

/**
 * Matches the player could propose to the person `id` and their family (4.1 contract, D-313): the hero or a child of
 * the hero near the hero, with the person or a child of theirs near the hero — both of age, unmarried, a man and a
 * woman, not close kin. While the player picks an action or one runs (live time, D-439): the answer is an event that
 * stops the clock, and the action goes on after it. A pure query: no randomness, no changes. The page
 * (4.5) and the bot (4.6) call it.
 */
export function proposalOptions(ctx: Ctx, id: string): ProposalOption[] {
  const { state, content } = ctx;
  if (!content.family || (state.status !== 'awaiting_action' && state.status !== 'running')) return [];
  const person = findCharacter(state, id);
  if (!person) return [];
  const near = nearPeople(ctx);
  const free = suitors(ctx, near);
  if (free.length === 0) return [];
  const targets = [person, ...near.filter((c) => c.father === id || c.mother === id)];
  const out: ProposalOption[] = [];
  for (const suitor of free) {
    for (const target of targets) if (fits(ctx, suitor, target)) out.push({ suitor: suitor.id, target: target.id });
  }
  return out;
}

/** True if the match is one `proposalOptions` offers for some page: the check of the command `propose`. */
export function proposalAllowed(ctx: Ctx, suitorId: string, targetId: string): boolean {
  const { state } = ctx;
  const target = findCharacter(state, targetId);
  if (!target) return false;
  const suitor = suitors(ctx, nearPeople(ctx)).find((s) => s.id === suitorId);
  return suitor !== undefined && fits(ctx, suitor, target);
}
