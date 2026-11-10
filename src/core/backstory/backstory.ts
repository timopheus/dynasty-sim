import { isInt } from '../helpers';
import type { Invariant, RefsFn } from '../state';

/**
 * The fate of a parent of the founder (D-481), drawn at the birth and carried out on its day in the childhood. A stub of
 * T.1 for T.3: the list stays empty until T.3 fills it. `kind` "missing" is, for the rules, a death with the cause
 * "went missing".
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
 * founder waits for the next scene in the hidden action `early_years`. Without `fromBirth` (the old way, until T.4)
 * the scenes are told on day 0 and the lines are dated afterwards (`lines`, D-324).
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
    /**
     * The old way only (no `fromBirth`; goes with it in T.4): where the lines of the backstory begin in
     * `state.chronicle` while it runs (D-324): `lines[0]` is the founder's first line ("start"), `lines[i + 1]` the
     * first line of stage i. The end of the backstory dates them by the age of the stage and empties the list.
     */
    lines: number[];
    /** One clock (D-479): the day of the first scene of each stage begun so far, in order of the stages. */
    dates: number[];
    /** One clock: the day the founder waits for — of the next scene, or of going out into the world; null otherwise. */
    next: number | null;
    /** One clock: no scene comes before this day — the years of study or service (`years`) pass in living time. */
    notBefore: number;
    /** Fates of the founder's parents (D-481), filled by T.3. */
    fates: ParentFate[];
  };
}

export function initBackstoryState(): BackstoryState {
  return {
    backstory: { running: false, founder: null, stage: 0, inStage: 0, offered: [], played: [], lines: [], dates: [], next: null, notBefore: 0, fates: [] },
  };
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
  // a founder who died today is dropped by the next phase of the backstory or the next choice (until T.3 keeps him alive, D-480)
  const founderAlive = state.characters.some((c) => c.id === st.founder && c.deathDay === null);
  if (st.running && founderAlive && st.founder !== state.playerId) problems.push('backstory: running for someone who is not the hero');
  if (!st.running && st.lines.length > 0) problems.push('backstory: line marks left after the end');
  let prev = 0;
  for (const i of st.lines) {
    if (!isInt(i) || i < prev || i > state.chronicle.length) problems.push(`backstory: line mark ${String(i)} is out of order`);
    prev = i;
  }
  if (bs && st.lines.length > bs.stages.length + 1) problems.push('backstory: more line marks than stages');
  // one clock (D-479): the stages come in living time, never back; the day waited for is ahead
  const fromBirth = bs?.fromBirth === true;
  if (fromBirth && st.lines.length > 0) problems.push('backstory: line marks on the clock (D-479 dates no line afterwards)');
  if (!fromBirth && (st.dates.length > 0 || st.next !== null)) problems.push('backstory: stage dates without the clock');
  let last = 0;
  for (const d of st.dates) {
    if (!isInt(d) || d < last || d > (st.running ? Number.MAX_SAFE_INTEGER : state.day)) problems.push(`backstory: stage date ${String(d)} is out of order`);
    last = d;
  }
  // a scene may be late only while an occupation of the hero's own put it off (it ended on the day of the scene)
  const late = st.next !== null && st.next < state.day && state.activeAction?.actionId === 'early_years';
  if (st.next !== null && (!st.running || !isInt(st.next) || late)) problems.push(`backstory: waits for day ${String(st.next)} on day ${state.day}`);
  if (!isInt(st.notBefore) || st.notBefore < 0) problems.push('backstory: notBefore is not a day');
  return problems;
};
