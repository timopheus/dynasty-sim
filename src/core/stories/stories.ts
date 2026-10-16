import type { Content } from '../content/schema';
import { findCharacter, isInt } from '../helpers';
import type { Ctx, DeathHook, GameState, Invariant, Scope } from '../state';

/**
 * Follow-ups and stories with a deadline (D-044, D-240…D-243). A follow-up is an event scheduled for a day with the
 * same people; a story is an open line of the main participant that one of its events closes, or the fallback at the
 * deadline. Both live here, not in the queue of `later` (time/): that queue applies effects, these start events.
 */

/** An event scheduled by the effect `schedule` (D-240). */
export interface Followup {
  eventId: string;
  /** Id of the main participant. */
  protagonist: string;
  /** Roles handed over (`pick: given`): role -> character id. */
  given: Scope;
  dueDay: number;
  /** Day the stories phase handed it to the narrator (`dueEvents`); null until then. */
  offered: number | null;
}

/** A story opened by the effect `story` (D-241). */
export interface OpenStory {
  /** Id of the story: events with `story: <id>` belong to it. */
  id: string;
  /** Id of the main participant the story belongs to. */
  owner: string;
  openedDay: number;
  /** Day the fallback ending comes, if no event of the story has. */
  deadline: number;
  /** Fallback endings in order of preference. */
  fallback: string[];
  /** Roles handed over to the events of the story. */
  given: Scope;
}

export interface StoriesState {
  followups: Followup[];
  openStories: OpenStory[];
}

export function initStoriesState(): StoriesState {
  return { followups: [], openStories: [] };
}

/** An event the narrator must start today, before the deck (3.7): a follow-up or a story event. */
export interface DueEvent {
  eventId: string;
  /** Id of the main participant. */
  protagonist: string;
  /** Roles handed over by the follow-up (`pick: given`). */
  given: Scope;
}

/**
 * Follow-ups due today, in order: the ones the stories phase checked and handed over this day (D-242). Never
 * consumes randomness.
 */
export function dueEvents({ state }: Ctx): DueEvent[] {
  return state.followups.filter((f) => f.offered === state.day).map((f) => ({ eventId: f.eventId, protagonist: f.protagonist, given: f.given }));
}

/**
 * An event of the story has fired after it opened (D-241): the narrator records every event it starts in
 * `lastFired`, and starts story events only for the hero, so only the hero's stories close this way.
 */
export function storyResolved(state: GameState, content: Content, story: OpenStory): boolean {
  if (story.owner !== state.playerId) return false;
  return content.events.some((e) => e.story === story.id && (state.lastFired[e.id] ?? -1) > story.openedDay);
}

export function findStory(state: GameState, characterId: string, storyId: string): OpenStory | null {
  return state.openStories.find((s) => s.owner === characterId && s.id === storyId) ?? null;
}

/** True if the character has the story open. */
export function isStoryOpen(state: GameState, characterId: string, storyId: string): boolean {
  return findStory(state, characterId, storyId) !== null;
}

/** Weight of a story event on the day the story opens; it grows by steps to STORY_WEIGHT_MAX at the deadline. */
export const STORY_WEIGHT_MIN = 1;
export const STORY_WEIGHT_MAX = 10;

/**
 * Weight of an event of the story for the character: 0 while the story is not open (D-044), then from
 * STORY_WEIGHT_MIN growing evenly to STORY_WEIGHT_MAX at the deadline (D-243). Pure.
 */
export function storyWeight({ state, content }: Ctx, storyId: string, characterId: string): number {
  const story = findStory(state, characterId, storyId);
  if (!story || storyResolved(state, content, story)) return 0;
  const span = Math.max(1, story.deadline - story.openedDay);
  const passed = Math.min(span, Math.max(0, state.day - story.openedDay));
  return STORY_WEIGHT_MIN + Math.floor(((STORY_WEIGHT_MAX - STORY_WEIGHT_MIN) * passed) / span);
}

/** Death of the main participant cancels their follow-ups and stories (D-044); the hero's stories close with them. */
export const storiesOnDeath: DeathHook = ({ state }, c) => {
  state.followups = state.followups.filter((f) => f.protagonist !== c.id);
  state.openStories = state.openStories.filter((s) => s.owner !== c.id);
};

export const storiesInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const known = (id: string) => content.events.some((e) => e.id === id);
  const people = (at: string, scope: Scope) => {
    for (const [role, id] of Object.entries(scope)) if (!findCharacter(state, id)) problems.push(`${at}: role ${role} is unknown character ${id}`);
  };
  for (const f of state.followups) {
    const at = `follow-up ${f.eventId} of ${f.protagonist}`;
    if (!known(f.eventId)) problems.push(`${at}: unknown event`);
    const p = findCharacter(state, f.protagonist);
    if (!p) problems.push(`${at}: unknown main participant`);
    else if (p.deathDay !== null) problems.push(`${at}: the main participant is dead`);
    if (!isInt(f.dueDay)) problems.push(`${at}: due day ${f.dueDay} is not an integer`);
    if (f.offered !== null && (!isInt(f.offered) || f.offered > state.day || f.offered < f.dueDay)) problems.push(`${at}: offered on day ${f.offered}`);
    people(at, f.given);
  }
  const seen = new Set<string>();
  for (const s of state.openStories) {
    const at = `story ${s.id} of ${s.owner}`;
    const key = `${s.owner}/${s.id}`;
    if (seen.has(key)) problems.push(`${at}: open twice`);
    seen.add(key);
    const owner = findCharacter(state, s.owner);
    if (!owner) problems.push(`${at}: unknown owner`);
    else if (owner.deathDay !== null) problems.push(`${at}: the owner is dead`);
    if (!isInt(s.openedDay) || !isInt(s.deadline) || s.deadline <= s.openedDay) problems.push(`${at}: days ${s.openedDay}..${s.deadline}`);
    for (const id of s.fallback) if (!known(id)) problems.push(`${at}: unknown fallback event ${id}`);
    people(at, s.given);
  }
  return problems;
};
