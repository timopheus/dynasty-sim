import { z } from 'zod';
import { checkTemplate } from '../text/text';
import type { Character, Ctx } from '../state';

/**
 * Effect keys of this module: `end_action` interrupts the hero's action (`true` for the
 * default journal line of `time.texts.interrupted`, or a template of its own).
 * Like every file that feeds effects.ts, it must not import effects.ts (import cycle).
 */
export const actionsEffectShape = {
  end_action: z
    .union([z.literal(true), z.string().trim().min(1).refine((t) => checkTemplate(t) === null, { message: 'bad text template' })])
    .optional(),
};

/**
 * Only records the request: effects also run while the player is answering an event or the
 * action is ending, where nothing may stop the day loop. The action-end phase of the same
 * or the next day carries it out (see actionEndPhase).
 */
export function applyActionsEffects({ state }: Ctx, c: Character, effects: { end_action?: true | string | undefined }): void {
  if (effects.end_action === undefined || c.id !== state.playerId || !state.activeAction) return;
  state.interruptRequest = { template: effects.end_action === true ? null : effects.end_action };
}
