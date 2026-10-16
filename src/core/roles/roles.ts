import { conditionReport, type When } from '../condition-keys';
import { acquaintanceLevel } from '../relations/acquaintance';
import { activeRelationBetween } from '../relations/links';
import type { Character, Ctx, Scope } from '../state';
import { characterById } from '../world/world';
import type { RoleDef, RolesDef } from './content';

/**
 * Filling the roles of an event (D-041, D-056). Simplest form of 3.1, the contract for 3.2: the first fitting person
 * of the circle, in circle order, without `prefer` and without randomness. 3.3 makes the pick weighted.
 */

/** The scope every event starts from: the hero and the main participant. */
export function baseScope(hero: Character, protagonist: Character): Scope {
  return { hero: hero.id, protagonist: protagonist.id };
}

/** People who could take the role, before `where`: the circle (never the hero), narrowed by `pick`. */
function pool(ctx: Ctx, role: RoleDef, scope: Scope): Character[] {
  const { state, content } = ctx;
  const taken = new Set(Object.values(scope));
  const out: Character[] = [];
  for (const id of state.circle) {
    if (taken.has(id)) continue;
    const c = characterById(state, id);
    if (!c || c.deathDay !== null) continue;
    if (role.pick === 'known' && acquaintanceLevel(state, content, state.playerId, id) === null) continue;
    if (role.pick === 'close' && acquaintanceLevel(state, content, state.playerId, id) !== 'close') continue;
    if (role.pick === 'relation' && !activeRelationBetween(state, scope.protagonist ?? state.playerId, id, role.kind)) continue;
    out.push(c);
  }
  return out;
}

function fits(ctx: Ctx, c: Character, when: When | undefined, scope: Scope): boolean {
  return !when || conditionReport(ctx, c, when, scope).met;
}

/** A person handed over as `given` still counts if alive and in the circle (D-044). */
function givenPerson(ctx: Ctx, name: string, scope: Scope): Character | null {
  const id = scope[name];
  if (id === undefined || !ctx.state.circle.includes(id)) return null;
  const c = characterById(ctx.state, id);
  return c && c.deathDay === null ? c : null;
}

/**
 * Fills the roles in their order on top of `base` (built-in and given roles). Returns the scope, or null if a role
 * that is not optional has nobody. A person takes at most one role. Never consumes randomness in 3.1.
 */
export function fillRoles(ctx: Ctx, roles: RolesDef | undefined, base: Scope): Scope | null {
  const scope: Record<string, string> = { ...base };
  for (const [name, role] of Object.entries(roles ?? {})) {
    if (role.pick === 'given') {
      const c = givenPerson(ctx, name, scope);
      if (c && fits(ctx, c, role.where, scope)) continue;
      if (!role.optional) return null;
      delete scope[name];
      continue;
    }
    const c = pool(ctx, role, scope).find((x) => fits(ctx, x, role.where, scope));
    if (c) scope[name] = c.id;
    else if (!role.optional) return null;
  }
  return scope;
}

/** True if every role that is not optional can be filled. Pure: never consumes randomness. */
export function canFillRoles(ctx: Ctx, roles: RolesDef | undefined, base: Scope): boolean {
  return fillRoles(ctx, roles, base) !== null;
}

/**
 * True if some candidate of the role `name` fits its `where` and also `when`: a weight factor by role (3.2,
 * D-161). For `pick: given` the candidate is the person handed over in the scope. Pure.
 */
export function anyCandidate(ctx: Ctx, name: string, role: RoleDef, when: When, scope: Scope): boolean {
  const candidates = role.pick === 'given' ? [givenPerson(ctx, name, scope)].filter((c) => c !== null) : pool(ctx, role, scope);
  return candidates.some((c) => fits(ctx, c, role.where, scope) && fits(ctx, c, when, scope));
}
