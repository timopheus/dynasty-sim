import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { DayRange, Id, Int, Range, Text, type ContentError } from '../content/types';
import { effectRoleRefs, EffectsSchema } from '../effects';

/**
 * How a contract ends: the line of the journal or chronicle (`{name}`, `{employer}`), the effects on the hero and, as in
 * an event, on the employer (`on: {employer: …}`, skipped once the employer has died).
 */
const ContractOutcomeSchema = z.strictObject({
  text: Text,
  /** Effects on the hero; the employer is the role `employer` (empty when the employer has died). */
  effects: EffectsSchema.optional(),
  /** Effects on the employer (the only role of an outcome); the hero is the role `hero`. */
  on: z.strictObject({ employer: EffectsSchema }).optional(),
});

/** How risky work is, as the board says it (D-463); each has its chance of a complication (`contracts.board.risks`). */
export const RISKS = ['low', 'notable', 'high'] as const;

/**
 * How a kind is offered on the boards (CK.3; numbers are ours, CK3 1.11 has no contracts — D-474):
 * - `employers`: occupations (`population.occupations`) of the people of the circle who offer it;
 * - `places`: kinds of places whose boards offer it;
 * - `levels`: the levels it comes in (0–3), rolled for each offer; the level sets the pay;
 * - `days`: days of work where it is offered, or `to`: the days of the road to the place of the work, one of the two;
 * - `risk`: how risky it is; `weight`: its chance among the kinds a board can offer;
 * - `complication`: an event of the contract that comes halfway through the work with the chance of its risk (the
 *   template of the hunt of CK3: the start, a complication, the end);
 * - `strongFavor`: at level 3 a success makes the employer owe a strong favor instead of a weak one.
 */
const OfferSchema = z
  .strictObject({
    employers: z.array(Id).min(1),
    places: z.array(Id).min(1),
    levels: Range,
    days: DayRange.optional(),
    to: DayRange.optional(),
    risk: z.enum(RISKS),
    weight: Int.min(1),
    complication: Id.optional(),
    strongFavor: z.boolean().optional(),
  })
  .refine((o) => (o.days === undefined) !== (o.to === undefined), 'an offer has either days of work here or days of the road to the work')
  .refine((o) => o.levels.max <= 3, 'levels go from 0 to 3');

/** One kind of contract (CK.2a); `offer` says how the boards offer it (CK.3), without it only tests post it. */
export const ContractKindSchema = z.strictObject({
  id: Id,
  name: Text,
  offer: OfferSchema.optional(),
  /** The work is done: the pay of the contract, then these effects. */
  success: ContractOutcomeSchema,
  /** The work failed (an event of the contract said so) or was left half done. */
  failure: ContractOutcomeSchema,
});

/**
 * The boards (CK.3, D-474): only places within `range` days of the hero have one, as the contracts of RtP lie within reach
 * of the camp; each is refreshed once a month, or when the hero first comes within reach in that month.
 * - `sizes`: how many offers a board of a kind of place holds (rolled each month); a kind not listed has no board;
 * - `stay`: days an offer stays on the board;
 * - `pay`: crowns by level 0–3 (D-473: from the level, not from the hero's status; doubling as in CK3);
 * - `risks`: the word of each risk and its chance in percent of a complication.
 */
const BoardSchema = z.strictObject({
  range: Int.min(0),
  sizes: z.array(z.strictObject({ kind: Id, size: Range })).min(1),
  stay: DayRange,
  pay: z.array(Int.min(0)).length(4),
  risks: z.array(z.strictObject({ id: z.enum(RISKS), name: Text, chance: Int.min(0).max(100) })).length(RISKS.length),
});

/**
 * Optional top-level key `contracts` (CK.2a, CK.3, D-474):
 * - `kinds`: kinds of contracts, how the boards offer each and how each ends;
 * - `board`: the boards (CK.3); without it nothing is offered;
 * - `chronicleLevel`: a success of this level or higher goes to the chronicle, a lower one to the journal; a failure always
 *   goes to the chronicle (the corridor of lines, D-203); without it every line goes to the journal;
 * - `favorLevel`: a success of this level or higher makes the employer owe the hero a favor (D-474; needs `favors`);
 * - `reasons`: texts of unmet conditions — `none` (no work on the board here), `busy` (work under way), `taken` and
 *   `free` (`contract_taken: true / false`), `kind` (`{kinds}`), `level` (`{level}`).
 */
