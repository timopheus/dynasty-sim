const PERSON_HASH = /^#\/person\/([a-z]+\d+)$/;

export function personHref(id: string): string {
  return `#/person/${id}`;
}

/** Id of the person whose page the address asks for, or null for the main screen. */
export function personIdFromHash(hash: string): string | null {
  return PERSON_HASH.exec(hash)?.[1] ?? null;
}
