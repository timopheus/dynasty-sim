/**
 * Assembly file (D-052, D-312): the people the hot data of every module refers to. They stay in the hot part; the
 * archive (4.3) takes only people long dead whom nobody here names, and closes the set over their own links (parents of
 * the living and so on). A module lists its references in its own RefsFn; a new module adds it to HOT_REFS.
 */
import { backstoryRefs } from './backstory/backstory';
import { chronicleRefs } from './chronicle/log';
import { eventsRefs } from './events/events';
import { familyRefs } from './family/family';
import { healthRefs } from './health/health';
import { heirloomRefs } from './heirloom/heirloom';
import { houseRefs } from './house/house';
import { narratorRefs } from './narrator/narrator';
import { relationsRefs } from './relations/relations';
import type { Ctx, RefsFn } from './state';
import { storiesRefs } from './stories/stories';
import { successionRefs } from './succession/succession';
import { timeRefs } from './time/time';
import { worldRefs } from './world/world';

/** The hero, as the core part of the state names them. */
const coreRefs: RefsFn = ({ state }) => [state.playerId];

/** In a fixed order, so the set comes out in the same order every time. */
export const HOT_REFS: readonly RefsFn[] = [
  coreRefs,
  worldRefs,
  timeRefs,
  eventsRefs,
  relationsRefs,
  healthRefs,
  narratorRefs,
  storiesRefs,
  backstoryRefs,
  chronicleRefs,
  familyRefs,
  houseRefs,
  successionRefs,
  heirloomRefs,
];

/** Every id the hot data refers to directly, once each, in the order of HOT_REFS. A pure query, no randomness. */
export function hotRefs(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const refs of HOT_REFS) for (const id of refs(ctx)) out.add(id);
  return out;
}
