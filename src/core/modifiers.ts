/**
 * Assembly file (D-052): stat modifiers that modules add to a character's stats.
 * 2.3 sums them into the stats, 2.9 adds health stage penalties in health/.
 */
import { healthStatModifiers } from './health/health';
import type { Character, Ctx } from './state';

/** Each source returns stat id -> integer change. */
const STAT_MODIFIERS: readonly ((ctx: Ctx, c: Character) => Record<string, number>)[] = [healthStatModifiers];

export function statModifiers(ctx: Ctx, c: Character): Record<string, number>[] {
  return STAT_MODIFIERS.map((source) => source(ctx, c));
}
