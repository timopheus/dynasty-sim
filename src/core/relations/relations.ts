import { isInt } from '../helpers';
import type { RngState } from '../rng';
import type { CreateHook, DayPhase, DeathHook, Invariant, RefsFn, SuccessionHook } from '../state';
import { characterById } from '../world/world';
import { acquaintanceWeek } from './acquaintance';
import { endRelationsOf } from './links';
import type { Acquaintance, OpinionReason, Relation, Secret } from './types';

/**
 * Opinions, relations, acquaintance and secrets (2.4, D-035…D-037). Kept only for the hero and the people
 * around them, so the save stays small (D-063); no per-person fields: opinions are counted from dates.
 */
export interface RelationsState {
  opinionReasons: OpinionReason[];
  relations: Relation[];
  acquaintances: Acquaintance[];
  secrets: Secret[];
  /** Own random stream of the module, started on first use, so the world stream and the rest of the game are untouched. */
  relationsRng: RngState | null;
}

export interface RelationsCharacter {}

export function initRelationsState(): RelationsState {
  return { opinionReasons: [], relations: [], acquaintances: [], secrets: [], relationsRng: null };
}

export const createRelations: CreateHook = () => {};

/** Death closes every active relation of the dead with the reason `death` (GDD 8.7). */
export const relationsOnDeath: DeathHook = (ctx, c) => {
  endRelationsOf(ctx, c.id, 'death');
};

/** 4.8: enmity, knowledge of people and feuds pass to the heir (GDD §3, §8.6). */
export const relationsOnSuccession: SuccessionHook = () => {};

/**
 * People the relations part of the hot data refers to (D-312): both sides of a relation, an opinion reason or a
 * secret with a living person in it, and the people the hero knows. Records of the long dead only may be archived.
 */
export const relationsRefs: RefsFn = ({ state }) => {
  const alive = (id: string) => characterById(state, id)?.deathDay === null;
  const out: string[] = [];
  for (const r of state.relations) if (alive(r.a) || alive(r.b)) out.push(r.a, r.b);
  for (const r of state.opinionReasons) if (alive(r.holder) || alive(r.target)) out.push(r.holder, r.target);
  for (const a of state.acquaintances) if (a.holder === state.playerId) out.push(a.holder, a.other);
  for (const s of state.secrets) if (alive(s.about) || s.knownBy.some(alive)) out.push(s.about, ...s.knownBy);
  return out;
};

/** Weekly acquaintance step of the hero with the circle (D-037). Never stops the day. */
export const relationsPhase: DayPhase = {
  id: 'relations',
  run(ctx) {
    const { state } = ctx;
    if (!ctx.content.opinions || state.day % 7 !== 0) return false;
    acquaintanceWeek(ctx);
    return false;
  },
};

export const relationsInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const opinions = content.opinions;
  const hasData = state.opinionReasons.length + state.relations.length + state.acquaintances.length + state.secrets.length > 0;
  if (!opinions) {
    if (hasData) problems.push('relations data exists although the content has no opinions');
    return problems;
  }
  if (state.relationsRng !== null && (!Array.isArray(state.relationsRng) || state.relationsRng.length !== 4 || !state.relationsRng.every(isInt))) {
    problems.push('relations rng state is not four integers');
  }
  const known = (id: string) => characterById(state, id) !== null;
  const reasonIds = new Set(opinions.reasons.map((r) => r.id));
  for (const r of state.opinionReasons) {
    const at = `opinion ${r.holder} -> ${r.target} (${r.reason})`;
    if (!reasonIds.has(r.reason)) problems.push(`${at}: unknown reason`);
    if (r.holder === r.target) problems.push(`${at}: opinion of themself`);
    if (!known(r.holder) || !known(r.target)) problems.push(`${at}: unknown character`);
    if (!isInt(r.value) || Math.abs(r.value) > 100 || r.value === 0) problems.push(`${at}: value ${String(r.value)} out of range`);
    if (!isInt(r.day) || (r.end !== null && (!isInt(r.end) || r.end < r.day))) problems.push(`${at}: bad dates`);
  }
  const kinds = new Map(opinions.relations.map((k) => [k.id, k]));
  const ids = new Set<string>();
  const active = new Set<string>();
  for (const r of state.relations) {
    const at = `relation ${r.id}`;
    if (ids.has(r.id)) problems.push(`${at}: duplicate id`);
    ids.add(r.id);
    if (!kinds.has(r.kind)) problems.push(`${at}: unknown kind ${r.kind}`);
    if (r.a === r.b) problems.push(`${at}: ${r.a} is related to themself`);
    const a = characterById(state, r.a);
    const b = characterById(state, r.b);
    if (!a || !b) problems.push(`${at}: unknown character`);
    if (!isInt(r.start) || (r.end !== null && (!isInt(r.end) || r.end < r.start))) problems.push(`${at}: bad dates`);
    if ((r.end === null) !== (r.endReason === null)) problems.push(`${at}: end and end reason must be set together`);
    if (r.end !== null) continue;
    if (a?.deathDay !== null && a) problems.push(`${at}: active although ${r.a} is dead`);
    if (b?.deathDay !== null && b) problems.push(`${at}: active although ${r.b} is dead`);
    const key = `${r.kind}:${[r.a, r.b].sort().join('-')}`;
    if (active.has(key)) problems.push(`${at}: second active ${r.kind} between ${r.a} and ${r.b}`);
    active.add(key);
  }
  const seen = new Set<string>();
  for (const a of state.acquaintances) {
    const at = `acquaintance ${a.holder} -> ${a.other}`;
    if (a.holder === a.other) problems.push(`${at}: knows themself`);
    if (!known(a.holder) || !known(a.other)) problems.push(`${at}: unknown character`);
    if (seen.has(`${a.holder}-${a.other}`)) problems.push(`${at}: listed twice`);
    seen.add(`${a.holder}-${a.other}`);
    if (a.level !== 'known' && a.level !== 'close') problems.push(`${at}: bad level ${String(a.level)}`);
    if ((a.level === 'close') !== (a.closeSince !== null)) problems.push(`${at}: close level and close date disagree`);
    if (!isInt(a.since) || (a.closeSince !== null && a.closeSince < a.since)) problems.push(`${at}: bad dates`);
  }
  const secretIds = new Set<string>();
  for (const s of state.secrets) {
    const at = `secret ${s.id}`;
    if (secretIds.has(s.id)) problems.push(`${at}: duplicate id`);
    secretIds.add(s.id);
    if (!known(s.about)) problems.push(`${at}: unknown subject ${s.about}`);
    if (new Set(s.knownBy).size !== s.knownBy.length) problems.push(`${at}: someone is listed twice`);
    for (const id of s.knownBy) if (!known(id)) problems.push(`${at}: unknown knower ${id}`);
  }
  return problems;
};
