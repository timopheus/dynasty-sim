import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import { conditionRoleRefs, WhenSchema, type When } from '../condition-keys';
import type { ContentSources } from '../content/schema';
import { Factor, Id, type ContentError } from '../content/types';

/** Built-in roles (D-162): the current hero, and the main participant of the event (the hero in hero events). */
export const BUILT_IN_ROLES = ['hero', 'protagonist'] as const;

/** Where a role takes its person from (D-041, D-056): all of them are people of the hero's circle. */
export const PICKS = ['circle', 'known', 'close', 'relation', 'given'] as const;

/** One role of an event (`docs/event-format.md`, D-161). */
export const RoleSchema = z.strictObject({
  pick: z.enum(PICKS),
  /** Kind of relation (`opinions.relations`) for `pick: relation`. */
  kind: Id.optional(),
  /** Conditions on the candidate; may refer to `hero`, `protagonist` and roles declared above. */
  where: WhenSchema.optional(),
  /** Weights of candidates as integer fractions (3.3). */
  prefer: z.array(z.strictObject({ when: WhenSchema, factor: Factor })).min(1).optional(),
  /** If nobody fits, the role stays empty instead of making the event impossible. */
  optional: z.boolean().optional(),
});

/** Roles of an event in the order they are filled; role names are ids. */
export const RolesSchema = z.record(Id, RoleSchema);

export type RoleDef = z.infer<typeof RoleSchema>;
export type RolesDef = z.infer<typeof RolesSchema>;

/** Where the roles are and what they can see, for errors that point at the right place. */
export interface RoleCheckEnv {
  file: string;
  /** Path of the `roles` block, such as `events[3].roles`. */
  path: string;
  sources: ContentSources;
}

/**
 * Cross-check of the roles of one event; the check of events (3.2) calls it. Names of roles are not built-in ones
 * or placeholders; `kind` goes with `pick: relation` and names a kind from `opinions`; `where` and `prefer` refer
 * only to `hero`, `protagonist` and roles declared above; occupations exist in `population` (3.3, D-192).
 */
export function checkRoles(roles: RolesDef, env: RoleCheckEnv): ContentError[] {
  const errors: ContentError[] = [];
  const err = (path: string, message: string) => errors.push({ file: env.file, path: `${env.path}.${path}`, message });
  const relationKinds = new Set(env.sources.opinions?.flatMap((o) => o.item.relations.map((k) => k.id)));
  const occupations = new Set(env.sources.population?.flatMap((p) => p.item.occupations.map((o) => o.id)));
  const above = new Set<string>(BUILT_IN_ROLES);
  for (const [name, role] of Object.entries(roles)) {
    if ((BUILT_IN_ROLES as readonly string[]).includes(name)) err(name, `"${name}" is a built-in role and cannot be declared`);
    if ((PLACEHOLDERS as readonly string[]).includes(name)) err(name, `"${name}" is a placeholder of the subject and cannot name a role`);
    if (role.pick === 'relation') {
      if (role.kind === undefined) err(`${name}.kind`, 'pick "relation" needs a kind of relation');
      else if (!relationKinds.has(role.kind)) err(`${name}.kind`, `unknown kind of relation "${role.kind}"`);
    } else if (role.kind !== undefined) {
      err(`${name}.kind`, 'kind goes only with pick "relation"');
    }
    if (role.pick === 'given' && role.prefer) err(`${name}.prefer`, 'a given role has no choice to weigh');
    const conditions: [string, When][] = [];
    if (role.where) conditions.push([`${name}.where`, role.where]);
    role.prefer?.forEach((p, i) => conditions.push([`${name}.prefer[${i}].when`, p.when]));
    for (const [path, when] of conditions) {
      for (const ref of conditionRoleRefs(when)) {
        if (!above.has(ref)) err(path, `unknown role "${ref}": a role sees only hero, protagonist and the roles declared above it`);
      }
      for (const id of when.occupation ?? []) {
        if (!occupations.has(id)) err(`${path}.occupation`, `unknown occupation "${id}"`);
      }
    }
    above.add(name);
  }
  return errors;
}
