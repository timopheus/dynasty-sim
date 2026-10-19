import { allChronicle } from '../core/archive/archive';
import { findTrait } from '../core/character/holding';
import { stats, statWord } from '../core/character/stats';
import { STAT_IDS } from '../core/character/stat-ids';
import type { ChronicleEntry } from '../core/chronicle/log';
import { conditionsText } from '../core/health/course';
import { findCharacter, getPlayer } from '../core/helpers';
import type { Ctx } from '../core/state';
import { fullName } from '../core/character/character';
import { withNumber } from './access';

/**
 * The outcome of a choice with something at stake (D-440): what was written that day and what changed in the hero.
 * Pure. Today `choose` runs the days on to the next decision, so the before/after difference is trusted only when the
 * date did not move; once `choose` stops moving time (S.5a) the difference is always exact and nothing here changes.
 */
export interface HeroSnapshot {
  id: string;
  day: number;
  money: number;
  traits: string[];
  conditions: string;
  stats: { label: string; word: string; value: number }[];
}

/** The hero as the outcome compares them. Age is left out on purpose: it moves with the date, not with the choice. */
export function heroSnapshot(ctx: Ctx): HeroSnapshot {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  const values = stats(ctx, hero);
  return {
    id: hero.id,
    day: state.day,
    money: hero.money,
    traits: hero.traits.flatMap((id) => findTrait(content, id)?.name ?? []),
    conditions: conditionsText(content, hero),
    stats: STAT_IDS.map((id) => ({ label: id[0]?.toUpperCase() + id.slice(1), word: statWord(content, values[id]), value: values[id] })),
  };
}

/** Taken just before a `choose` command is applied. */
export interface BeforeChoice {
  hero: HeroSnapshot;
  /** Lines of the whole chronicle so far (the archive may move old ones out of the hot part). */
  seen: number;
  /** The option chosen had a check: a stake in itself (D-440). */
  hadCheck: boolean;
  /** The event page shown: a following page of the same event is no outcome yet. */
  page: { eventId: string; seq: number } | null;
}

export interface Change {
  label: string;
  from: string;
  to: string;
}

export interface Outcome {
  lines: ChronicleEntry[];
  /** Empty when the date moved or the hero died: a difference of two moments would carry foreign changes. */
  changes: Change[];
  /** The hero died in the choice; `heir` is the new head, if the house goes on. */
  died: { name: string; heir: string | null } | null;
}

export function beforeChoice(ctx: Ctx, hadCheck: boolean): BeforeChoice {
  const p = ctx.state.pendingEvent;
  return { hero: heroSnapshot(ctx), seen: allChronicle(ctx.state).length, hadCheck, page: p ? { eventId: p.eventId, seq: p.seq } : null };
}

function diff(before: HeroSnapshot, after: HeroSnapshot): Change[] {
  const out: Change[] = [];
  if (before.money !== after.money) out.push({ label: 'Money', from: `${before.money} crowns`, to: `${after.money} crowns` });
  for (const t of after.traits) if (!before.traits.includes(t)) out.push({ label: 'Trait gained', from: '', to: t });
  for (const t of before.traits) if (!after.traits.includes(t)) out.push({ label: 'Trait lost', from: t, to: '' });
  if (before.conditions !== after.conditions) out.push({ label: 'Health', from: before.conditions || 'healthy', to: after.conditions || 'healthy' });
  before.stats.forEach((s, i) => {
    const now = after.stats[i];
    if (now && now.value !== s.value) out.push({ label: s.label, from: withNumber(s.word, s.value), to: withNumber(now.word, now.value) });
  });
  return out;
}

/**
 * The outcome window after a choice, or null when nothing was at stake: no check, nothing written that day, nothing
 * changed in the hero (D-440); or when the choice only led to the next page of the same event.
 */
export function outcomeOf(ctx: Ctx, before: BeforeChoice): Outcome | null {
  const { state } = ctx;
  const p = state.pendingEvent;
  if (p && before.page && p.eventId === before.page.eventId && p.seq === before.page.seq) return null;
  const day = before.hero.day;
  const written = allChronicle(state).slice(before.seen).filter((e) => e.day === day);
  const own = written.filter((e) => e.level === 'chronicle' || e.subject === before.hero.id);
  const chronicleLines = written.filter((e) => e.level === 'chronicle');
  const old = findCharacter(state, before.hero.id);
  const dead = old !== null && old.deathDay !== null;
  if (dead || state.status === 'ended' || state.playerId !== before.hero.id) {
    const heir = state.status === 'ended' || state.playerId === before.hero.id ? null : fullName(getPlayer(state));
    return { lines: own, changes: [], died: { name: old ? fullName(old) : 'The hero', heir } };
  }
  const changes = state.day === day ? diff(before.hero, heroSnapshot(ctx)) : [];
  if (!before.hadCheck && chronicleLines.length === 0 && changes.length === 0) return null;
  return { lines: own, changes, died: null };
}
