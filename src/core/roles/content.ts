import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import { WhenSchema } from '../condition-keys';
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
 * Cross-check of the roles of one event; the check of events (3.2) calls it. Stub of 3.1: names of built-in roles
 * and of placeholders are refused; 3.3 adds known picks, references to roles declared above and kinds of relations.
 */
export function checkRoles(roles: RolesDef, env: RoleCheckEnv): ContentError[] {
  const errors: ContentError[] = [];
  for (const name of Object.keys(roles)) {
    if ((BUILT_IN_ROLES as readonly string[]).includes(name)) {
      errors.push({ file: env.file, path: `${env.path}.${name}`, message: `"${name}" is a built-in role and cannot be declared` });
    }
    if ((PLACEHOLDERS as readonly string[]).includes(name)) {
      errors.push({ file: env.file, path: `${env.path}.${name}`, message: `"${name}" is a placeholder of the subject and cannot name a role` });
    }
  }
  return errors;
}
