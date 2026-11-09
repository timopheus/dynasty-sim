import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Text, type ContentError } from '../content/types';
import { effectRoleRefs, EffectsSchema } from '../effects';

/** How a contract ends: the line of the journal or chronicle (`{name}`, `{employer}`) and the effects on the hero. */
const ContractOutcomeSchema = z.strictObject({
  text: Text,
  /** Effects on the hero; the employer is the role `employer` (empty when the employer has died). */
  effects: EffectsSchema.optional(),
});

/** One kind of contract (CK.2a): CK.3 adds where it is offered, its levels, days and risk. */
export const ContractKindSchema = z.strictObject({
  id: Id,
  name: Text,
  /** The work is done: the pay of the contract, then these effects. */
  success: ContractOutcomeSchema,
  /** The work failed (an event of the contract said so) or was left half done. */
  failure: ContractOutcomeSchema,
});

/**
 * Optional top-level key `contracts` (CK.2a, D-474):
 * - `kinds`: kinds of contracts and how each ends;
 * - `reasons`: texts of unmet conditions — `none` (no work on the board here), `busy` (work under way), `taken` and
 *   `free` (`contract_taken: true / false`), `kind` (`{kinds}`), `level` (`{level}`).
 */
export const ContractsContentSchema = z.strictObject({
  kinds: z.array(ContractKindSchema).min(1),
  reasons: z.strictObject({ none: Text, busy: Text, taken: Text, free: Text, kind: Text, level: Text }),
});

export type ContractKindDef = z.infer<typeof ContractKindSchema>;
export type ContractsContent = z.infer<typeof ContractsContentSchema>;

/** Keys of conditions and effects of the module (`conditions.ts`, `effects.ts`): they need the key `contracts`. */
const KIND_KEYS = ['contract_kind'];
const OTHER_KEYS = ['contract_taken', 'contract_level_min', 'contract_outcome'];

/** Placeholders of the lines of an outcome: the hero's and `{employer}`. */
const OUTCOME_PLACEHOLDERS = [...PLACEHOLDERS, 'employer'];

/** Roles the effects of an outcome may name. */
const OUTCOME_ROLES = ['hero', 'protagonist', 'employer'];

/**
 * Kinds are unique and their lines well formed; the keys of the module, actions with `target: contract` and events bound
 * to contracts (`contract:`) need the key `contracts` and name known kinds. An event of a contract gets the employer
 * handed over: its only role `pick: given` is `employer`, and it is the hero's own event (not `who: npc`, not a story or
 * a scene of the backstory).
 */
export const checkContracts: CrossCheck = ({ contracts, actions, events }) => {
  const errors: ContentError[] = [];
  const kinds = new Set<string>();
  for (const { file, item } of contracts) {
    const err = (path: string, message: string) => errors.push({ file, path: `contracts.${path}`, message });
    item.kinds.forEach((k, i) => {
      if (kinds.has(k.id)) err(`kinds[${i}].id`, `duplicate kind "${k.id}"`);
      kinds.add(k.id);
      for (const end of ['success', 'failure'] as const) {
        const problem = checkReason(k[end].text, OUTCOME_PLACEHOLDERS);
        if (problem) err(`kinds[${i}].${end}.text`, problem);
        const effects = k[end].effects;
        for (const role of effects ? effectRoleRefs(effects) : []) {
          if (!OUTCOME_ROLES.includes(role)) err(`kinds[${i}].${end}.effects`, `unknown role "${role}": an outcome knows hero, protagonist and employer`);
        }
      }
    });
    for (const [key, allowed] of [['none', []], ['busy', []], ['taken', []], ['free', []], ['kind', ['kinds']], ['level', ['level']]] as const) {
      const problem = checkReason(item.reasons[key], allowed);
      if (problem) err(`reasons.${key}`, problem);
    }
  }
  const none = contracts.length === 0;
  const needKey = (file: string, path: string) => errors.push({ file, path, message: 'contracts need the top-level key "contracts"' });
  const users: { file: string; base: string; item: unknown }[] = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item as unknown })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item as unknown })),
    ...contracts.map((c) => ({ file: c.file, base: 'contracts', item: c.item as unknown })),
  ];
  for (const { file, base, item } of users) {
    walkKeys(item, base, KIND_KEYS, (v, path) => {
      if (none) return needKey(file, path);
      for (const id of v as string[]) if (!kinds.has(id)) errors.push({ file, path, message: `unknown kind of contract "${id}"` });
    });
    walkKeys(item, base, OTHER_KEYS, (_v, path) => {
      if (none) needKey(file, path);
    });
  }
  for (const { file, index, item } of actions) {
    if (item.target !== 'contract') continue;
    const path = `actions[${index}]`;
    if (none) needKey(file, `${path}.target`);
    if (item.until) errors.push({ file, path: `${path}.until`, message: 'an action that serves a contract ends with its work, not by a goal' });
  }
  for (const { file, index, item } of events) {
    if (!item.contract) continue;
    const path = `events[${index}]`;
    item.contract.forEach((id, i) => {
      if (none) needKey(file, `${path}.contract[${i}]`);
      else if (!kinds.has(id)) errors.push({ file, path: `${path}.contract[${i}]`, message: `unknown kind of contract "${id}"` });
    });
    if (item.who === 'npc') errors.push({ file, path: `${path}.contract`, message: 'an event of who: npc is not bound to the contract of the hero' });
    if (item.story !== undefined || item.deck === 'backstory') errors.push({ file, path: `${path}.contract`, message: 'an event of a contract is not an event of a story or of the backstory' });
    for (const [name, role] of Object.entries(item.roles ?? {})) {
      if (role.pick === 'given' && name !== 'employer') errors.push({ file, path: `${path}.roles.${name}`, message: 'an event of a contract is handed over only its employer (role "employer")' });
    }
  }
  return errors;
};
