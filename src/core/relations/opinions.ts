import type { Content } from '../content/schema';
import { findCharacter } from '../helpers';
import type { Character, Ctx, GameState } from '../state';
import { characterById } from '../world/world';
import type { OpinionsContent, ReasonDef, ReasonKindId } from './content';
import type { OpinionReason } from './types';

export const OPINION_LIMIT = 100;

function opinionsOf(content: Content): OpinionsContent {
  if (!content.opinions) throw new Error('The content has no opinions');
  return content.opinions;
}

export function findReason(content: Content, id: string): ReasonDef | null {
  return content.opinions?.reasons.find((r) => r.id === id) ?? null;
}

function clamp(n: number): number {
  return Math.max(-OPINION_LIMIT, Math.min(OPINION_LIMIT, n));
}

/** The hero or someone of the circle: data is kept only for them (D-063). */
export function inScope(state: GameState, id: string): boolean {
  return id === state.playerId || state.circle.includes(id);
}

/** Speed of forgetting and weight of a reason of this kind for this holder, in percent, from the holder's traits. */
function memory(opinions: OpinionsContent, holder: Character | null, kind: ReasonKindId): { fade: number; scale: number } {
  let fade = 100;
  let scale = 100;
  if (!holder) return { fade, scale };
  for (const e of opinions.traitEffects) {
    if (e.kind !== kind || !holder.traits.includes(e.trait)) continue;
    fade = Math.trunc((fade * e.fade) / 100);
    scale = Math.trunc((scale * e.scale) / 100);
  }
  return { fade, scale };
}

/** What a reason counts for on a day: from its date and the holder's memory, no daily recalculation (D-035). */
export function reasonValue(opinions: OpinionsContent, record: OpinionReason, holder: Character | null, day: number): number {
  const def = opinions.reasons.find((r) => r.id === record.reason);
  if (!def || (record.end !== null && day >= record.end)) return 0;
  const { fade, scale } = memory(opinions, holder, def.kind);
  const value = Math.trunc((record.value * scale) / 100);
  if (def.decay.kind !== 'fade' || fade === 0) return value;
  const total = def.decay.days * 100;
  if (day < record.day) return 0;
  const passed = (day - record.day) * fade;
  if (passed >= total) return 0;
  return Math.trunc((value * (total - passed)) / total);
}

/** Constant part from the traits of both people, limited by `background.max`. */
export function backgroundValue(opinions: OpinionsContent, holder: Character, target: Character): number {
  let sum = 0;
  for (const rule of opinions.background.rules) {
    if (holder.traits.includes(rule.holder) && target.traits.includes(rule.target)) sum += rule.value;
  }
  const max = opinions.background.max;
  return Math.max(-max, Math.min(max, sum));
}

/** Opinion of an active relation between the two, if any, from the holder's side. */
function relationValue(state: GameState, opinions: OpinionsContent, holderId: string, targetId: string): number {
  let sum = 0;
  for (const r of state.relations) {
    if (r.end !== null) continue;
    const kind = opinions.relations.find((k) => k.id === r.kind);
    if (!kind) continue;
    if (r.a === holderId && r.b === targetId) sum += kind.opinion.a;
    else if (r.b === holderId && r.a === targetId) sum += kind.opinion.b;
  }
  return sum;
}

export interface OpinionCause {
  /** Reason id, or `background` and `relation` for the standing parts (all active relations together). */
  id: string;
  value: number;
}

/** Everything that makes up the opinion on a day, parts that are zero left out. */
export function opinionCauses(ctx: Ctx, holderId: string, targetId: string, day = ctx.state.day): OpinionCause[] {
  const { state, content } = ctx;
  const opinions = opinionsOf(content);
  const holder = findCharacter(state, holderId);
  const target = findCharacter(state, targetId);
  if (!holder || !target) throw new Error(`Unknown character in opinion ${holderId} -> ${targetId}`);
  const causes: OpinionCause[] = [];
  for (const r of state.opinionReasons) {
    if (r.holder !== holderId || r.target !== targetId) continue;
    const value = reasonValue(opinions, r, holder, day);
    if (value !== 0) causes.push({ id: r.reason, value });
  }
  const back = backgroundValue(opinions, holder, target);
  if (back !== 0) causes.push({ id: 'background', value: back });
  const rel = relationValue(state, opinions, holderId, targetId);
  if (rel !== 0) causes.push({ id: 'relation', value: rel });
  return causes;
}

/** What `holder` thinks of `target` on a day, from -100 to 100 (D-035). */
export function opinionValue(ctx: Ctx, holderId: string, targetId: string, day = ctx.state.day): number {
  return clamp(opinionCauses(ctx, holderId, targetId, day).reduce((sum, c) => sum + c.value, 0));
}

/** The opinion in words: hatred, dislike, ... devotion. */
export function opinionWord(content: Content, value: number): string {
  const words = opinionsOf(content).words;
  let found = words[0];
  for (const w of words) if (value >= w.from) found = w;
  return (found as { text: string }).text;
}

/**
 * Adds a reason to an opinion. The same reason still counting is refreshed rather than doubled. Data is only
 * kept where the hero or the circle is involved, so an event with a far role must not call this.
 */
export function addOpinionReason(ctx: Ctx, holderId: string, targetId: string, reasonId: string, value?: number): OpinionReason {
  const { state, content } = ctx;
  const def = findReason(content, reasonId);
  if (!def) throw new Error(`Unknown opinion reason "${reasonId}"`);
  if (holderId === targetId) throw new Error(`${holderId} cannot have an opinion of themself`);
  for (const id of [holderId, targetId]) if (!characterById(state, id)) throw new Error(`Unknown character ${id}`);
  if (!inScope(state, holderId) && !inScope(state, targetId)) {
    throw new Error(`Opinion ${holderId} -> ${targetId} is outside the hero's circle and is not kept`);
  }
  const amount = value ?? def.value;
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > OPINION_LIMIT || Math.sign(amount) !== Math.sign(def.value)) {
    throw new Error(`Opinion reason "${reasonId}" cannot have the value ${amount}`);
  }
  const live = state.opinionReasons.find((r) => r.reason === reasonId && r.holder === holderId && r.target === targetId && r.end === null);
  if (live) {
    live.day = state.day;
    live.value = amount;
    return live;
  }
  const record: OpinionReason = { reason: reasonId, holder: holderId, target: targetId, day: state.day, value: amount, end: null };
  state.opinionReasons.push(record);
  return record;
}

/** An event takes reasons away: every `held` reason waiting for `until` (D-035), optionally only between two people. */
export function endHeldReasons(ctx: Ctx, until: string, holderId?: string, targetId?: string): number {
  const { state, content } = ctx;
  let ended = 0;
  for (const r of state.opinionReasons) {
    if (r.end !== null) continue;
    if (holderId !== undefined && r.holder !== holderId) continue;
    if (targetId !== undefined && r.target !== targetId) continue;
    const def = findReason(content, r.reason);
    if (def?.decay.kind === 'held' && def.decay.until === until) {
      r.end = state.day;
      ended += 1;
    }
  }
  return ended;
}

/** An event takes one named reason away, e.g. forgiven (D-035). Returns whether something counted before. */
export function removeOpinionReason(ctx: Ctx, holderId: string, targetId: string, reasonId: string): boolean {
  const { state } = ctx;
  let removed = false;
  for (const r of state.opinionReasons) {
    if (r.reason === reasonId && r.holder === holderId && r.target === targetId && r.end === null) {
      r.end = state.day;
      removed = true;
    }
  }
  return removed;
}
