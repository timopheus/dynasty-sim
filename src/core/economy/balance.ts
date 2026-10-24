import type { Content } from '../content/schema';
import { factorParts, type FactorValue } from '../content/types';
import { spouseOf } from '../family/family';
import { houseOf } from '../house/house';
import { childrenOf } from '../family/kin';
import { stats } from '../character/stats';
import { findTrait } from '../character/holding';
import type { Character, Ctx } from '../state';
import { ageYears } from '../time/calendar';
import { referenceIncome } from './economy';

/** One line of the monthly balance: signed crowns, with the name the header shows. */
export interface BalanceLine {
  id: 'work' | 'living' | 'spouse' | 'children';
  label: string;
  amount: number;
}

/** The monthly balance of a character (S.7): the sum and the lines it is made of. */
export interface MonthlyBalance {
  total: number;
  lines: BalanceLine[];
}

const NONE: MonthlyBalance = { total: 0, lines: [] };

/** Crowns of a part of R, rounded down: the same rule as the price levels (`crownsAt`). */
function partOf(income: number, factor: FactorValue): number {
  const { num, den } = factorParts(factor);
  return Math.floor((income * num) / den);
}

/** A sum changed by whole percents, rounded down. */
function changed(crowns: number, percent: number): number {
  return Math.floor((crowns * (100 + percent)) / 100);
}

/**
 * Percents on income and on upkeep from Stewardship, a stewardship education and traits (`economy.adjust`), each
 * within ±cap. Never consumes randomness.
 */
function adjustments(ctx: Ctx, c: Character): { income: number; upkeep: number } {
  const { adjust } = ctx.content.economy as NonNullable<Content['economy']>;
  const over = stats(ctx, c).stewardship - adjust.stewardship.from;
  let income = over * adjust.stewardship.income;
  let upkeep = -over * adjust.stewardship.upkeep;
  for (const id of c.traits) {
    const def = findTrait(ctx.content, id);
    if (def?.education?.stat === 'stewardship') income += def.education.level * adjust.education.income;
    const entry = adjust.traits.find((t) => t.id === id);
    income += entry?.income ?? 0;
    upkeep += entry?.upkeep ?? 0;
  }
  const clamp = (n: number) => Math.max(-adjust.cap, Math.min(adjust.cap, n));
  return { income: clamp(income), upkeep: clamp(upkeep) };
}

/**
 * What the character earns and spends in a month (S.7, D-326, D-441): income of the occupation (the active action of
 * the hero, `economy.work`) minus the costs — the decency of the house status, the spouse, each child of the household
 * under age; a hero under age pays only the small share the guardian does not cover. All are parts of the reference
 * income R of the house status, changed by Stewardship and traits. Nothing without the key `economy`. A query: never
 * consumes randomness and changes nothing.
 */
export function monthlyBalance(ctx: Ctx, c: Character): MonthlyBalance {
  const { state, content } = ctx;
  const economy = content.economy;
  if (!economy) return NONE;
  const r = referenceIncome(content, state, c);
  const pct = adjustments(ctx, c);
  const lines: BalanceLine[] = [];
  const add = (id: BalanceLine['id'], amount: number) => {
    if (amount !== 0) lines.push({ id, label: economy.texts.lines[id], amount });
  };

  const active = c.id === state.playerId ? state.activeAction : null;
  const work = economy.work.find((w) => w.action === active?.actionId);
  if (work) add('work', changed(partOf(r, work.part), pct.income));

  const minor = ageYears(c.birthDay, state.day) < content.settings.adultAge;
  if (minor) {
    add('living', -changed(partOf(r, economy.upkeep.minor), pct.upkeep));
  } else {
    const status = economy.upkeep.status.find((u) => u.status === (houseOf(state, c)?.status ?? '')) ?? economy.upkeep.status[0];
    add('living', -changed(partOf(r, status?.part ?? 1), pct.upkeep));
    const spouse = spouseOf(ctx, c.id);
    if (spouse && spouse.deathDay === null) add('spouse', -changed(partOf(r, economy.upkeep.spouse), pct.upkeep));
    const kids = childrenOf(state, c.id).filter((k) => k.deathDay === null && ageYears(k.birthDay, state.day) < content.settings.adultAge);
    add('children', -changed(partOf(r, economy.upkeep.child), pct.upkeep) * kids.length);
  }
  return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines };
}
