import { z } from 'zod';
import { DayRange, Id, Int } from '../content/types';
import { findCharacter } from '../helpers';
import { int } from '../rng';
import type { Character, Ctx, Scope } from '../state';
import type { Followup } from './stories';

/**
 * Effect keys of this module (D-240, D-241), applied to the character of the block:
 * - `schedule: [{event, after_days: {min, max}, roles?: {new_role: role}, protagonist?: role}]` — the event fires in
 *   that many days for the character (or the role `protagonist`), with the people of the roles handed over as
 *   `pick: given` roles under new names;
 * - `story: {open, days, fallback?: [event ids], roles?: {new_role: role}}` — the character opens the story: its events
 *   become possible, and at the deadline the first fitting fallback ends it.
 * A role that is empty is not handed over; an empty `protagonist` role skips the follow-up (D-221). Like every file
 * that feeds effects.ts, it must not import effects.ts or events/ (import cycle).
 */
const HandedRoles = z.record(Id, Id);

export const storiesEffectShape = {
  schedule: z
    .array(z.strictObject({ event: Id, after_days: DayRange, roles: HandedRoles.optional(), protagonist: Id.optional() }))
    .min(1)
    .optional(),
  story: z.strictObject({ open: Id, days: Int.min(1), fallback: z.array(Id).optional(), roles: HandedRoles.optional() }).optional(),
};

interface StoriesEffects {
  schedule?: { event: string; after_days: { min: number; max: number }; roles?: Record<string, string> | undefined; protagonist?: string | undefined }[] | undefined;
  story?: { open: string; days: number; fallback?: string[] | undefined; roles?: Record<string, string> | undefined } | undefined;
}

/** The people of the scope under their new names; empty roles are left out. */
function handOver(roles: Record<string, string> | undefined, scope: Scope): Record<string, string> {
  const given: Record<string, string> = {};
  for (const [name, role] of Object.entries(roles ?? {})) {
    const id = scope[role];
    if (id !== undefined) given[name] = id;
  }
  return given;
}

/** Puts the follow-up after the ones due the same day or earlier: the queue stays in order of days, ties in order of scheduling. */
function enqueue(followups: Followup[], f: Followup): void {
  const at = followups.findIndex((other) => other.dueDay > f.dueDay);
  if (at === -1) followups.push(f);
  else followups.splice(at, 0, f);
}

export function applyStoriesEffects(ctx: Ctx, c: Character, effects: StoriesEffects, scope: Scope): void {
  const { state } = ctx;
  for (const entry of effects.schedule ?? []) {
    const id = entry.protagonist === undefined ? c.id : scope[entry.protagonist];
    const protagonist = id === undefined ? null : findCharacter(state, id);
    if (!protagonist || protagonist.deathDay !== null) continue;
    const { min, max } = entry.after_days;
    const days = min === max ? min : int(state.rng, min, max);
    enqueue(state.followups, { eventId: entry.event, protagonist: protagonist.id, given: handOver(entry.roles, scope), dueDay: state.day + days, offered: null });
  }
  const story = effects.story;
  if (story && c.deathDay === null) {
    // Opening a story that is already open starts it again: the new deadline and people replace the old ones.
    state.openStories = state.openStories.filter((s) => !(s.owner === c.id && s.id === story.open));
    state.openStories.push({
      id: story.open,
      owner: c.id,
      openedDay: state.day,
      deadline: state.day + story.days,
      fallback: [...(story.fallback ?? [])],
      given: handOver(story.roles, scope),
    });
  }
}

/** Roles the effects refer to: the roles handed over and the `protagonist` of a follow-up, for the cross-check of events. */
export function storiesEffectRoleRefs(effects: StoriesEffects): string[] {
  const refs: string[] = [];
  for (const entry of effects.schedule ?? []) {
    refs.push(...Object.values(entry.roles ?? {}));
    if (entry.protagonist !== undefined) refs.push(entry.protagonist);
  }
  refs.push(...Object.values(effects.story?.roles ?? {}));
  return refs;
}
