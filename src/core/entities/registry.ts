import { housePage } from '../house/page';
import { heirloomPage } from '../heirloom/page';
import type { EntityPage } from '../pages/entity';
import type { Ctx, GameState } from '../state';

/**
 * A kind of entity (D-311): the prefix of its ids, the word of its address and the function of its page. A person keeps
 * their own page (D-150), so the kind of a person has no common page.
 */
export interface EntityKind {
  /** One letter every id of the kind starts with, followed by digits. */
  prefix: string;
  /** Word in the address `#/<word>/<id>`. */
  word: string;
  /** Common page of the entity, or null when there is no such entity. Absent for a person. */
  page?: (ctx: Ctx, id: string) => EntityPage | null;
  /** Whether the entity exists; by default the kind's own page is built (null = absent). */
  exists?: (state: GameState, id: string) => boolean;
}

/**
 * Prefixes taken by other things (D-311): `r` relation and `s` secret are records without pages; `p` place, `n`
 * realm, `d` debt, `o` organization are reserved for stages 5-6.
 */
export const RESERVED_PREFIXES: readonly string[] = ['r', 's', 'p', 'n', 'd', 'o'];

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

/** Kinds of stage 4: a person, a house (4.7), an heirloom (4.9). Later stages add theirs here. */
export const ENTITY_KINDS: EntityRegistry = makeEntityRegistry([
  { prefix: 'c', word: 'person', exists: (state, id) => state.characters.some((c) => c.id === id) },
  { prefix: 'h', word: 'house', page: housePage },
  { prefix: 'i', word: 'heirloom', page: heirloomPage },
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
  const kind = kindOf(id, kinds);
  if (!kind) return false;
  if (kind.exists) return kind.exists(ctx.state, id);
  return kind.page?.(ctx, id) != null;
}
