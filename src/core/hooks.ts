/**
 * Assembly file (D-052, D-320): hook lists that module code calls itself, not only game.ts and lifecycle.ts —
 * the birth of a character (`createCharacter`, CREATE_HOOKS) and a marriage (MARRIAGE_HOOKS, called by the marriage
 * of family/). It imports only module files that import neither lifecycle.ts nor events/ nor effects.ts, so phases,
 * effects and succession hooks may call it without an import cycle. lifecycle.ts re-exports `createCharacter`.
 *
 * The order of the hooks is part of the random sequence: a new hook goes at the end unless a decision says otherwise.
 */
import { createCharacterBase } from './character/character';
import { createFamily, type Marriage } from './family/family';
import { createHealth } from './health/health';
import { newId } from './helpers';
import { createHouse, houseOnMarriage } from './house/house';
import { createRelations } from './relations/relations';
import type { Character, CreateHook, Ctx, MarriageHook, NewCharacter } from './state';
import { createWorld } from './world/world';

const CREATE_HOOKS: readonly CreateHook[] = [createCharacterBase, createHealth, createWorld, createRelations, createFamily, createHouse];

/** After a marriage is recorded (4.5): the house of the spouse (4.7). */
const MARRIAGE_HOOKS: readonly MarriageHook[] = [houseOnMarriage];

/** Creates a living character; every module fills its part through its hook. */
export function createCharacter(ctx: Ctx, spec: NewCharacter): Character {
  const c = { id: newId(ctx.state, 'c'), deathDay: null, deathCause: null } as Character;
  for (const hook of CREATE_HOOKS) hook(ctx, c, spec);
  ctx.state.characters.push(c);
  return c;
}

/** Runs the marriage hooks; the marriage of family/ (4.5) calls it after recording `marriage`. */
export function afterMarriage(ctx: Ctx, marriage: Marriage): void {
  for (const hook of MARRIAGE_HOOKS) hook(ctx, marriage);
}
