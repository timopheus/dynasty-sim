import type { Content } from '../content/schema';
import { chancePer, pick, seedRng } from '../rng';
import type { Ctx, GameState } from '../state';
import { characterById } from '../world/world';
import type { Acquaintance, AcquaintanceLevel } from './types';

/** Stream number of the module: the bot has 1 (CLAUDE.md, separate streams). */
const RELATIONS_STREAM = 2;

const RANK: Record<AcquaintanceLevel, number> = { known: 1, close: 2 };

/** Acquaintances of one hero (D-037), newest last. */
export function acquaintancesOf(state: GameState, holder: string): Acquaintance[] {
  return state.acquaintances.filter((a) => a.holder === holder);
}

/**
 * How well `holder` knows `other`: none, known or close. Active relations give at least the level of their kind
 * (friends and patrons are close), so nothing needs storing for them.
 */
export function acquaintanceLevel(state: GameState, content: Content, holder: string, other: string): AcquaintanceLevel | null {
  let best: AcquaintanceLevel | null = state.acquaintances.find((a) => a.holder === holder && a.other === other)?.level ?? null;
  for (const r of state.relations) {
    if (r.end !== null || !((r.a === holder && r.b === other) || (r.b === holder && r.a === other))) continue;
    const level = content.opinions?.relations.find((k) => k.id === r.kind)?.acquaintance;
    if (level && (best === null || RANK[level] > RANK[best])) best = level;
  }
  return best;
}

/**
 * The current hero gets to know someone, or knows them better; never worse (D-037). Events call this for the
 * people who took part (GDD 9). Returns whether the level changed.
 */
export function introduce(ctx: Ctx, other: string, level: AcquaintanceLevel = 'known'): boolean {
  const { state } = ctx;
  const holder = state.playerId;
  if (other === holder) throw new Error('The hero cannot be introduced to themself');
  if (!characterById(state, other)) throw new Error(`Unknown character ${other}`);
  const entry = state.acquaintances.find((a) => a.holder === holder && a.other === other);
  if (!entry) {
    state.acquaintances.push({ holder, other, level, since: state.day, closeSince: level === 'close' ? state.day : null });
    return true;
  }
  if (RANK[level] <= RANK[entry.level]) return false;
  entry.level = level;
  entry.closeSince = state.day;
  return true;
}

/**
 * Time near the hero (2.4, D-037): once a week there is a chance to meet someone of the circle the hero does not know
 * yet, and a chance that someone known for long enough and still around becomes close. The circle comes from 2.5.
 */
export function acquaintanceWeek(ctx: Ctx): void {
  const { state, content } = ctx;
  const config = content.opinions?.acquaintance;
  if (!config) return;
  const rng = (state.relationsRng ??= seedRng(state.seed, RELATIONS_STREAM));
  const holder = state.playerId;
  const own = new Map<string, Acquaintance>();
  for (const a of state.acquaintances) if (a.holder === holder) own.set(a.other, a);
  if (chancePer(rng, config.meetPer100, 100)) {
    const strangers = state.circle.filter((id) => !own.has(id));
    if (strangers.length > 0) introduce(ctx, pick(rng, strangers));
  }
  if (chancePer(rng, config.closePer100, 100)) {
    const ready = state.circle.filter((id) => {
      const a = own.get(id);
      return a !== undefined && a.level === 'known' && state.day - a.since >= config.closeAfterDays;
    });
    if (ready.length > 0) introduce(ctx, pick(rng, ready), 'close');
  }
}
