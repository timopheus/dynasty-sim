import { z } from 'zod';
import type { Character, Ctx, Scope } from '../state';
import { contractUnderWay } from './contracts';

/**
 * Effect keys of this module (CK.2a): `contract_outcome: success | failure` marks how the hero's contract under way ends
 * (an event of the contract: the letter stolen, the debtor paid up); the last mark counts. Nothing is settled here: the
 * contract is settled when its action ends (`contracts/phases.ts`), unmarked as a success. On anyone but the hero, or
 * with no contract under way, the key does nothing. Like every file that feeds effects.ts, it must not import effects.ts.
 */
export const contractsEffectShape = {
  contract_outcome: z.enum(['success', 'failure']).optional(),
};

export function applyContractsEffects({ state }: Ctx, c: Character, effects: { contract_outcome?: 'success' | 'failure' | undefined }, _scope: Scope): void {
  if (effects.contract_outcome === undefined || c.id !== state.playerId) return;
  const current = contractUnderWay(state);
  if (current) current.outcome = effects.contract_outcome;
}
