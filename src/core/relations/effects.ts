import { z } from 'zod';
import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { Id, Int } from '../content/types';
import { log } from '../chronicle/log';
import type { Character, Ctx, Scope } from '../state';
import { fillTemplate } from '../text/text';
import { characterById } from '../world/world';
import { introduce } from './acquaintance';
import { activeRelationBetween, endRelation, findRelationKind, startRelation } from './links';
import { addOpinionReason, endHeldReasons, inScope, removeOpinionReason } from './opinions';
import { addSecret, revealSecret } from './secrets';

/**
 * Effect keys of this module (3.6), applied to the character of the block; the other person of each key is a role
 * of the scope:
 * - `opinion: [{toward, reason, value?}]` — the character thinks of the role what the reason says;
 * - `opinion_end: [{toward, reason}]` — takes a reason away, by its id or by the name a held reason waits for;
 * - `relation: [{start | end: kind, with, reason?}]` — a tie with the role starts (the character is the patron of an
 *   asymmetric one) or ends; `reason` names why it ended;
 * - `secret: {kind, known_by}` — a secret about the character, known to them and to the roles;
 * - `reveal: {kind, to}` — the roles learn the character's secret of this kind;
 * - `introduce: known | close` — the hero gets to know the character.
 * An effect that names an empty optional role, the character themself, a dead person for a new tie, a tie that
 * already exists or does not exist is skipped, never an error (D-221). Like every file that feeds effects.ts,
 * it must not import effects.ts (import cycle).
 */
const RelationEffect = z
  .strictObject({ start: Id.optional(), end: Id.optional(), with: Id, reason: Id.optional() })
  .refine((r) => (r.start === undefined) !== (r.end === undefined), 'a relation effect has either start or end')
  .refine((r) => r.reason === undefined || r.end !== undefined, 'reason goes with end');

export const relationsEffectShape = {
  opinion: z.array(z.strictObject({ toward: Id, reason: Id, value: Int.min(-100).max(100).optional() })).min(1).optional(),
  opinion_end: z.array(z.strictObject({ toward: Id, reason: Id })).min(1).optional(),
  relation: z.array(RelationEffect).min(1).optional(),
  secret: z.strictObject({ kind: Id, known_by: z.array(Id) }).optional(),
  reveal: z.strictObject({ kind: Id, to: z.array(Id).min(1) }).optional(),
  introduce: z.enum(['known', 'close']).optional(),
};

interface RelationsEffects {
  opinion?: { toward: string; reason: string; value?: number | undefined }[] | undefined;
  opinion_end?: { toward: string; reason: string }[] | undefined;
  relation?: { start?: string | undefined; end?: string | undefined; with: string; reason?: string | undefined }[] | undefined;
  secret?: { kind: string; known_by: string[] } | undefined;
  reveal?: { kind: string; to: string[] } | undefined;
  introduce?: 'known' | 'close' | undefined;
}

/** The person of a role, if the role is filled and the person is another one than `c`. */
function other(ctx: Ctx, c: Character, scope: Scope, role: string): Character | null {
  const id = scope[role];
  if (id === undefined || id === c.id) return null;
  return characterById(ctx.state, id);
}

/** Chronicle line about the hero's tie starting or ending (GDD 8.9, D-121); not written for ties between others. */
function logTie(ctx: Ctx, kindId: string, change: 'starts' | 'ends', patron: string, c: Character, o: Character): void {
  const { state, content } = ctx;
  const heroId = state.playerId;
  if (c.id !== heroId && o.id !== heroId) return;
  const kind = findRelationKind(content, kindId);
  if (!kind) return;
  const hero = c.id === heroId ? c : o;
  const friend = hero === c ? o : c;
  const asProtege = !kind.symmetric && patron !== heroId;
  const template = asProtege ? (change === 'starts' ? kind.startsAsProtege : kind.endsAsProtege) : kind[change];
  if (template === undefined) return;
  const parts = fillTemplate(template, { ...placeholderValues(hero, state.day), other: { id: friend.id, name: fullName(friend) } });
  log(ctx, { subject: hero, kind: 'relation', level: 'chronicle', parts });
}

export function applyRelationsEffects(ctx: Ctx, c: Character, effects: RelationsEffects, scope: Scope): void {
  const { state } = ctx;
  const kept = (a: Character, b: Character) => inScope(state, a.id) || inScope(state, b.id);
  for (const e of effects.opinion_end ?? []) {
    const target = other(ctx, c, scope, e.toward);
    if (!target) continue;
    if (!removeOpinionReason(ctx, c.id, target.id, e.reason)) endHeldReasons(ctx, e.reason, c.id, target.id);
  }
  for (const e of effects.opinion ?? []) {
    const target = other(ctx, c, scope, e.toward);
    if (target && kept(c, target)) addOpinionReason(ctx, c.id, target.id, e.reason, e.value);
  }
  for (const e of effects.relation ?? []) {
    const target = other(ctx, c, scope, e.with);
    if (!target) continue;
    if (e.start !== undefined) {
      if (c.deathDay !== null || target.deathDay !== null || !kept(c, target) || activeRelationBetween(state, c.id, target.id, e.start)) continue;
      startRelation(ctx, e.start, c.id, target.id);
      logTie(ctx, e.start, 'starts', c.id, c, target);
    } else if (e.end !== undefined) {
      const tie = activeRelationBetween(state, c.id, target.id, e.end);
      if (!tie) continue;
      endRelation(ctx, tie, e.reason ?? 'event');
      logTie(ctx, e.end, 'ends', tie.a, c, target);
    }
  }
  if (effects.secret) {
    const knowers = effects.secret.known_by.flatMap((role) => other(ctx, c, scope, role)?.id ?? []);
    addSecret(ctx, c.id, effects.secret.kind, [c.id, ...knowers]);
  }
  if (effects.reveal) {
    const secrets = state.secrets.filter((s) => s.about === c.id && s.kind === effects.reveal?.kind);
    for (const role of effects.reveal.to) {
      const to = other(ctx, c, scope, role);
      if (to) for (const s of secrets) revealSecret(ctx, s, to.id);
    }
  }
  if (effects.introduce !== undefined && c.id !== state.playerId) introduce(ctx, c.id, effects.introduce);
}

/** Roles the effects refer to (`toward`, `with`, `known_by`, `to`), for the cross-check of events. */
export function relationsEffectRoleRefs(effects: RelationsEffects): string[] {
  return [
    ...(effects.opinion ?? []).map((e) => e.toward),
    ...(effects.opinion_end ?? []).map((e) => e.toward),
    ...(effects.relation ?? []).map((e) => e.with),
    ...(effects.secret?.known_by ?? []),
    ...(effects.reveal?.to ?? []),
  ];
}
