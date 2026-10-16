import { findCharacter } from '../helpers';
import type { Character, Ctx } from '../state';
import { isNear } from '../world/world';
import { childrenOf } from './kin';
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

/** Who may be the suitor: the hero and the hero's children near the hero. */
function suitors(ctx: Ctx): Character[] {
  const { state } = ctx;
  const hero = findCharacter(state, state.playerId);
  if (!hero || hero.deathDay !== null) return [];
  return [hero, ...childrenOf(state, hero.id).filter((c) => nearAlive(ctx, c))];
}

function fits(ctx: Ctx, suitor: Character, target: Character): boolean {
  return target.id !== ctx.state.playerId && nearAlive(ctx, target) && canMarry(ctx, suitor, target);
}

/**
 * Matches the player could propose to the person `id` and their family (4.1 contract, D-313): the hero or a child of
 * the hero near the hero, with the person or a child of theirs near the hero — both of age, unmarried, a man and a
 * woman, not close kin. Only while the player picks an action. A pure query: no randomness, no changes. The page
 * (4.5) and the bot (4.6) call it.
 */
export function proposalOptions(ctx: Ctx, id: string): ProposalOption[] {
  const { state, content } = ctx;
  if (!content.family || state.status !== 'awaiting_action') return [];
  const person = findCharacter(state, id);
  if (!person) return [];
  const targets = [person, ...childrenOf(state, id)];
  const out: ProposalOption[] = [];
  for (const suitor of suitors(ctx)) {
    for (const target of targets) if (fits(ctx, suitor, target)) out.push({ suitor: suitor.id, target: target.id });
  }
  return out;
}

/** True if the match is one `proposalOptions` offers for some page: the check of the command `propose`. */
export function proposalAllowed(ctx: Ctx, suitorId: string, targetId: string): boolean {
  const { state } = ctx;
  const target = findCharacter(state, targetId);
  if (!target) return false;
  const suitor = suitors(ctx).find((s) => s.id === suitorId);
  return suitor !== undefined && fits(ctx, suitor, target);
}
