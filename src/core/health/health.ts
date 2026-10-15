import { z } from 'zod';
import { int } from '../rng';
import { isInt } from '../helpers';
import type { Character, CreateHook, Ctx, DeathHook, Invariant } from '../state';

/** Health part of a character. A 0..100 scale until 2.9 replaces it with conditions (D-033). */
export interface HealthPart {
  /** 0..100. At 0 the character dies on the next day. */
  health: number;
}

export const createHealth: CreateHook = ({ state, content }, c) => {
  const { min, max } = content.health.startHealth;
  c.health = int(state.rng, min, max);
};

export const healthOnDeath: DeathHook = () => {};

export const healthEffectShape = {
  health: z.int().optional(),
};

export function applyHealthEffects(_ctx: Ctx, c: Character, effects: { health?: number | undefined }): void {
  if (effects.health !== undefined) c.health = Math.min(100, Math.max(0, c.health + effects.health));
}

/** Condition keys of this module (D-054); filled by 2.9. */
export const healthConditionShape = {};

/** Stat modifiers from health (2.9 registers stage penalties); stats arrive with 2.3. */
export function healthStatModifiers(_ctx: Ctx, _c: Character): Record<string, number> {
  return {};
}

export const healthInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  for (const c of state.characters) {
    if (!isInt(c.health) || c.health < 0 || c.health > 100) problems.push(`${c.id} health out of range: ${c.health}`);
  }
  return problems;
};

export function checkHealthConditions(_ctx: Ctx, _c: Character, _when: object): string[] {
  return [];
}
