import { PLACEHOLDERS } from '../character/text';
import { parseTemplate, type TemplateNode } from './template';

/** What an event text may refer to: the roles declared by the event (built-in `hero` and `protagonist` always). */
export interface TemplateEnv {
  roles: readonly string[];
  /** Roles that may stay empty: they can only appear inside `{role?…}`. */
  optional?: readonly string[];
  /** Grammar symbols the text may use; if absent, symbols are not checked (the check of grammar does it, 3.4). */
  symbols?: readonly string[];
}

const BUILT_IN = ['hero', 'protagonist'];

/**
 * Error message if an event text has an unknown placeholder, role or symbol, a role that may be empty used outside
 * `{role?…}`, or stray braces or angle brackets; null if fine. Allowed: `{name}`, `{he}`… of the subject, `{role}`
 * and `{role.he}`, `{role.age}`… of a role, `{role?…}` (text if the role is filled), `<symbol>` and `<Symbol>`.
 * Cycles of the grammar are not seen here (see text/grammar.ts). Imports no assembly file, so the check of events
 * may call it.
 */
export function checkEventTemplate(template: string, env: TemplateEnv): string | null {
  const parsed = parseTemplate(template);
  if (!parsed.ok) return parsed.error;
  const roles = [...BUILT_IN, ...env.roles];
  const own = PLACEHOLDERS as readonly string[];
  let problem: string | null = null;
  const fail = (message: string) => {
    problem ??= message;
  };
  /** `filled`: roles named by the `{role?…}` segments around the nodes. */
  const visit = (nodes: readonly TemplateNode[], filled: readonly string[]) => {
    for (const node of nodes) {
      if (node.t === 'sym') {
        if (env.symbols && !env.symbols.includes(node.name)) fail(`undefined grammar symbol <${node.name}>`);
      } else if (node.t === 'opt') {
        if (!roles.includes(node.role)) fail(`unknown role "${node.role}" in {${node.role}?…}; the roles are ${roles.join(', ')}`);
        visit(node.nodes, [...filled, node.role]);
      } else if (node.t === 'ph') {
        const name = node.name;
        const [role, field, ...rest] = name.split('.');
        const known = role !== undefined && roles.includes(role);
        if (field === undefined && own.includes(name)) continue;
        if (known && rest.length === 0 && (field === undefined || (field !== 'name' && own.includes(field)))) {
          if (env.optional?.includes(role) && !filled.includes(role)) fail(`role "${role}" may be empty: write {${role}?… {${name}} …}`);
        } else if (known && field !== undefined) {
          fail(`unknown field {${name}}; a role has ${own.filter((p) => p !== 'name').map((p) => `{${role}.${p}}`).join(', ')}`);
        } else {
          fail(`unknown placeholder {${name}}; allowed: ${own.map((p) => `{${p}}`).join(', ')} and roles ${roles.map((r) => `{${r}}`).join(', ')}`);
        }
      }
    }
  };
  visit(parsed.nodes, []);
  return problem;
}
