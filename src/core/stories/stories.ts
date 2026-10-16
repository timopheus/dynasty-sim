import type { Ctx, DeathHook, GameState, Invariant, Scope } from '../state';

/**
 * Follow-ups and stories with a deadline (D-044, task 3.8). Stub of 3.1: no state yet, nothing is due and
 * no story is open, so an event of a story is impossible.
 */
export interface StoriesState {}

export function initStoriesState(): StoriesState {
  return {};
}

/** An event the narrator must start today, before the deck (3.7): a follow-up or a story event. */
export interface DueEvent {
  eventId: string;
  /** Id of the main participant. */
  protagonist: string;
  /** Roles handed over by the follow-up (`pick: given`). */
  given: Scope;
}

/** Events due today, in order. Never consumes randomness. */
export function dueEvents(_ctx: Ctx): DueEvent[] {
  return [];
}

/** True if the character has the story open. */
export function isStoryOpen(_state: GameState, _characterId: string, _storyId: string): boolean {
  return false;
}

/** Weight of an event of the story for the character: 0 while the story is not open (D-044). */
export function storyWeight(_ctx: Ctx, _storyId: string, _characterId: string): number {
  return 0;
}

/** Death of the main participant cancels their follow-ups and stories (3.8). */
export const storiesOnDeath: DeathHook = () => {};

export const storiesInvariants: Invariant = () => [];
