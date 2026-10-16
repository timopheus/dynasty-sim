import type { Invariant } from '../state';

/** Backstory of the first hero (D-038, D-167, task 3.11). Stub of 3.1: no state yet. */
export interface BackstoryState {}

export function initBackstoryState(): BackstoryState {
  return {};
}

export const backstoryInvariants: Invariant = () => [];
