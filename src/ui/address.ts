/**
 * Addresses of pages (D-311): `#/<word of the kind>/<id>`, e.g. `#/person/c12`, `#/house/h40`. The id alone tells the
 * entity (its prefix is the kind), so any word reads; the word only makes the address readable. The registry of kinds
 * (4.2) gives the word of each prefix.
 */
const ENTITY_HASH = /^#\/([a-z]+)\/([a-z]+\d+)$/;
const PERSON_HASH = /^#\/person\/([a-z]+\d+)$/;

export function personHref(id: string): string {
  return entityHref('person', id);
}

/** Address of the page of an entity of the kind with this word. */
export function entityHref(word: string, id: string): string {
  return `#/${word}/${id}`;
}

/** Id of the person whose page the address asks for, or null for the main screen. */
export function personIdFromHash(hash: string): string | null {
  return PERSON_HASH.exec(hash)?.[1] ?? null;
}

/** Id of the entity whose page the address asks for, whatever the word of the kind; null for the main screen. */
export function entityIdFromHash(hash: string): string | null {
  return ENTITY_HASH.exec(hash)?.[2] ?? null;
}
