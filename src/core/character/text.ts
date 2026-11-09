import { ageYears } from '../time/calendar';
import { SEX_MARK } from '../text/forms';
import type { TextPart } from '../text/text';
import type { Sex } from './content';
import { fullName, type CharacterBase } from './character';

/** Placeholders a template may use; each one refers to the character the line is about. */
export const PLACEHOLDERS = ['name', 'age', 'he', 'him', 'his', 'He', 'His'] as const;

function pronouns(sex: Sex): Record<string, string> {
  const male = sex === 'male';
  return { he: male ? 'he' : 'she', him: male ? 'him' : 'her', his: male ? 'his' : 'her', He: male ? 'He' : 'She', His: male ? 'His' : 'Her' };
}

/**
 * Values of the placeholders for a character on a day; names become references (D-020, D-057). `~` is the sex of the
 * character for the forms of a language (`{~он|она}`, RU.1): `m` or `f`.
 */
export function placeholderValues(c: CharacterBase, day: number): Record<string, TextPart> {
  return {
    name: { id: c.id, name: fullName(c) },
    age: String(ageYears(c.birthDay, day)),
    ...pronouns(c.sex),
    [SEX_MARK]: c.sex === 'male' ? 'm' : 'f',
  };
}
