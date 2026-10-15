import { ageYears } from '../time/calendar';
import type { TextPart } from '../text/text';
import { fullName, type CharacterBase } from './character';

/** Placeholders a template may use; each one refers to the character the line is about. */
export const PLACEHOLDERS = ['name', 'age'] as const;

/** Values of the placeholders for a character on a day; names become references (D-020, D-057). */
export function placeholderValues(c: CharacterBase, day: number): Record<string, TextPart> {
  return {
    name: { id: c.id, name: fullName(c) },
    age: String(ageYears(c.birthDay, day)),
  };
}
