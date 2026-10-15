import { getPlayer } from '../helpers';
import type { Character, CreateHook, DayPhase, DeathHook, GameState, Invariant } from '../state';

/** World part of the game state: people around the hero and far away (2.5, D-056). */
export interface WorldState {}

/** World part of a character (occupation, place); filled by 2.5. */
export interface WorldCharacter {}

export function initWorldState(): WorldState {
  return {};
}

/**
 * Characters simulated day by day: the hero and, from 2.5, the people around the hero.
 * Health, death and relations phases go through this list. Returns a new array.
 */
export function detailedCharacters(state: GameState): Character[] {
  return [getPlayer(state)];
}

export const createWorld: CreateHook = () => {};
export const worldOnDeath: DeathHook = () => {};

/** Daily world changes and the yearly tick of people far away; filled by 2.5. */
export const worldPhase: DayPhase = { id: 'world', run: () => false };

export const worldInvariants: Invariant = () => [];
