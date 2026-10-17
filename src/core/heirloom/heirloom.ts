import type { Content } from '../content/schema';
import { findCharacter, isInt } from '../helpers';
import type { Character, GameState, Invariant, RefsFn } from '../state';

/**
 * Heirloom part of the game state (stage 4, D-238, D-380). An heirloom is an entity `i…` (D-311): a thing of the
 * house with a name, a kind (an id from `heirlooms.kinds`), an owner and a history. It never leaves the list: a thing
 * that was sold or lost stays readable on its page.
 */
export type HeirloomStatus = 'held' | 'sold' | 'lost';

/** One term of ownership; the name is kept so the page reads without the person (the archive may take them). */
export interface HeirloomOwner {
  id: string;
  name: string;
  from: number;
  /** Day the term ended; null for the current owner. */
  to: number | null;
}

export interface Heirloom {
  id: string;
  name: string;
  /** Id from `heirlooms.kinds`. */
  kind: string;
  /** `held` while someone has it; `sold` and `lost` are final. */
  status: HeirloomStatus;
  /** Id of the person who holds it; null once sold or lost. */
  owner: string | null;
  /** Day it came into the house. */
  made: number;
  /** The line of the chronicle that told how it came, as plain text (the page shows it, D-380). */
  origin: string;
  /** Day it was sold or lost; null while held. */
  ended: number | null;
  /** Owners in order, the current one last. */
  owners: HeirloomOwner[];
}

export interface HeirloomState {
  /** In the order they were made; never removed. */
  heirlooms: Heirloom[];
}

export function initHeirloomState(): HeirloomState {
  return { heirlooms: [] };
}

export function heirloomById(state: GameState, id: string): Heirloom | null {
  return state.heirlooms.find((h) => h.id === id) ?? null;
}

export function kindName(content: Content, kind: string): string {
  return content.heirlooms?.kinds.find((k) => k.id === kind)?.name ?? kind;
}

/** Heirlooms that are still in the house, in the order they were made. */
export function livingHeirlooms(state: GameState): Heirloom[] {
  return state.heirlooms.filter((h) => h.status === 'held');
}

/**
 * Who holds a thing now. The death hook gives the thing of a dead owner back to the head (D-426); a dead owner is
 * still read as the hero, for saves made before that hook (D-381).
 */
export function holderOf(state: GameState, h: Heirloom): string | null {
  if (h.owner === null) return null;
  const owner = findCharacter(state, h.owner);
  return owner && owner.deathDay === null ? owner.id : state.playerId;
}

/** The things a person holds, in the order they were made; of a kind if given. */
export function heldBy(state: GameState, c: Character, kind?: string): Heirloom[] {
  return livingHeirlooms(state).filter((h) => holderOf(state, h) === c.id && (kind === undefined || h.kind === kind));
}

/** Changes the owner: closes the term of the old one and opens the term of the new one. */
export function passTo(state: GameState, h: Heirloom, to: Character, fullName: string): void {
  const last = h.owners.at(-1);
  if (last && last.to === null) last.to = state.day;
  h.owner = to.id;
  h.owners.push({ id: to.id, name: fullName, from: state.day, to: null });
}

/** People the heirloom part of the hot data refers to (D-312): the owners of the things still held. */
export const heirloomRefs: RefsFn = ({ state }) => livingHeirlooms(state).flatMap((h) => (h.owner === null ? [] : [h.owner]));

export const heirloomInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const ids = new Set<string>();
  const max = content.heirlooms?.max;
  for (const h of state.heirlooms) {
    if (ids.has(h.id)) problems.push(`duplicate heirloom id ${h.id}`);
    ids.add(h.id);
    if (content.heirlooms && !content.heirlooms.kinds.some((k) => k.id === h.kind)) problems.push(`heirloom ${h.id} has unknown kind ${h.kind}`);
    if (h.status === 'held') {
      if (h.owner === null || !findCharacter(state, h.owner)) problems.push(`heirloom ${h.id} is held by ${String(h.owner)}, who is unknown`);
      if (h.ended !== null) problems.push(`heirloom ${h.id} is held and ended`);
    } else {
      if (h.owner !== null) problems.push(`heirloom ${h.id} is ${h.status} but has an owner`);
      if (h.ended === null || !isInt(h.ended) || h.ended > state.day) problems.push(`heirloom ${h.id} is ${h.status} with no valid end day`);
    }
    if (!isInt(h.made) || h.made > state.day) problems.push(`heirloom ${h.id} is made on day ${String(h.made)}`);
    const open = h.owners.filter((o) => o.to === null);
    if (open.length !== (h.status === 'held' ? 1 : 0) || (h.status === 'held' && open[0]?.id !== h.owner)) problems.push(`heirloom ${h.id} has owner terms that do not match its owner`);
    h.owners.forEach((o, i) => {
      if (!isInt(o.from) || (o.to !== null && (!isInt(o.to) || o.to < o.from)) || (i > 0 && o.from < (h.owners[i - 1] as HeirloomOwner).from)) problems.push(`heirloom ${h.id} has an invalid owner term of ${o.id}`);
    });
  }
  if (max !== undefined && livingHeirlooms(state).length > max) problems.push(`the house holds ${livingHeirlooms(state).length} heirlooms, over the limit ${max}`);
  return problems;
};
