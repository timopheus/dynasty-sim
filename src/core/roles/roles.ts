import { conditionReport, conditionRoleRefs, type When } from '../condition-keys';
import { factorParts } from '../content/types';
import { weightedPick } from '../rng';
import { acquaintanceLevel } from '../relations/acquaintance';
import { activeRelationBetween } from '../relations/links';
import { kinOf, type KinKindId } from '../family/kin';
import type { Character, Ctx, Scope } from '../state';
import { characterById, isNear } from '../world/world';
import type { RoleDef, RolesDef } from './content';

/** Weight of a candidate before `prefer`; large and divisible by many small numbers so fractions stay exact. */
const BASE_WEIGHT = 720720;

/**
 * Filling the roles of an event (D-041, D-056, D-190…D-192). Roles are filled in their order from the people of the
 * hero's circle; `where` of a role sees the built-in roles and the roles above it.
 */

/** The scope every event starts from: the hero and the main participant. */
export function baseScope(hero: Character, protagonist: Character): Scope {
  return { hero: hero.id, protagonist: protagonist.id };
}

/**
 * People who could take the role, before `where`: the circle (never the hero), narrowed by `pick`; for `pick: kin`,
 * the living kin of the main participant who are near the hero — the household or the circle (4.5).
 */
function pool(ctx: Ctx, role: RoleDef, scope: Scope): Character[] {
  const { state, content } = ctx;
  const taken = new Set(Object.values(scope));
  if (role.pick === 'kin') {
    const of = scope.protagonist ?? state.playerId;
    return kinOf(state, role.kind as KinKindId, of).filter((c) => c.deathDay === null && !taken.has(c.id) && isNear(state, c.id));
  }
  const out: Character[] = [];
  for (const id of state.circle) {
    if (taken.has(id)) continue;
    const c = characterById(state, id);
    if (!c || c.deathDay !== null) continue;
    if (role.pick === 'known' && acquaintanceLevel(state, content, scope.hero ?? state.playerId, id) === null) continue;
    if (role.pick === 'close' && acquaintanceLevel(state, content, scope.hero ?? state.playerId, id) !== 'close') continue;
    if (role.pick === 'relation' && !activeRelationBetween(state, scope.protagonist ?? state.playerId, id, role.kind)) continue;
    out.push(c);
  }
  return out;
}

function fits(ctx: Ctx, c: Character, when: When | undefined, scope: Scope): boolean {
  return !when || conditionReport(ctx, c, when, scope).met;
}

/**
 * A person handed over as `given` counts if alive, near the hero (the household or the circle) and not already
 * holding another role (D-044). The hero may be handed over too, though the hero holds the built-in roles: only the
 * command `propose` does it (the hero as the suitor, 4.5) — stories never hand the hero over (their validator).
 */
function givenPerson(ctx: Ctx, name: string, scope: Scope): Character | null {
  const { state } = ctx;
  const id = scope[name];
  if (id === undefined || !isNear(state, id)) return null;
  const builtIn = (role: string) => id === scope.hero && (role === 'hero' || role === 'protagonist');
  if (Object.entries(scope).some(([other, otherId]) => other !== name && otherId === id && !builtIn(other))) return null;
  const c = characterById(state, id);
  return c && c.deathDay === null ? c : null;
}

/** People who can take the role now: its pool (or the given person) narrowed by `where`. */
function candidates(ctx: Ctx, name: string, role: RoleDef, scope: Scope): Character[] {
  const list = role.pick === 'given' ? [givenPerson(ctx, name, scope)].filter((c) => c !== null) : pool(ctx, role, scope);
  return list.filter((c) => fits(ctx, c, role.where, scope));
}

/** Weight of a candidate: every `prefer` entry whose condition holds multiplies it by its factor. */
function preferWeight(ctx: Ctx, role: RoleDef, c: Character, scope: Scope): number {
  let weight = BASE_WEIGHT;
  for (const p of role.prefer ?? []) {
    if (!fits(ctx, c, p.when, scope)) continue;
    const { num, den } = factorParts(p.factor);
    weight = Math.max(1, Math.floor((weight * num) / den));
  }
  return weight;
}

/** Without the role: it stays out of the scope. */
function without(scope: Scope, name: string): Scope {
  const { [name]: _gone, ...rest } = scope;
  return rest;
}

