import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { fullName } from '../character/character';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { characterById } from '../world/world';
import { acquaintanceLevel } from './acquaintance';
import { findRelationKind, activeRelationBetween } from './links';
import { opinionValue, opinionWord } from './opinions';

/**
 * Condition keys of this module (3.6): `opinion: {toward, min?, max?}` — what the character thinks of the role;
 * `relation` / `relation_none: {kind, with}` — an active relation of the kind with the role (either side), or none;
 * `acquainted: known | close` — how well the hero knows the character. The other person is a role of the scope.
 *
 * A key naming an empty optional role is never met, and its reason is hidden (D-221). The reason of `opinion`
 * and the relations of a person the hero does not know is hidden too: the hero cannot know it (D-043).
 * Must not import condition-keys.ts at run time.
 */
const Opinion = Int.min(-100).max(100);

const LinkSchema = z.strictObject({ kind: Id, with: Id });

export const relationsConditionShape = {
  opinion: z
    .strictObject({ toward: Id, min: Opinion.optional(), max: Opinion.optional() })
    .refine((o) => o.min !== undefined || o.max !== undefined, 'opinion needs min or max')
    .refine((o) => o.min === undefined || o.max === undefined || o.min <= o.max, 'opinion min is above max')
    .optional(),
  relation: LinkSchema.optional(),
  relation_none: LinkSchema.optional(),
  acquainted: z.enum(['known', 'close']).optional(),
};

interface RelationsWhen {
  opinion?: { toward: string; min?: number | undefined; max?: number | undefined } | undefined;
  relation?: { kind: string; with: string } | undefined;
  relation_none?: { kind: string; with: string } | undefined;
  acquainted?: 'known' | 'close' | undefined;
}

const NEVER: Unmet = { text: '', hidden: true };

export function checkRelationsConditions(ctx: Ctx, c: Character, when: RelationsWhen, scope: Scope): Unmet[] {
  const { state, content } = ctx;
  const texts = content.opinions?.texts;
  if (when.opinion === undefined && when.relation === undefined && when.relation_none === undefined && when.acquainted === undefined) return [];
  if (!content.opinions || !texts) throw new Error('The conditions "opinion", "relation", "relation_none" and "acquainted" need the opinions section');
  const hero = scope.hero ?? state.playerId;
  const unknownToHero = c.id !== hero && acquaintanceLevel(state, content, hero, c.id) === null;
  const unmet: Unmet[] = [];
  const person = (role: string) => scope[role];
  const nameOf = (id: string) => {
    const other = characterById(state, id);
    return other ? fullName(other) : id;
  };

  if (when.opinion) {
    const { toward, min, max } = when.opinion;
    const other = person(toward);
    if (other === undefined) unmet.push(NEVER);
    else if (other === c.id) unmet.push(NEVER);
    else {
      const value = opinionValue(ctx, c.id, other);
      const hidden = unknownToHero;
      if (min !== undefined && value < min) unmet.push({ text: fillReason(texts.opinionMin, { word: opinionWord(content, min), name: nameOf(other) }), hidden });
      if (max !== undefined && value > max) unmet.push({ text: fillReason(texts.opinionMax, { word: opinionWord(content, max), name: nameOf(other) }), hidden });
    }
  }
  const links: [RelationsWhen['relation'], boolean][] = [[when.relation, true], [when.relation_none, false]];
  for (const [link, wanted] of links) {
    if (!link) continue;
    const other = person(link.with);
    if (other === undefined) {
      unmet.push(NEVER);
      continue;
    }
    if ((activeRelationBetween(state, c.id, other, link.kind) !== null) === wanted) continue;
    const kind = (findRelationKind(content, link.kind)?.name ?? link.kind).toLowerCase();
    unmet.push({ text: fillReason(wanted ? texts.relation : texts.relationNone, { kind, name: nameOf(other) }), hidden: unknownToHero });
  }
  if (when.acquainted !== undefined && c.id !== hero) {
    const level = acquaintanceLevel(state, content, hero, c.id);
    const met = level === 'close' || (level === 'known' && when.acquainted === 'known');
    if (!met) unmet.push({ text: fillReason(when.acquainted === 'known' ? texts.acquaintedKnown : texts.acquaintedClose, { name: nameOf(c.id) }), hidden: false });
  }
  return unmet;
}

/** Roles the conditions refer to (`toward`, `with`), for the cross-check of events. */
export function relationsConditionRoleRefs(when: RelationsWhen): string[] {
  return [when.opinion?.toward, when.relation?.with, when.relation_none?.with].filter((r): r is string => r !== undefined);
}
