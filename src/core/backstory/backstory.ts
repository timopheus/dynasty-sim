import { isInt } from '../helpers';
import type { Invariant, RefsFn } from '../state';

/**
 * Backstory of the first hero (D-038, D-167, task 3.11). While `running` the founder lives through the scenes of the
 * deck `backstory`, one after another, before the first action; heirs never do.
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
     * Where the lines of the backstory begin in `state.chronicle` while it runs (D-324): `lines[0]` is the founder's
     * first line ("start"), `lines[i + 1]` the first line of stage i. The end of the backstory dates them by the age of
     * the stage and empties the list.
     */
    lines: number[];
  };
}

export function initBackstoryState(): BackstoryState {
  return { backstory: { running: false, founder: null, stage: 0, inStage: 0, offered: [], played: [], lines: [] } };
}

/** The founder whose scenes these are (D-312). */
export const backstoryRefs: RefsFn = ({ state }) => (state.backstory.founder === null ? [] : [state.backstory.founder]);

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
  } else if (st.running) problems.push('backstory: running without a backstory in the content');
  if (st.running && st.founder !== state.playerId) problems.push('backstory: running for someone who is not the hero');
  if (!st.running && st.lines.length > 0) problems.push('backstory: line marks left after the end');
  let prev = 0;
  for (const i of st.lines) {
    if (!isInt(i) || i < prev || i > state.chronicle.length) problems.push(`backstory: line mark ${String(i)} is out of order`);
    prev = i;
  }
  if (bs && st.lines.length > bs.stages.length + 1) problems.push('backstory: more line marks than stages');
  return problems;
};
