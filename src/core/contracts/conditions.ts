import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { contractUnderWay, MAX_CONTRACT_LEVEL } from './contracts';

/**
 * Condition keys of this module (CK.2a); they name nobody else:
 * - `contract_taken: true | false` — the hero serves a contract now, or serves none;
 * - `contract_kind: [letter, escort]` — the contract under way is of one of these kinds (`contracts.kinds`);
 * - `contract_level_min: N` — the contract under way is of level N or higher (0–3).
 * Unmet, the reason is visible (`contracts.reasons`): the hero knows his work. Only the hero takes contracts: for anyone
 * else the condition is unmet and hidden, as it is without contracts in the content. Must not import condition-keys.ts
 * at run time.
 */
export const contractsConditionShape = {
  contract_taken: z.boolean().optional(),
  contract_kind: z.array(Id).min(1).optional(),
  contract_level_min: Int.min(0).max(MAX_CONTRACT_LEVEL).optional(),
};

interface ContractsWhen {
  contract_taken?: boolean | undefined;
  contract_kind?: string[] | undefined;
  contract_level_min?: number | undefined;
}

export function checkContractsConditions(ctx: Ctx, c: Character, when: ContractsWhen, _scope: Scope): Unmet[] {
  if (when.contract_taken === undefined && when.contract_kind === undefined && when.contract_level_min === undefined) return [];
  const { state, content } = ctx;
  const contracts = content.contracts;
  if (!contracts || c.id !== state.playerId) return [{ text: '', hidden: true }];
  const { reasons } = contracts;
  const current = contractUnderWay(state);
  const out: Unmet[] = [];
  if (when.contract_taken === true && current === null) out.push({ text: reasons.taken, hidden: false });
  if (when.contract_taken === false && current !== null) out.push({ text: reasons.free, hidden: false });
  if (when.contract_kind && (current === null || !when.contract_kind.includes(current.kind))) {
    const names = when.contract_kind.map((id) => contracts.kinds.find((k) => k.id === id)?.name ?? id);
    out.push({ text: fillReason(reasons.kind, { kinds: joinOr(names, content) }), hidden: false });
  }
  if (when.contract_level_min !== undefined && (current === null || current.level < when.contract_level_min)) {
    out.push({ text: fillReason(reasons.level, { level: String(when.contract_level_min) }), hidden: false });
  }
  return out;
}
