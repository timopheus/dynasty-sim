import { isInt } from '../helpers';
import type { Ctx, Invariant, RefsFn } from '../state';

/**
 * The fate of a parent of the founder (D-481), drawn at the birth and carried out on its day in the childhood (T.3).
 * `kind` "missing" is, for the rules, a death with the cause `vanished`; `cause` is the cause of the death either way.
 * `done` once its day has come, or once the parent died before it (the earlier death stays).
 */
export interface ParentFate {
  person: string;
  day: number;
  kind: 'death' | 'missing';
  cause: string | null;
  done: boolean;
}

/**
 * Backstory of the first hero (D-038, D-167, task 3.11). While `running` the founder lives through the scenes of the
 * deck `backstory`, one after another, before the first action; heirs never do.
 *
 * One clock (D-479, `backstory.fromBirth`): the founder is born on day 0 and the world lives between the scenes; the
 * founder waits for the next scene in the hidden action `early_years`. Every line is dated the day it is written.
 */
export interface BackstoryState {
  backstory: {
    running: boolean;
    /** The founder whose scenes these are; null before a game with a backstory starts. */
    founder: string | null;
    /** Index of the stage in `backstory.stages` and the number of scenes of it started so far. */
    stage: number;
    inStage: number;
    /** Variants of origin offered to the player in this game (D-167), drawn when the offering stage begins. */
    offered: string[];
    /** Scenes started so far, in order: a scene is never shown twice. */
    played: string[];
    /** The day of the first scene of each stage begun so far, in order of the stages. */
    dates: number[];
    /** The day the founder waits for — of the next scene, or of going out into the world; null otherwise. */
    next: number | null;
    /** No scene comes before this day — the years of study or service (`years`) pass in living time. */
    notBefore: number;
    /** Fates of the founder's parents (D-481): drawn at the birth on the clock, one per parent alive then. */
    fates: ParentFate[];
  };
}

export function initBackstoryState(): BackstoryState {
  return {
    backstory: { running: false, founder: null, stage: 0, inStage: 0, offered: [], played: [], dates: [], next: null, notBefore: 0, fates: [] },
  };
}

/** The hidden action the founder waits in for the next scene (D-479): no events, never started by the player. */
export const EARLY_YEARS = 'early_years';

/**
 * The founder's childhood on the clock (D-480, T.3): the backstory runs. Meanwhile the founder never
 * dies, pays no monthly costs, sees no boards of work, gets no events but the scenes and starts no occupation.
 */
export function inChildhood(ctx: Ctx): boolean {
  return ctx.state.backstory.running;
}

/** The person is the founder in his childhood on the clock (D-480): death passes him by. */
export function shieldedFounder(ctx: Ctx, id: string): boolean {
  return inChildhood(ctx) && ctx.state.backstory.founder === id;
}

/** The founder whose scenes these are and the parents whose fates wait for their day (D-312). */
export const backstoryRefs: RefsFn = ({ state }) => [
  ...(state.backstory.founder === null ? [] : [state.backstory.founder]),
  ...state.backstory.fates.filter((f) => !f.done).map((f) => f.person),
];

export const backstoryInvariants: Invariant = ({ state, content }) => {
  const st = state.backstory;
  const problems: string[] = [];
  const bs = content.backstory;
  if (new Set(st.played).size !== st.played.length) problems.push('backstory: a scene was played twice');
  for (const id of st.played) {
    const event = content.events.find((e) => e.id === id);
    if (!event || event.deck !== 'backstory') problems.push(`backstory: played "${id}" is not a scene of the backstory`);
  }
  if (!isInt(st.stage) || !isInt(st.inStage) || st.stage < 0 || st.inStage < 0) problems.push('backstory: stage counters are not whole numbers');
  if (bs) {
    const variants = new Set(bs.stages.flatMap((s) => s.offer?.variants ?? []));
    for (const id of st.offered) if (!variants.has(id)) problems.push(`backstory: offered "${id}" is not a variant`);
    if (st.running && st.stage > bs.stages.length) problems.push(`backstory: stage ${st.stage} is past the last one`);
    if (st.dates.length > bs.stages.length) problems.push('backstory: more stage dates than stages');
  } else if (st.running) problems.push('backstory: running without a backstory in the content');
  const founderAlive = state.characters.some((c) => c.id === st.founder && c.deathDay === null);
  // the founder never dies in his childhood (D-480)
  if (st.running && st.founder !== null && !founderAlive) problems.push('backstory: the founder died in his childhood (D-480)');
  if (st.running && founderAlive && st.founder !== state.playerId) problems.push('backstory: running for someone who is not the hero');
  // the stages come in living time, never back; the day waited for is ahead (D-479)
  let last = 0;
  for (const d of st.dates) {
    if (!isInt(d) || d < last || d > (st.running ? Number.MAX_SAFE_INTEGER : state.day)) problems.push(`backstory: stage date ${String(d)} is out of order`);
    last = d;
  }
  // a scene may be late only while an occupation of the hero's own put it off (it ended on the day of the scene)
  const late = st.next !== null && st.next < state.day && state.activeAction?.actionId === EARLY_YEARS;
  if (st.next !== null && (!st.running || !isInt(st.next) || late)) problems.push(`backstory: waits for day ${String(st.next)} on day ${state.day}`);
  if (!isInt(st.notBefore) || st.notBefore < 0) problems.push('backstory: notBefore is not a day');
  // fates of the parents (D-481): one per parent, on a day of the childhood; carried out by the time he goes out
  const seen = new Set<string>();
  for (const f of st.fates) {
    const parent = state.characters.find((c) => c.id === f.person);
    if (!parent) problems.push(`backstory: fate of unknown person ${f.person}`);
    if (seen.has(f.person)) problems.push(`backstory: two fates for ${f.person}`);
    seen.add(f.person);
    if (!isInt(f.day) || f.day < 0) problems.push(`backstory: fate of ${f.person} on day ${String(f.day)}`);
    if (f.done && parent && parent.deathDay === null) problems.push(`backstory: fate of ${f.person} done, but alive`);
    if (!f.done && !st.running && founderAlive) problems.push(`backstory: fate of ${f.person} left undone after the backstory`);
  }
  return problems;
};