export const ContractsContentSchema = z.strictObject({
  kinds: z.array(ContractKindSchema).min(1),
  board: BoardSchema.optional(),
  chronicleLevel: Int.min(0).max(3).optional(),
  favorLevel: Int.min(0).max(3).optional(),
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
export const checkContracts: CrossCheck = ({ contracts, actions, events, population, places, favors }) => {
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
        const blocks = [k[end].effects, k[end].on?.employer].filter((e) => e !== undefined);
        for (const role of blocks.flatMap((e) => effectRoleRefs(e))) {
          if (!OUTCOME_ROLES.includes(role)) err(`kinds[${i}].${end}.effects`, `unknown role "${role}": an outcome knows hero, protagonist and employer`);
        }
      }
    });
    for (const [key, allowed] of [['none', []], ['busy', []], ['taken', []], ['free', []], ['kind', ['kinds']], ['level', ['level']]] as const) {
      const problem = checkReason(item.reasons[key], allowed);
      if (problem) err(`reasons.${key}`, problem);
    }
    errors.push(...checkOffers(file, item, { events: events.map((e) => e.item), population: population.map((p) => p.item), places: places.map((p) => p.item) }));
    if (item.favorLevel !== undefined && favors.length === 0) err('favorLevel', 'favors from contracts need the top-level key "favors"');
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

interface OfferSources {
  events: readonly { id: string; contract?: string[] | undefined; roles?: Record<string, { pick: string }> | undefined }[];
  population: readonly { occupations: readonly { id: string }[] }[];
  places: readonly { kinds: readonly { id: string }[] }[];
}

/**
 * The boards and the offers of the kinds (CK.3): employers are occupations of the population, places are kinds of places,
 * a complication is an event bound to its kind that gets the employer, the risks are the three of `RISKS` once each, the
 * pay does not fall from level to level. Kinds offered need the key `board`.
 */
function checkOffers(file: string, item: ContractsContent, sources: OfferSources): ContentError[] {
  const errors: ContentError[] = [];
  const err = (path: string, message: string) => errors.push({ file, path: `contracts.${path}`, message });
  const occupations = new Set(sources.population.flatMap((p) => p.occupations.map((o) => o.id)));
  const placeKinds = new Set(sources.places.flatMap((p) => p.kinds.map((k) => k.id)));
  const board = item.board;
  if (board) {
    if (sources.places.length === 0) err('board', 'boards need the top-level key "places"');
    board.sizes.forEach((s, i) => {
      if (sources.places.length > 0 && !placeKinds.has(s.kind)) err(`board.sizes[${i}].kind`, `unknown kind of place "${s.kind}"`);
    });
    const risks = new Set(board.risks.map((r) => r.id));
    if (risks.size !== RISKS.length) err('board.risks', `every risk once: ${RISKS.join(', ')}`);
    board.pay.forEach((p, i) => {
      if (i > 0 && p < (board.pay[i - 1] ?? 0)) err(`board.pay[${i}]`, 'the pay falls from one level to the next');
    });
  }
  item.kinds.forEach((k, i) => {
    const offer = k.offer;
    if (!offer) return;
    const at = `kinds[${i}].offer`;
    if (!board) err(at, 'a kind offered on the boards needs the key "contracts.board"');
    if (sources.population.length === 0) err(`${at}.employers`, 'employers need the top-level key "population"');
    offer.employers.forEach((id, j) => {
      if (sources.population.length > 0 && !occupations.has(id)) err(`${at}.employers[${j}]`, `unknown occupation "${id}"`);
    });
    offer.places.forEach((id, j) => {
      if (sources.places.length > 0 && !placeKinds.has(id)) err(`${at}.places[${j}]`, `unknown kind of place "${id}"`);
    });
    if (offer.complication !== undefined) {
      const event = sources.events.find((e) => e.id === offer.complication);
      if (!event) err(`${at}.complication`, `unknown event "${offer.complication}"`);
      else if (!event.contract?.includes(k.id)) err(`${at}.complication`, `event "${event.id}" is not bound to the kind "${k.id}" (contract: [${k.id}])`);
    }
  });
  return errors;
}
