import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { conditionReport } from '../condition-keys';
import type { EventDef } from '../events/content';
import { fireEvent } from '../events/events';
import { runNpcEvent } from '../events/npc';
import { findCharacter, getPlayer } from '../helpers';
import { baseScope, canFillRoles } from '../roles/roles';
import type { Character, Ctx, DayPhase, Scope, SuccessionHook } from '../state';
import { fillTemplate } from '../text/text';
import { storyResolved, type Followup, type OpenStory } from './stories';

/**
 * 4.8: open stories and follow-ups of the dead head pass to the heir when their roles can be filled (the main
 * participant becomes the new hero); until then they close with the death (storiesOnDeath). Never imports lifecycle.ts.
 */
export const storiesOnSuccession: SuccessionHook = (ctx, deceased, heir) => {
  const { state } = ctx;
  // The heir's own open stories stay; the dead head's of the same id close quietly.
  const heirHas = new Set(state.openStories.filter((s) => s.owner === heir.id).map((s) => s.id));
  state.followups = state.followups.flatMap((f) => {
    if (f.protagonist !== deceased.id) return [f];
    const event = findEvent(ctx, f.eventId);
    if (!event || !handsOver(ctx, f.given, deceased, heir) || !canFillRoles(ctx, event.roles, startScope(ctx, heir, f.given))) return [];
    return [{ ...f, protagonist: heir.id, offered: null }];
  });
  state.openStories = state.openStories.flatMap((s) => {
    if (s.owner !== deceased.id) return [s];
    if (heirHas.has(s.id) || !handsOver(ctx, s.given, deceased, heir)) return [];
    const ending = [...s.fallback, ...ctx.content.events.filter((e) => e.story === s.id).map((e) => e.id)];
    const fits = ending.some((id) => {
      const event = findEvent(ctx, id);
      return event !== null && canFillRoles(ctx, event.roles, startScope(ctx, heir, s.given));
    });
    return fits ? [{ ...s, owner: heir.id }] : [];
  });
};

/** The people handed over still take part with the heir as the main participant: alive, and neither the dead head nor the heir. */
function handsOver(ctx: Ctx, given: Scope, deceased: Character, heir: Character): boolean {
  return Object.values(given).every((id) => id !== deceased.id && id !== heir.id && findCharacter(ctx.state, id)?.deathDay === null);
}

/** Journal lines of a cancelled follow-up (D-242). Kept in code: stories have no content key of their own. */
export const CANCELLED_WITH = "{name}'s business with {other} came to nothing.";
export const CANCELLED = "{name}'s plans came to nothing.";

const findEvent = (ctx: Ctx, id: string): EventDef | null => ctx.content.events.find((e) => e.id === id) ?? null;

/** The scope an event of the follow-up or story starts from: the people handed over, the hero and the main participant. */
function startScope(ctx: Ctx, protagonist: Character, given: Scope): Scope {
  return { ...given, ...baseScope(getPlayer(ctx.state), protagonist) };
}

/** A person handed over who can no longer take part: dead or gone from the circle. */
function missing(ctx: Ctx, given: Scope): Character | null {
  for (const id of Object.values(given)) {
    const c = findCharacter(ctx.state, id);
    if (c && (c.deathDay !== null || !ctx.state.circle.includes(id))) return c;
  }
  return null;
}

/** The follow-up was cancelled: a role it needs cannot be filled any more (D-044). */
function cancel(ctx: Ctx, f: Followup, protagonist: Character): void {
  const other = missing(ctx, f.given);
  const values = placeholderValues(protagonist, ctx.state.day);
  const parts = other ? fillTemplate(CANCELLED_WITH, { ...values, other: { id: other.id, name: fullName(other) } }) : fillTemplate(CANCELLED, values);
  log(ctx, { subject: protagonist, kind: 'followup_cancelled', level: 'journal', parts });
}

/** `once` of an event the stories start themselves, outside the narrator (D-230): the narrator's memory gets it. */
function remember(ctx: Ctx, event: EventDef): void {
  const { state } = ctx;
  state.lastFired[event.id] = state.day;
  if (event.once !== 'life') return;
  if (state.lifeHero !== state.playerId) {
    state.lifeHero = state.playerId;
    state.lifeFired = [];
  }
  if (!state.lifeFired.includes(event.id)) state.lifeFired.push(event.id);
}

