import type { Ctx, GameState } from '../state';

/**
 * A kind of entity (D-311): the prefix of its ids, the word of its address and how to tell that one exists. The page of
 * a kind lives in `pages/entity.ts` (`ENTITY_PAGES`): this file is imported by the chronicle invariant, so it must not
 * reach the pages, the archive or the modules that write to the chronicle.
 */
export interface EntityKind {
  /** One letter every id of the kind starts with, followed by digits. */
  prefix: string;
  /** Word in the address `#/<word>/<id>`. */
  word: string;
  /** Whether the entity exists, by the hot state only (D-312): what the player has seen does not matter here. */
  exists: (state: GameState, id: string) => boolean;
}

/**
 * Prefixes taken by other things (D-311): `r` relation and `s` secret are records without pages; `n` realm, `d` debt,
 * `o` organization are reserved for stages 5-6. `p` place is a kind since the slice (D-439, S.9a).
 */
export const RESERVED_PREFIXES: readonly string[] = ['r', 's', 'n', 'd', 'o'];

export type EntityRegistry = readonly EntityKind[];

/** Registry from kinds; a repeated prefix or word, a prefix of a reserved letter or not one letter is an error. */
export function makeEntityRegistry(kinds: readonly EntityKind[]): EntityRegistry {
  const prefixes = new Set<string>();
  const words = new Set<string>();
  for (const k of kinds) {
    if (!/^[a-z]$/.test(k.prefix)) throw new Error(`entity prefix "${k.prefix}" is not one lowercase letter`);
    if (RESERVED_PREFIXES.includes(k.prefix)) throw new Error(`entity prefix "${k.prefix}" is reserved (D-311)`);
    if (prefixes.has(k.prefix)) throw new Error(`entity prefix "${k.prefix}" is used twice`);
    if (words.has(k.word)) throw new Error(`entity word "${k.word}" is used twice`);
    prefixes.add(k.prefix);
    words.add(k.word);
  }
  return kinds;
}

/** Kinds of stage 4 and the slice: a person, a house (4.7), an heirloom (4.9), a place (S.9a). Later stages add theirs here. */
export const ENTITY_KINDS: EntityRegistry = makeEntityRegistry([
  { prefix: 'c', word: 'person', exists: (state, id) => state.characters.some((c) => c.id === id) },
  { prefix: 'h', word: 'house', exists: (state, id) => state.houses.some((h) => h.id === id) },
  { prefix: 'i', word: 'heirloom', exists: (state, id) => state.heirlooms.some((h) => h.id === id) },
  { prefix: 'p', word: 'place', exists: (state, id) => state.place.places.some((p) => p.id === id) },
]);

const ID = /^([a-z])\d+$/;

/** Kind of the entity this id names (from the prefix), or null for an id of no kind. */
export function kindOf(id: string, kinds: EntityRegistry = ENTITY_KINDS): EntityKind | null {
  const prefix = ID.exec(id)?.[1];
  return kinds.find((k) => k.prefix === prefix) ?? null;
}

/** Word of the address for the id; `person` for an unknown kind, so a link never breaks the screen. */
export function wordOf(id: string, kinds: EntityRegistry = ENTITY_KINDS): string {
  return kindOf(id, kinds)?.word ?? 'person';
}

/** Whether the id names an existing entity of any kind. */
export function entityExists(ctx: Ctx, id: string, kinds: EntityRegistry = ENTITY_KINDS): boolean {
  return kindOf(id, kinds)?.exists(ctx.state, id) ?? false;
}
