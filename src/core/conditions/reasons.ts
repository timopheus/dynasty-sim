/** Reason texts for unmet conditions come from content (`time.reasons`, D-043); this fills their placeholders. */
export type ReasonVars = Record<string, string>;

const VAR_RE = /\{([^{}]*)\}/g;

/** Error message if the template uses a placeholder outside `allowed` or has stray braces. */
export function checkReason(template: string, allowed: readonly string[]): string | null {
  for (const match of template.matchAll(VAR_RE)) {
    const name = match[1] ?? '';
    if (!allowed.includes(name)) return `unknown placeholder {${name}}; allowed: ${allowed.map((p) => `{${p}}`).join(', ')}`;
  }
  if (/[{}]/.test(template.replace(VAR_RE, ''))) return 'unbalanced { or }';
  return null;
}

export function fillReason(template: string, vars: ReasonVars): string {
  return template.replace(VAR_RE, (_m, name: string) => vars[name] ?? '');
}

/** "a", "a or b", "a, b or c". */
export function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1) ?? ''}`;
}
