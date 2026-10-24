import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { checkTemplate } from '../text/text';
import { Factor, factorParts, Id, Int, Text, type ContentError } from '../content/types';

/**
 * Optional top-level key `economy` (D-326, D-441; points of S.5a, filled by S.7). Lists are arrays in file order:
 * - `income`: the monthly reference income R of each house status, in crowns (`docs/reference/prices-1700.md`);
 *   prices and costs are parts of R, so the same thing costs a noble more than a commoner;
 * - `levels`: price levels as a part of R — a whole number or a fraction `"n/d"` (`trifle` 1/10 … `ruinous` 12);
 * - `work`: the monthly income of an action as a part of R, by action id (S.7); an action not listed brings nothing;
 * - `upkeep`: the monthly costs as parts of R (S.7): by house status (decency of the position), per spouse, per child
 *   of the household, and for a hero under age (whom the guardian feeds) instead of the status;
 * - `adjust`: whole percents on income and upkeep, never more than `cap` either way: per point of Stewardship over
 *   `stewardship.from` (more income, less upkeep), per level of a stewardship education, and by trait;
 * - `reasons.afford`: text of the unmet condition `can_afford` (`{crowns}`);
 * - `texts`: the chronicle line of debt (`{name}`) and the names of the lines of the balance in the header.
 */
export const EconomyContentSchema = z.strictObject({
  income: z.array(z.strictObject({ status: Id, crowns: Int.min(1) })).min(1),
  levels: z.array(z.strictObject({ id: Id, part: Factor })).min(1),
  work: z.array(z.strictObject({ action: Id, part: Factor })),
  upkeep: z.strictObject({
    status: z.array(z.strictObject({ status: Id, part: Factor })).min(1),
    spouse: Factor,
    child: Factor,
    minor: Factor,
  }),
  adjust: z.strictObject({
    cap: Int.min(0).max(100),
    stewardship: z.strictObject({ from: Int.min(0), income: Int, upkeep: Int }),
    education: z.strictObject({ income: Int }),
    traits: z.array(z.strictObject({ id: Id, income: Int.optional(), upkeep: Int.optional() })),
  }),
  reasons: z.strictObject({ afford: Text }),
  texts: z.strictObject({
    debt: Text,
    lines: z.strictObject({ work: Text, living: Text, spouse: Text, children: Text }),
  }),
});

export type EconomyContent = z.infer<typeof EconomyContentSchema>;

/**
 * A price in events and actions: a level (`pay: minor`) or a level times a whole number (`pay: {level: notable,
 * times: 2}`), because rounding a sum to the nearest level would change sums of 20–30 crowns by half (D-441).
 */
export const PriceRef = z.union([Id, z.strictObject({ level: Id, times: Int.min(1) })]);

export type PriceRefValue = z.infer<typeof PriceRef>;

export function priceParts(ref: PriceRefValue): { level: string; times: number } {
  return typeof ref === 'string' ? { level: ref, times: 1 } : ref;
}

/** Crowns of a price for one reference income R: floor(R × part) × times, never below one crown a time. */
export function crownsAt(economy: EconomyContent, income: number, ref: PriceRefValue): number {
  const { level, times } = priceParts(ref);
  const def = economy.levels.find((l) => l.id === level);
  if (!def) return 0;
  const { num, den } = factorParts(def.part);
  return Math.max(1, Math.floor((income * num) / den)) * times;
}

const PRICE_KEYS = ['pay', 'gain', 'can_afford'];

export const checkEconomy: CrossCheck = ({ economy, house, events, actions, traits }) => {
  const errors: ContentError[] = [];
  const statuses = house.flatMap((h) => h.item.statuses.map((s) => s.id));
  const levelIds = new Set(economy.flatMap((e) => e.item.levels.map((l) => l.id)));
  for (const { file, item } of economy) {
    const err = (path: string, message: string) => errors.push({ file, path: `economy.${path}`, message });
    const seenLevels = new Set<string>();
    item.levels.forEach((l, i) => {
      if (seenLevels.has(l.id)) err(`levels[${i}].id`, `duplicate level "${l.id}"`);
      seenLevels.add(l.id);
    });
    const seenStatuses = new Set<string>();
    item.income.forEach((r, i) => {
      if (seenStatuses.has(r.status)) err(`income[${i}].status`, `duplicate status "${r.status}"`);
      seenStatuses.add(r.status);
      if (statuses.length > 0 && !statuses.includes(r.status)) err(`income[${i}].status`, `unknown house status "${r.status}"`);
    });
    // Every status of the house has its own income: else a guild house would pay the prices of commoners.
    for (const s of statuses) if (!seenStatuses.has(s)) err('income', `no income for the house status "${s}"`);
    const problem = checkReason(item.reasons.afford, ['crowns']);
    if (problem) err('reasons.afford', problem);
    const seenWork = new Set<string>();
    item.work.forEach((w, i) => {
      if (seenWork.has(w.action)) err(`work[${i}].action`, `duplicate action "${w.action}"`);
      seenWork.add(w.action);
      if (!actions.some((a) => a.item.id === w.action)) err(`work[${i}].action`, `unknown action "${w.action}"`);
    });
    item.upkeep.status.forEach((u, i) => {
      if (statuses.length > 0 && !statuses.includes(u.status)) err(`upkeep.status[${i}].status`, `unknown house status "${u.status}"`);
    });
    for (const s of statuses) if (!item.upkeep.status.some((u) => u.status === s)) err('upkeep.status', `no upkeep for the house status "${s}"`);
    item.adjust.traits.forEach((t, i) => {
      if (!traits.some((x) => x.item.id === t.id)) err(`adjust.traits[${i}].id`, `unknown trait "${t.id}"`);
    });
    const debt = checkTemplate(item.texts.debt);
    if (debt) err('texts.debt', debt);
  }
  const users: { file: string; base: string; item: unknown }[] = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item as unknown })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item as unknown })),
  ];
  for (const { file, base, item } of users) {
    walkKeys(item, base, PRICE_KEYS, (v, path) => {
      if (economy.length === 0) {
        errors.push({ file, path, message: 'a price key needs the top-level key "economy"' });
        return;
      }
      const level = typeof v === 'string' ? v : (v as { level?: unknown }).level;
      if (typeof level === 'string' && !levelIds.has(level)) errors.push({ file, path, message: `unknown price level "${level}"` });
    });
  }
  return errors;
};
