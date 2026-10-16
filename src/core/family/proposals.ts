import type { Ctx } from '../state';

/** A match the player could propose from the page of a person (D-313): `suitor` is the hero or a child of the hero. */
export interface ProposalOption {
  suitor: string;
  /** The person of the page or a child of theirs. */
  target: string;
}

/**
 * Matches the player could propose to the person `id` and their family (4.1 contract, D-313). A pure query: no
 * randomness, no changes. Empty until 4.5 (age, not married, not close kin); the page (4.5) and the bot (4.6) call it.
 */
export function proposalOptions(_ctx: Ctx, _id: string): ProposalOption[] {
  return [];
}
