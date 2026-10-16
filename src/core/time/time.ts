import { applyEffects, type Effects } from '../effects';
import { findCharacter, isInt } from '../helpers';
import type { DayPhase, DeathHook, Invariant, RefsFn, Scope } from '../state';
import { toYmd } from './calendar';

export { checkTimeConditions, timeConditionShape } from './conditions';

/** Effects waiting for their day (D-053): `later` entries, and from stage 3 scheduled events. */
export interface ScheduledEffect {
  /** The day the effects are applied, in the scheduled phase of that day. */
  dueDay: number;
  /** The character they apply to; death of that character cancels them. */
  characterId: string;
  effects: Effects;
  /** Scope of roles of the block that queued them (D-162): they apply with the same participants. Null means none. */
  scope: Scope | null;
}

export interface TimeState {
  /** In the order they were queued; ties on a day are applied in that order. */
  scheduled: ScheduledEffect[];
}

export function initTimeState(): TimeState {
  return { scheduled: [] };
}

export function isNewYear(day: number): boolean {
  const { month, day: d } = toYmd(day);
  return month === 1 && d === 1;
}

export const newDayPhase: DayPhase = {
  id: 'new_day',
  run({ state }) {
    state.day += 1;
    return false;
  },
};

/**
 * Applies what is due today (D-053). The queue is cut before applying, so entries
 * queued by these effects wait for their own day. If the hero's action ended (the
 * hero died, say), the player has a decision to make and the day stops.
 */
export const scheduledPhase: DayPhase = {
  id: 'scheduled',
  run(ctx) {
    const { state } = ctx;
    const due = state.scheduled.filter((s) => s.dueDay <= state.day);
    if (due.length === 0) return false;
    state.scheduled = state.scheduled.filter((s) => s.dueDay > state.day);
    // Array.prototype.sort is stable, so ties keep the order of queueing.
    due.sort((a, b) => a.dueDay - b.dueDay);
    for (const item of due) {
      const target = findCharacter(state, item.characterId);
      if (target && target.deathDay === null) applyEffects(ctx, target, item.effects, item.scope ?? {});
    }
    return state.activeAction === null;
  },
};

export const timeInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  for (const item of state.scheduled) {
    if (!isInt(item.dueDay) || item.dueDay <= state.day) problems.push(`scheduled effects for ${item.characterId} are due on day ${item.dueDay}, not after ${state.day}`);
    const target = findCharacter(state, item.characterId);
    if (!target) problems.push(`scheduled effects refer to unknown character ${item.characterId}`);
    else if (target.deathDay !== null) problems.push(`scheduled effects remain for dead character ${item.characterId}`);
    for (const [role, id] of Object.entries(item.scope ?? {})) {
      if (!findCharacter(state, id)) problems.push(`scheduled effects for ${item.characterId} give role ${role} to unknown character ${id}`);
    }
  }
  return problems;
};

/** People the scheduled effects refer to (D-312): whom they apply to and the scope they keep (D-162). */
export const timeRefs: RefsFn = ({ state }) => state.scheduled.flatMap((s) => [s.characterId, ...Object.values(s.scope ?? {})]);

/** Death cancels what is scheduled for the character (D-053). */
export const timeOnDeath: DeathHook = ({ state }, c) => {
  state.scheduled = state.scheduled.filter((s) => s.characterId !== c.id);
};
