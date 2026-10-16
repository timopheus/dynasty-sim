/**
 * Assembly file (D-052): birth and death of characters. Module hooks run in the
 * fixed order below; the order is part of the random sequence, so a new hook
 * goes at the end unless a decision says otherwise.
 */
import { actionsOnDeath } from './actions/actions';
import { characterOnDeath, createCharacterBase } from './character/character';
import { log } from './chronicle/log';
import { eventsOnDeath } from './events/events';
import { createHealth, healthOnDeath } from './health/health';
import { createRelations, relationsOnDeath } from './relations/relations';
import { newId } from './helpers';
import { storiesOnDeath } from './stories/stories';
import type { Character, CreateHook, Ctx, DeathHook, NewCharacter } from './state';
import { timeOnDeath } from './time/time';
import { createWorld, worldOnDeath } from './world/world';

const CREATE_HOOKS: readonly CreateHook[] = [createCharacterBase, createHealth, createWorld, createRelations];

const DEATH_HOOKS: readonly DeathHook[] = [
  characterOnDeath,
  healthOnDeath,
  timeOnDeath,
  actionsOnDeath,
  eventsOnDeath,
  worldOnDeath,
  relationsOnDeath,
  storiesOnDeath,
];

/** Creates a living character; every module fills its part through its hook. */
export function createCharacter(ctx: Ctx, spec: NewCharacter): Character {
  const c = { id: newId(ctx.state, 'c'), deathDay: null, deathCause: null } as Character;
  for (const hook of CREATE_HOOKS) hook(ctx, c, spec);
  ctx.state.characters.push(c);
  return c;
}

/** Kills a character today with a cause id. The player's death hands the house to an heir. */
export function kill(ctx: Ctx, c: Character, cause: string): void {
  const { state, content } = ctx;
  c.deathDay = state.day;
  c.deathCause = cause;
  log(ctx, { subject: c, kind: 'death', level: 'chronicle', template: content.settings.texts.death });
  for (const hook of DEATH_HOOKS) hook(ctx, c, cause);
  if (c.id === state.playerId) succession(ctx, c);
}

/** Placeholder succession until the Dynasty stage (D-007): a generated adult heir inherits the money. */
function succession(ctx: Ctx, deceased: Character): void {
  const { state, content } = ctx;
  const heir = createCharacter(ctx, { surname: deceased.surname, age: content.settings.heirAge });
  heir.money = deceased.money;
  state.playerId = heir.id;
  log(ctx, { subject: heir, kind: 'succession', level: 'chronicle', template: content.settings.texts.succession });
  state.status = 'awaiting_action';
}
