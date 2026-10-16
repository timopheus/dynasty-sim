import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Range, Text, type ContentError } from '../content/types';
import { checkReason } from '../conditions/reasons';
import { checkTemplate } from '../text/text';

const Per10k = Int.min(0).max(10000);

const OccupationSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Relative chance to be picked for a person of a fitting age; at least 1. */
  weight: Int.min(1),
  /** Ages in full years at which the occupation is taken up; absent means any age. */
  age: Range.optional(),
});

/** A hero's action that moves the circle: some people stay behind, others join (D-110). */
const MoveSchema = z.strictObject({
  /** Id of an action from `actions`; the circle changes when the hero completes it. */
  action: Id,
  /** How many people of the circle stay behind (go far). */
  leave: Range,
  /** How many people join, at most up to the upper bound of the circle. */
  arrive: Range,
  /** Journal line about the hero. */
  text: Text,
});

/** Top-level content key `population`, at most once (D-056, D-110). */
export const PopulationContentSchema = z.strictObject({
  /** Size of the hero's circle: refilled to `min`, `max` is a hard cap. */
  circle: Range,
  /** Age of newly appearing people. */
  newcomerAge: Range,
  /** Yearly chance (out of 10000) that a circle member drifts away from the circle. */
  driftPer10k: Per10k,
  /** Share (out of 100) of arrivals taken from living people far away instead of new ones. */
  arriveFromFarPer100: Int.min(0).max(100),
  far: z.strictObject({
    /** Yearly chance (out of 10000) that a person far away changes occupation. */
    occupationChangePer10k: Per10k,
    /** Yearly chance (out of 10000) that a person far away returns to the circle if there is room. */
    returnPer10k: Per10k,
  }),
  /** Why a condition `occupation` is not met; `{occupations}` is the list of names, "a, b or c" (3.3). */
  occupationReason: Text,
  occupations: z.array(OccupationSchema).min(1),
  moves: z.array(MoveSchema),
});

export type PopulationContent = z.infer<typeof PopulationContentSchema>;
export type OccupationDef = z.infer<typeof OccupationSchema>;
export type MoveDef = z.infer<typeof MoveSchema>;

/** Occupations a person of this age can take up. */
export function occupationsForAge(population: PopulationContent, age: number): OccupationDef[] {
  return population.occupations.filter((o) => !o.age || (age >= o.age.min && age <= o.age.max));
}

export const checkWorld: CrossCheck = ({ population, actions }) => {
  const errors: ContentError[] = [];
  const actionIds = new Set(actions.map((a) => a.item.id));
  for (const { file, item } of population) {
    const err = (path: string, message: string) => errors.push({ file, path: `population.${path}`, message });
    if (item.circle.min < 1) err('circle.min', 'the circle needs at least one person');
    const ids = new Set<string>();
    item.occupations.forEach((o, i) => {
      if (ids.has(o.id)) err(`occupations[${i}].id`, `duplicate occupation id "${o.id}"`);
      ids.add(o.id);
    });
    for (let age = item.newcomerAge.min; age <= item.newcomerAge.max; age++) {
      if (occupationsForAge(item, age).length === 0) {
        err('occupations', `no occupation fits newcomers of age ${age}`);
        break;
      }
    }
    const reasonProblem = checkReason(item.occupationReason, ['occupations']);
    if (reasonProblem) err('occupationReason', reasonProblem);
    const moved = new Set<string>();
    item.moves.forEach((m, i) => {
      if (!actionIds.has(m.action)) err(`moves[${i}].action`, `unknown action "${m.action}"`);
      if (moved.has(m.action)) err(`moves[${i}].action`, `duplicate move for action "${m.action}"`);
      moved.add(m.action);
      if (m.leave.max > item.circle.max) err(`moves[${i}].leave`, 'cannot send away more people than the circle holds');
      const problem = checkTemplate(m.text);
      if (problem) err(`moves[${i}].text`, problem);
    });
  }
  return errors;
};
