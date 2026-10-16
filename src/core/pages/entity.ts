import { allChronicle } from '../archive/archive';
import { ENTITY_KINDS, kindOf, type EntityRegistry } from '../entities/registry';
import type { ChronicleEntry } from '../chronicle/log';
import type { Ctx } from '../state';
import type { TextPart } from '../text/text';
import { personPage, type PersonPage } from './person';

/**
 * The common page of an entity that is not a person (D-311): a house `h…`, an heirloom `i…`; later a place, a
 * realm, a debt. 4.2 builds it and the registry of kinds; 4.7 and 4.9 fill their kinds. What is shown is decided by
 * the kind (for a house and an heirloom: what the player has seen).
 */
export interface EntityPage {
  id: string;
  /** Word of the kind, as in the address `#/<kind>/<id>`, e.g. `house`. */
  kind: string;
  title: string;
  subtitle: string;
  /** Facts as "label → text with links". */
  facts: { label: string; parts: TextPart[] }[];
  /** Chronicle lines about the entity already shown to the player, newest last. */
  chronicle: ChronicleEntry[];
}

/** A page of any entity: a person keeps their own page (D-150), every other kind has the common one. */
export type AnyPage = { type: 'person'; page: PersonPage } | { type: 'entity'; page: EntityPage };

/** Lines shown on the page of an entity. */
export const ENTITY_ENTRY_LIMIT = 30;

/** Last lines of the chronicle that link to the entity or are about it (newest last), for the page of a kind. */
export function entityChronicle(ctx: Ctx, id: string): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const all = allChronicle(ctx.state);
  for (let i = all.length - 1; i >= 0 && out.length < ENTITY_ENTRY_LIMIT; i--) {
    const e = all[i] as ChronicleEntry;
    if (e.level === 'chronicle' && (e.subject === id || e.parts.some((p) => typeof p !== 'string' && p.id === id))) out.push(e);
  }
  return out.reverse();
}

/**
 * The page of the entity with this id, or null for an unknown id (D-311). A pure query: the page of a person for
 * `c…`, the common page of the kind for any other id (the kind decides what the player may see).
 */
export function entityPage(ctx: Ctx, id: string, kinds: EntityRegistry = ENTITY_KINDS): AnyPage | null {
  const kind = kindOf(id, kinds);
  if (!kind) return null;
  if (!kind.page) {
    const page = kind.prefix === 'c' ? personPage(ctx, id) : null;
    return page ? { type: 'person', page } : null;
  }
  const page = kind.page(ctx, id);
  return page ? { type: 'entity', page } : null;
}
