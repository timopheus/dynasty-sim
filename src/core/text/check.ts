import { PLACEHOLDERS } from '../character/text';

/** What an event text may refer to: the roles declared by the event (built-in `hero` and `protagonist` always). */
export interface TemplateEnv {
  roles: readonly string[];
}

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;
const BUILT_IN = ['hero', 'protagonist'];

/**
 * Error message if an event text has an unknown placeholder or role, or stray braces; null if fine. Allowed:
 * `{name}`, `{he}`… of the subject, `{role}` and `{role.he}`, `{role.age}`… of a role. Grammar (`<symbol>`) — 3.4.
 * Imports no assembly file, so the check of events may call it.
 */
export function checkEventTemplate(template: string, env: TemplateEnv): string | null {
  const roles = [...BUILT_IN, ...env.roles];
  const own = PLACEHOLDERS as readonly string[];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1] ?? '';
    const [role, field, ...rest] = name.split('.');
    if (field === undefined && own.includes(name)) continue;
    if (role !== undefined && roles.includes(role) && rest.length === 0 && (field === undefined || (field !== 'name' && own.includes(field)))) continue;
    if (role !== undefined && field !== undefined && roles.includes(role)) return `unknown field {${name}}; a role has ${own.filter((p) => p !== 'name').map((p) => `{${role}.${p}}`).join(', ')}`;
    return `unknown placeholder {${name}}; allowed: ${own.map((p) => `{${p}}`).join(', ')} and roles ${roles.map((r) => `{${r}}`).join(', ')}`;
  }
  if (/[{}]/.test(template.replace(PLACEHOLDER_RE, ''))) return 'unbalanced { or }';
  return null;
}
