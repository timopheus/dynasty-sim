import { allChronicle } from '../core/archive/archive';
import { findTrait } from '../core/character/holding';
import { stats, statWord } from '../core/character/stats';
import { STAT_IDS } from '../core/character/stat-ids';
import type { ChronicleEntry } from '../core/chronicle/log';
import { conditionsText } from '../core/health/course';
import { findCharacter, getPlayer } from '../core/helpers';
import type { Ctx } from '../core/state';
import type { Content } from '../core/content/schema';
import { happinessWord } from '../core/mind/mind';
import { fullName } from '../core/character/character';
import { eventView } from '../core/events/view';
import { currentScene, pendingEventDef } from '../core/events/events';
import { ownOutcome } from '../core/events/content';
import { partsText, type TextPart } from '../core/text/text';
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
  happiness: number | null;
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
    happiness: state.mind.happiness,
    stats: STAT_IDS.map((id) => ({ label: id[0]?.toUpperCase() + id.slice(1), word: statWord(content, values[id]), value: values[id] })),
  };
}

/** Taken just before a `choose` command is applied. */
export interface BeforeChoice {
  hero: HeroSnapshot;
  /** Lines of the whole chronicle so far (the archive may move old ones out of the hot part). */
  seen: number;
  /**
   * The choice is weighty (D-464, as in CK3): an event of medium or heavy severity, a step of an event of several
   * steps, or an option one of whose outcomes the author wants in the chronicle. Only a weighty choice, a death or a
   * wound earns the window of the outcome; any other choice leaves a word in the news.
   */
  weighty: boolean;
  /** The words of the option chosen, plain: the news says what you did when the author wrote no `aftermath`. */
  choice: string;
  /** A scene of the backstory: the hero's growing up has no clock and no news. */
  backstory: boolean;
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
  /** What came of it in the second person, as the author wrote it (`aftermath`); null when none. */
  aftermath: TextPart[] | null;
  /** The hero died in the choice; `heir` is the new head, if the house goes on. */
  died: { name: string; heir: string | null } | null;
}

/** Whether option `option` of the scene on screen is a weighty choice (D-464). */
function isWeighty(ctx: Ctx, option: number): boolean {
  const { state, content } = ctx;
  const event = pendingEventDef(state, content);
  const scene = currentScene(state, content);
  if (!event || !scene) return false;
  if (event.severity === 'medium' || event.severity === 'heavy' || event.pages !== undefined) return true;
  const chosen = scene.options?.[option];
  const outcomes = chosen ? [chosen, chosen.success, chosen.failure] : [ownOutcome(scene)];
  return outcomes.some((o) => o?.chronicle === true);
}

/** The label of the option, without links; empty for a notice. */
function chosenLabel(ctx: Ctx, option: number): string {
  const text = eventView(ctx)?.options.find((o) => o.index === option)?.text;
  return text ? partsText(text) : '';
}

/** Taken just before the `choose` command for option `option` is applied. */
export function beforeChoice(ctx: Ctx, option: number): BeforeChoice {
  const p = ctx.state.pendingEvent;
  return {
    hero: heroSnapshot(ctx),
    seen: allChronicle(ctx.state).length,
    weighty: isWeighty(ctx, option),
    choice: chosenLabel(ctx, option),
    backstory: ctx.state.backstory.running,
    page: p ? { eventId: p.eventId, seq: p.seq } : null,
  };
}

