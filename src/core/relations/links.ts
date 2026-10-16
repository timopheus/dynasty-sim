import type { Content } from '../content/schema';
import { newId } from '../helpers';
import type { Ctx, GameState } from '../state';
import { characterById } from '../world/world';
import type { RelationKindDef } from './content';
import { inScope } from './opinions';
import type { Relation } from './types';

export function findRelationKind(content: Content, id: string): RelationKindDef | null {
  return content.opinions?.relations.find((k) => k.id === id) ?? null;
}

/** Active relation of any kind between two people, in either order. */
export function activeRelationBetween(state: GameState, x: string, y: string, kind?: string): Relation | null {
  return (
    state.relations.find(
      (r) => r.end === null && (kind === undefined || r.kind === kind) && ((r.a === x && r.b === y) || (r.a === y && r.b === x)),
    ) ?? null
  );
}

/** Active relations of a person, optionally of one kind. */
export function relationsOf(state: GameState, id: string, kind?: string): Relation[] {
  return state.relations.filter((r) => r.end === null && (r.a === id || r.b === id) && (kind === undefined || r.kind === kind));
}

/**
 * Starts a relation (D-036). `a` is the patron of a patron-protege pair. Refused for the same person twice, for the dead
 * and when the pair already has an active relation of this kind. Data is kept only where the hero or the circle is involved.
 */
export function startRelation(ctx: Ctx, kind: string, a: string, b: string): Relation {
  const { state, content } = ctx;
  if (!findRelationKind(content, kind)) throw new Error(`Unknown relation kind "${kind}"`);
  if (a === b) throw new Error(`${a} cannot be related to themself`);
  for (const id of [a, b]) {
    const c = characterById(state, id);
    if (!c) throw new Error(`Unknown character ${id}`);
    if (c.deathDay !== null) throw new Error(`${id} is dead and cannot start a relation`);
  }
  if (!inScope(state, a) && !inScope(state, b)) throw new Error(`Relation ${a} - ${b} is outside the hero's circle and is not kept`);
  if (activeRelationBetween(state, a, b, kind)) throw new Error(`${a} and ${b} already have an active ${kind}`);
  const relation: Relation = { id: newId(state, 'r'), kind, a, b, start: state.day, end: null, endReason: null };
  state.relations.push(relation);
  return relation;
}

/** Ends a relation with a reason; it stays on record (GDD 8.7). */
export function endRelation(ctx: Ctx, relation: Relation, reason: string): void {
  if (relation.end !== null) throw new Error(`Relation ${relation.id} has already ended`);
  relation.end = ctx.state.day;
  relation.endReason = reason;
}

/** Death closes every active relation of the dead (GDD 8.7). */
export function endRelationsOf(ctx: Ctx, id: string, reason: string): void {
  for (const r of relationsOf(ctx.state, id)) endRelation(ctx, r, reason);
}
