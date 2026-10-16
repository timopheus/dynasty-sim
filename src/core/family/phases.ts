import type { Ctx, DayPhase, NewGameHook, SuccessionHook } from '../state';

/**
 * Code of the family module that runs as a phase or a hook (4.1 wires them, 4.5 fills them). Like every file a
 * succession hook lives in, this one never imports lifecycle.ts: a new character comes from `createCharacter` of
 * hooks.ts, a death goes through `state.deathRequests` (D-164).
 */

/** 4.5: pregnancies and births of the hero's house and the couples of the circle; pedigrees of newcomers. */
export const familyPhase: DayPhase = {
  id: 'family',
  run: () => false,
};

/** 4.5: the living kin of the founder (parents, brothers and sisters), the first line of succession (D-315). */
export const familyOnNewGame: NewGameHook = () => {};

/** 4.5: the household of the new head (D-313). */
export const familyOnSuccession: SuccessionHook = () => {};

/** What the `propose` command carries (D-313): a match of the hero or a child of theirs with a person or their child. */
export interface ProposeOrder {
  suitor: string;
  target: string;
}

/**
 * The `propose` command (D-313). 4.5 fires the proposal event of the content (`family.proposalEvent`) with the roles
 * `suitor` and `target`; until then the command is refused. No time passes: the answer is an event.
 */
export function proposeCommand(_ctx: Ctx, _order: ProposeOrder): void {
  throw new Error('Proposals of marriage are not in the game yet');
}