function diff(content: Content, before: HeroSnapshot, after: HeroSnapshot): Change[] {
  const out: Change[] = [];
  if (before.money !== after.money) out.push({ label: 'Money', from: `${before.money} crowns`, to: `${after.money} crowns` });
  for (const t of after.traits) if (!before.traits.includes(t)) out.push({ label: 'Trait gained', from: '', to: t });
  for (const t of before.traits) if (!after.traits.includes(t)) out.push({ label: 'Trait lost', from: t, to: '' });
  if (before.conditions !== after.conditions) out.push({ label: 'Health', from: before.conditions || 'healthy', to: after.conditions || 'healthy' });
  if (before.happiness !== null && after.happiness !== null && before.happiness !== after.happiness) {
    out.push({ label: 'Happiness', from: withNumber(happinessWord(content, before.happiness), before.happiness), to: withNumber(happinessWord(content, after.happiness), after.happiness) });
  }
  before.stats.forEach((s, i) => {
    const now = after.stats[i];
    if (now && now.value !== s.value) out.push({ label: s.label, from: withNumber(s.word, s.value), to: withNumber(now.word, now.value) });
  });
  return out;
}

/** Whether the choice carries on into the next page of the same event: no outcome yet (D-440). */
function onSamePage(ctx: Ctx, before: BeforeChoice): boolean {
  const p = ctx.state.pendingEvent;
  return p !== null && before.page !== null && p.eventId === before.page.eventId && p.seq === before.page.seq;
}

function aftermathOf(ctx: Ctx): TextPart[] | null {
  return ctx.state.aftermath?.parts ?? null;
}

/**
 * The outcome window after a choice, or null (D-440, D-464): only after a weighty choice, a death or a change in
 * health; or when the choice only led to the next page of the same event. Everything else is `newsOf`.
 */
export function outcomeOf(ctx: Ctx, before: BeforeChoice): Outcome | null {
  const { state } = ctx;
  if (before.backstory || onSamePage(ctx, before)) return null;
  const day = before.hero.day;
  const written = allChronicle(state).slice(before.seen).filter((e) => e.day === day);
  const own = written.filter((e) => e.level === 'chronicle' || e.subject === before.hero.id);
  const old = findCharacter(state, before.hero.id);
  // a death is the outcome of the choice only on the day of the choice: later it belongs to the days that ran on
  const dead = old !== null && old.deathDay === day;
  if (dead) {
    const heir = state.status === 'ended' || state.playerId === before.hero.id ? null : fullName(getPlayer(state));
    return { lines: own, changes: [], aftermath: aftermathOf(ctx), died: { name: old ? fullName(old) : 'The hero', heir } };
  }
  const changes = state.day === day && state.playerId === before.hero.id ? diff(ctx.content, before.hero, heroSnapshot(ctx)) : [];
  const hurt = changes.some((c) => c.label === 'Health');
  if (!before.weighty && !hurt) return null;
  return { lines: own, changes, aftermath: aftermathOf(ctx), died: null };
}

/** A change as a few words for the news: "+12 crowns", "Trait gained: Brave". */
function changeWords(c: Change, before: HeroSnapshot, after: HeroSnapshot): string {
  if (c.label === 'Happiness') return `Happiness ${(after.happiness ?? 0) - (before.happiness ?? 0) > 0 ? '+' : '−'}${Math.abs((after.happiness ?? 0) - (before.happiness ?? 0))}`;
  if (c.label === 'Money') return `${after.money - before.money > 0 ? '+' : '−'}${Math.abs(after.money - before.money)} crowns`;
  return c.to ? `${c.label}: ${c.to}` : `${c.label}: ${c.from} gone`;
}

/**
 * The word in the news after a choice that earns no window (D-464): the author's `aftermath`, else the line the choice
 * wrote, then what changed ("+12 crowns"). Null when nothing at all came of it, or the choice is a step of a longer event.
 */
export function newsOf(ctx: Ctx, before: BeforeChoice): string | null {
  const { state } = ctx;
  if (before.backstory || onSamePage(ctx, before)) return null;
  const day = before.hero.day;
  const after = heroSnapshot(ctx);
  const changes = state.day === day && state.playerId === before.hero.id ? diff(ctx.content, before.hero, after) : [];
  const aftermath = aftermathOf(ctx);
  const story = aftermath ? partsText(aftermath) : before.choice;
  const words = [story, ...changes.map((c) => changeWords(c, before.hero, after))].filter(Boolean);
  return words.length ? words.join(' · ') : null;
}
