import { PLACEHOLDERS, placeholderValues } from '../character/text';
import type { CharacterBase } from '../character/character';

/**
 * Text of a chronicle entry is kept in parts (D-057): plain strings and references
 * to entities with the name they had when the line was written.
 */
export type TextPart = string | { id: string; name: string };

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/** Returns an error message if the template has unknown placeholders or stray braces. */
export function checkTemplate(template: string): string | null {
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1] ?? '';
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) {
      return `unknown placeholder {${name}}; allowed: ${PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}`;
    }
  }
  if (/[{}]/.test(template.replace(PLACEHOLDER_RE, ''))) return 'unbalanced { or }';
  return null;
}

/** Splits a template into parts, filling placeholders from `values`. Adjacent strings are merged. */
export function fillTemplate(template: string, values: Record<string, TextPart>): TextPart[] {
  const parts: TextPart[] = [];
  const push = (part: TextPart) => {
    const last = parts.at(-1);
    if (typeof part === 'string' && typeof last === 'string') parts[parts.length - 1] = last + part;
    else if (part !== '') parts.push(part);
  };
  let at = 0;
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    push(template.slice(at, match.index));
    const name = match[1] ?? '';
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`No value for placeholder {${name}} in "${template}"`);
    push(value);
    at = match.index + match[0].length;
  }
  push(template.slice(at));
  return parts;
}

export function partsText(parts: readonly TextPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.name)).join('');
}

/** Template filled for a character on a day, as parts. */
export function characterParts(template: string, c: CharacterBase, day: number): TextPart[] {
  return fillTemplate(template, placeholderValues(c, day));
}

/** Template filled for a character on a day, as plain text (for the screen). */
export function renderText(template: string, c: CharacterBase, day: number): string {
  return partsText(characterParts(template, c, day));
}
