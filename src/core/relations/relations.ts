import type { CreateHook, DayPhase, DeathHook, Invariant } from '../state';

/** Opinions, relations and acquaintance (2.4, D-035…D-037). */
export interface RelationsState {}

export interface RelationsCharacter {}

export function initRelationsState(): RelationsState {
  return {};
}

export const createRelations: CreateHook = () => {};
export const relationsOnDeath: DeathHook = () => {};

/** Daily acquaintance and opinion changes; filled by 2.4. */
export const relationsPhase: DayPhase = { id: 'relations', run: () => false };

export const relationsInvariants: Invariant = () => [];
