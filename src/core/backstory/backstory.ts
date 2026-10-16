import { isInt } from '../helpers';
import type { Invariant } from '../state';

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
  };
}

export function initBackstoryState(): BackstoryState {
  return { backstory: { running: false, founder: null, stage: 0, inStage: 0, offered: [], played: [] } };
}

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
  return problems;
};
