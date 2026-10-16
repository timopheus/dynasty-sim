import { log } from '../chronicle/log';
import { createCharacter } from '../hooks';
import type { Character, Ctx } from '../state';

/**
 * The change of the head of the house (D-016, D-314, D-315). `kill` of lifecycle.ts calls `chooseHeir` when the hero
 * dies, then `succeed` or `endHouse`, then the SUCCESSION_HOOKS. This file never imports lifecycle.ts (import cycle):
 * the placeholder heir comes from `createCharacter` of hooks.ts. 4.1 moves the placeholder of D-007 here unchanged;
 * 4.6 puts the law and the will in its place.
 */

/**
 * The next head after `deceased`, or null when the house has ended (D-315). Until 4.6: a generated adult heir
 * (D-007) with the surname of the dead, of `settings.heirAge` (4.6 drops that setting; then `adultAge`).
 */
export function chooseHeir(ctx: Ctx, deceased: Character): Character | null {
  const { content } = ctx;
  const age = content.settings.heirAge ?? { min: content.settings.adultAge, max: content.settings.adultAge };
  return createCharacter(ctx, { surname: deceased.surname, age });
}

/**
 * The heir takes over: the money (4.6: shared out by the law or the will, D-314), the place of the hero and the
 * `succession` line (4.6: "by will" / "by law"). The player picks an action next.
 */
export function succeed(ctx: Ctx, deceased: Character, heir: Character): void {
  const { state, content } = ctx;
  heir.money = deceased.money;
  state.playerId = heir.id;
  log(ctx, { subject: heir, kind: 'succession', level: 'chronicle', template: content.settings.texts.succession });
  state.status = 'awaiting_action';
}

/**
 * The house comes to an end (D-315): nobody inherits, or the player ends it (`end`). No command is taken after this.
 * 4.6 writes the line of the end; the summary of the house is 4.14.
 */
export function endHouse(ctx: Ctx): void {
  const { state } = ctx;
  state.activeAction = null;
  state.interruptRequest = null;
  state.pendingEvent = null;
  state.status = 'ended';
}

/** What the `will` command carries (D-236, D-314). */
export interface WillOrder {
  /** Main heir; null leaves it to the law. */
  heir: string | null;
  /** Guardian of an heir under `adultAge`; null leaves it to the law. */
  guardian: string | null;
  /** Who gets each heirloom. */
  items: { item: string; to: string }[];
}

/**
 * The `will` command (D-314). 4.6: starts the short action "at the notary" (`succession.willDays`, `willCost`); the
 * terms take effect at its end, then time runs as after `start`. Until then the command is refused.
 */
export function willCommand(_ctx: Ctx, _order: WillOrder): void {
  throw new Error('Wills are not in the game yet');
}
