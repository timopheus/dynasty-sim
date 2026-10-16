import { log } from '../chronicle/log';
import type { Character, Ctx } from '../state';
import { findTrait, grantTrait, hasTrait } from './holding';

/**
 * Gives a trait (rules in grantTrait). Gaining a character trait writes its
 * `gained` line to the chronicle. Returns whether the character changed.
 */
export function addTrait(ctx: Ctx, c: Character, id: string): boolean {
  const def = grantTrait(ctx.content, c, id);
  if (!def) return false;
  if (def.category === 'character' && def.gained) {
    log(ctx.state, { subject: c, kind: 'trait_change', level: 'chronicle', template: def.gained });
  }
  return true;
}

/** Takes a trait away. An education never goes (D-032) and is left alone. Returns whether the character changed. */
export function removeTrait(ctx: Ctx, c: Character, id: string): boolean {
  const def = findTrait(ctx.content, id);
  if (!def) throw new Error(`Unknown trait "${id}"`);
  if (def.category === 'education' || !hasTrait(c, id)) return false;
  c.traits = c.traits.filter((t) => t !== id);
  return true;
}