/** What the narrator remembers of an event of a person of the world (3.9): only what `once: game` and `cooldown_days` need. */
function rememberNpc(ctx: Ctx, event: EventDef): void {
  if (event.once === 'game' || event.cooldown_days !== undefined) ctx.state.lastFired[event.id] = ctx.state.day;
}

/** A fallback ending fits now: bound action, `when`, `once` and the roles with the people of the story (D-044). */
function fits(ctx: Ctx, event: EventDef, owner: Character, given: Scope): boolean {
  const { state } = ctx;
  if (event.actions && (!state.activeAction || !event.actions.includes(state.activeAction.actionId))) return false;
  if (event.once === 'game' && Object.hasOwn(state.lastFired, event.id)) return false;
  if (event.once === 'life' && state.lifeHero === state.playerId && state.lifeFired.includes(event.id)) return false;
  const scope = startScope(ctx, owner, given);
  if (event.when && !conditionReport(ctx, owner, event.when, baseScope(getPlayer(state), owner)).met) return false;
  return canFillRoles(ctx, event.roles, scope);
}

/**
 * Follow-ups (D-242, D-245): the ones the narrator started yesterday or earlier leave the queue; the due ones whose roles
 * can still be filled are handed to the narrator for today, the others are cancelled with a journal line. One follow-up
 * of an event a day: whether it was started is told by `lastFired` of the event. A follow-up of a person of the world
 * is carried out here at once, by their own choice (3.9): the narrator starts only the hero's.
 */
function handOverFollowups(ctx: Ctx): void {
  const { state } = ctx;
  const kept: Followup[] = [];
  for (const f of state.followups) {
    if (f.offered !== null) {
      if ((state.lastFired[f.eventId] ?? -1) >= f.offered) continue;
      f.offered = null;
    }
    kept.push(f);
  }
  const offered = new Set<string>();
  const npc: { f: Followup; event: EventDef; protagonist: Character }[] = [];
  state.followups = kept.filter((f) => {
    if (f.dueDay > state.day || offered.has(f.eventId)) return true;
    const protagonist = findCharacter(state, f.protagonist);
    const event = findEvent(ctx, f.eventId);
    if (!protagonist || protagonist.deathDay !== null || !event) return false;
    if (!canFillRoles(ctx, event.roles, startScope(ctx, protagonist, f.given))) {
      cancel(ctx, f, protagonist);
      return false;
    }
    if (protagonist.id !== state.playerId) {
      npc.push({ f, event, protagonist });
      return false;
    }
    f.offered = state.day;
    offered.add(f.eventId);
    return true;
  });
  // Run after the queue is cut: these events may schedule follow-ups of their own.
  for (const { f, event, protagonist } of npc) {
    if (protagonist.deathDay === null && runNpcEvent(ctx, event, protagonist, f.given)) rememberNpc(ctx, event);
  }
}

/** Ends a story at its deadline: the first fallback that fits fires, or the story closes quietly (D-044). */
function endStory(ctx: Ctx, story: OpenStory): boolean {
  const owner = findCharacter(ctx.state, story.owner);
  if (!owner || owner.deathDay !== null) return false;
  for (const id of story.fallback) {
    const event = findEvent(ctx, id);
    if (!event || !fits(ctx, event, owner, story.given)) continue;
    if (owner.id !== ctx.state.playerId) {
      if (!runNpcEvent(ctx, event, owner, story.given)) continue;
      rememberNpc(ctx, event);
      return false;
    }
    const result = fireEvent(ctx, event, owner, story.given);
    if (result === 'failed') continue;
    remember(ctx, event);
    return result === 'waiting';
  }
  return false;
}

/**
 * Stories phase (D-242, D-243), before the narrator: hands over today's follow-ups, closes the stories an event of
 * theirs has ended, and ends the stories whose time is up with a fallback. A fallback waiting for the player ends the
 * day; the other stories past their deadline wait for the next one.
 */
export const storiesPhase: DayPhase = {
  id: 'stories',
  run(ctx) {
    const { state, content } = ctx;
    handOverFollowups(ctx);
    state.openStories = state.openStories.filter((s) => !storyResolved(state, content, s));
    for (const story of [...state.openStories]) {
      if (story.deadline > state.day) continue;
      state.openStories = state.openStories.filter((s) => s !== story);
      if (endStory(ctx, story)) return true;
    }
    return false;
  },
};
