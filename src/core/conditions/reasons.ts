import type { Content } from '../content/schema';
import { localName, phrase } from '../lang/phrases';
import { CASES, resolvePlaceholder, type Case } from '../text/forms';

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

const CASE_RE = /^([a-z][a-z0-9_]*):([a-z]+)$/;

/**
 * Fills a reason. With the content, the names in it speak its language (RU.1): `{name}` is the name as the language
 * writes it, `{name:gen}` in a case, `{~он|она}` by the sex in `vars['~']` (`m` or `f`; the first form without it).
 */
export function fillReason(template: string, vars: ReasonVars, content?: Content): string {
  return template.replace(VAR_RE, (_m, name: string) => {
    const kase = CASE_RE.exec(name);
    if (kase) {
      const value = vars[kase[1] as string] ?? '';
      const c = kase[2] as Case;
      return content && (CASES as readonly string[]).includes(c) ? localName(content, value, c) : value;
    }
    if (name.includes('~')) return String(resolvePlaceholder(name, vars) ?? '');
    const value = vars[name] ?? '';
    return content && name === 'name' ? localName(content, value) : value;
  });
}

/** "a", "a or b", "a, b or c"; "or" in the language of the content (RU.1). */
export function joinOr(items: readonly string[], content: Content): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${phrase(content, 'or')} ${items.at(-1) ?? ''}`;
}
