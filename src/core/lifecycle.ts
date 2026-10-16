/**
 * Assembly file (D-052): death of characters and the change of the head of the house. Module hooks run in the
 * fixed order below; the order is part of the random sequence, so a new hook goes at the end unless a decision says
 * otherwise. Birth (`createCharacter`) lives in hooks.ts so that the succession and its hooks can create people
 * without an import cycle (D-320); it is re-exported here.
 */
import { actionsOnDeath } from './actions/actions';
import { characterOnDeath } from './character/character';
import { log } from './chronicle/log';
import { eventsOnDeath } from './events/events';
import { familyOnDeath } from './family/family';
import { familyOnSuccession } from './family/phases';
import { healthOnDeath } from './health/health';
import { heirloomOnSuccession } from './heirloom/phases';
import { houseOnDeath } from './house/house';
import { houseOnSuccession } from './house/phases';
import { relationsOnDeath, relationsOnSuccession } from './relations/relations';
import { storiesOnDeath } from './stories/stories';
import { storiesOnSuccession } from './stories/phases';
import { chooseHeir, endHouse, succeed, successionOnDeath } from './succession/phases';
import type { Character, Ctx, DeathHook, SuccessionHook } from './state';
import { timeOnDeath } from './time/time';
import { worldOnDeath } from './world/world';

export { createCharacter } from './hooks';

const DEATH_HOOKS: readonly DeathHook[] = [
  characterOnDeath,
  healthOnDeath,
  timeOnDeath,
  actionsOnDeath,
  eventsOnDeath,
  worldOnDeath,
  relationsOnDeath,
  storiesOnDeath,
  familyOnDeath,
  houseOnDeath,
  successionOnDeath,
];

/**
 * After the heir has taken over (stage 4, D-314): what else passes to the new head. Files of these hooks never
 * import this file (import cycle).
 */
const SUCCESSION_HOOKS: readonly SuccessionHook[] = [familyOnSuccession, houseOnSuccession, relationsOnSuccession, storiesOnSuccession, heirloomOnSuccession];

/**
 * Kills a character today with a cause id. The player's death hands the house to an heir (succession/phases.ts),
 * or ends the house when there is none (D-315).
 */
export function kill(ctx: Ctx, c: Character, cause: string): void {
  const { state, content } = ctx;
  c.deathDay = state.day;
  c.deathCause = cause;
  log(ctx, { subject: c, kind: 'death', level: 'chronicle', template: content.settings.texts.death });
  for (const hook of DEATH_HOOKS) hook(ctx, c, cause);
  if (c.id === state.playerId) handOver(ctx, c);
}

function handOver(ctx: Ctx, deceased: Character): void {
  const heir = chooseHeir(ctx, deceased);
  if (heir === null) {
    endHouse(ctx);
    return;
  }
  succeed(ctx, deceased, heir);
  for (const hook of SUCCESSION_HOOKS) hook(ctx, deceased, heir);
}