/**
 * Quick refusal, a necessary condition only: the later roles that are not optional and whose `where` needs only
 * roles already in the scope must be able to get different people (a matching), even before the roles between are
 * filled — those only take people away. Keeps a hopeless event from searching every combination of the earlier
 * roles. People held by later optional `given` roles are counted as free, since such a role may give its person up.
 */
function laterRolesHaveCandidates(ctx: Ctx, entries: readonly [string, RoleDef][], index: number, scope: Scope): boolean {
  const later = entries.slice(index);
  let open: Scope = scope;
  for (const [name, role] of later) if (role.pick === 'given' && role.optional) open = without(open, name);
  const wanted: string[][] = [];
  for (const [name, role] of later) {
    if (role.optional) continue;
    if (role.where && conditionRoleRefs(role.where).some((ref) => open[ref] === undefined)) continue;
    const ids = candidates(ctx, name, role, open).map((c) => c.id);
    if (ids.length === 0) return false;
    if (role.pick !== 'given') wanted.push(ids);
  }
  return hasMatching(wanted);
}

/** Can every role (a list of fitting people) get a different person? Augmenting paths (Kuhn). */
function hasMatching(wanted: readonly string[][]): boolean {
  const holder = new Map<string, number>();
  const assign = (role: number, seen: Set<string>): boolean => {
    for (const id of wanted[role] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const other = holder.get(id);
      if (other === undefined || assign(other, seen)) {
        holder.set(id, role);
        return true;
      }
    }
    return false;
  };
  return wanted.every((_ids, role) => assign(role, new Set()));
}

/**
 * Can the roles from `index` on be filled given the scope so far? Searches all choices, so an early role never
 * takes the only person a later one needs. Pure.
 */
function feasible(ctx: Ctx, entries: readonly [string, RoleDef][], index: number, scope: Scope): boolean {
  const entry = entries[index];
  if (!entry) return true;
  if (!laterRolesHaveCandidates(ctx, entries, index, scope)) return false;
  const [name, role] = entry;
  if (role.pick === 'given') {
    if (candidates(ctx, name, role, scope).length > 0) return feasible(ctx, entries, index + 1, scope);
    return !!role.optional && feasible(ctx, entries, index + 1, without(scope, name));
  }
  for (const c of candidates(ctx, name, role, scope)) {
    if (feasible(ctx, entries, index + 1, { ...scope, [name]: c.id })) return true;
  }
  return !!role.optional && feasible(ctx, entries, index + 1, scope);
}

/**
 * Fills the roles in their order on top of `base` (built-in and given roles). Returns the scope, or null if a role
 * that is not optional has nobody. A person takes at most one role. Each role is picked at random among the people
 * who leave the rest of the roles fillable, with the weights of `prefer`, from the world stream; nothing is spent
 * when the answer is null. A `given` person who died or left the circle is a refusal (D-044).
 */
export function fillRoles(ctx: Ctx, roles: RolesDef | undefined, base: Scope): Scope | null {
  const entries = Object.entries(roles ?? {});
  if (!feasible(ctx, entries, 0, base)) return null;
  let scope: Scope = { ...base };
  entries.forEach(([name, role], index) => {
    if (role.pick === 'given') {
      if (candidates(ctx, name, role, scope).length === 0) scope = without(scope, name);
      return;
    }
    const viable = candidates(ctx, name, role, scope).filter((c) => feasible(ctx, entries, index + 1, { ...scope, [name]: c.id }));
    if (viable.length === 0) return;
    const chosen = weightedPick(ctx.state.rng, viable, (c) => preferWeight(ctx, role, c, scope));
    scope = { ...scope, [name]: chosen.id };
  });
  return scope;
}

/** True if every role that is not optional can be filled. Pure: never consumes randomness. */
export function canFillRoles(ctx: Ctx, roles: RolesDef | undefined, base: Scope): boolean {
  return feasible(ctx, Object.entries(roles ?? {}), 0, base);
}

/**
 * True if some candidate of the role `name` fits its `where` and also `when`: a weight factor by role (3.2,
 * D-161). For `pick: given` the candidate is the person handed over in the scope. The scope holds what `where`
 * refers to: the built-in roles and, if it uses them, the roles above (a role missing from it is not met). Pure.
 */
export function anyCandidate(ctx: Ctx, name: string, role: RoleDef, when: When, scope: Scope): boolean {
  return candidates(ctx, name, role, scope).some((c) => fits(ctx, c, when, scope));
}
