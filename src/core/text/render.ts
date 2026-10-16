import { placeholderValues } from '../character/text';
import { findCharacter } from '../helpers';
import type { Character, Ctx, Scope } from '../state';
import { fillTemplate, type TextPart } from './text';

/**
 * Text of an event with roles (D-162). `{name}`, `{he}`… are the subject of the line (the main participant,
 * `protagonist` of the scope); `{role}` is the name of a role as a reference, `{role.he}`, `{role.age}`… its
 * pronouns and age. Grammar (`<symbol>`, 3.4) will use `seq` (number of the event) and `slot` (place of the text)
 * for its own random stream; unused in 3.1.
 *
 * Content schemas and checks must not import this one: they get a template check from text/check.ts, which imports
 * no assembly file (D-060).
 */
export function renderTemplate(ctx: Ctx, template: string, scope: Scope, _seq: number, _slot: string): TextPart[] {
  const { state } = ctx;
  const person = (role: string): Character => {
    const id = scope[role];
    const c = id === undefined ? null : findCharacter(state, id);
    if (!c) throw new Error(`Role "${role}" is not filled in "${template}"`);
    return c;
  };
  const values: Record<string, TextPart> = {};
  if (scope.protagonist !== undefined) Object.assign(values, placeholderValues(person('protagonist'), state.day));
  for (const role of Object.keys(scope)) {
    const own = placeholderValues(person(role), state.day);
    values[role] = own.name as TextPart;
    for (const [key, value] of Object.entries(own)) if (key !== 'name') values[`${role}.${key}`] = value;
  }
  return fillTemplate(template, values);
}
