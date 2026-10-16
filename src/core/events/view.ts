import { findCharacter } from '../helpers';
import type { Ctx } from '../state';
import { renderTemplate } from '../text/render';
import type { TextPart } from '../text/text';
import { chanceBand, checkChance, type ChanceBand } from './checks';
import { scenePath } from './content';
import { currentScene, optionState, pendingEventDef } from './events';

/** One answer the player sees. */
export interface OptionView {
  /** Index for the `choose` command. */
  index: number;
  /** Label as parts; null is the "Continue" of a notice, worded by the screen. */
  text: TextPart[] | null;
  available: boolean;
  /** Why the option is grey (D-043); empty when available. */
  reasons: string[];
  /** Chance of the check: percent (shown on hover) and the band its word comes from (D-042); null without a check. */
  chance: { percent: number; band: ChanceBand } | null;
}

export interface EventView {
  eventId: string;
  protagonist: string;
  page: string | null;
  text: TextPart[];
  /** Options the player may see: hidden ones are left out (D-043). Always at least one available. */
  options: OptionView[];
}

/**
 * The pending event as the screen and the bot see it: text, options with availability, reasons and chance. Pure:
 * never consumes randomness, and the same state always gives the same view (the grammar uses the event's number).
 */
export function eventView(ctx: Ctx): EventView | null {
  const { state, content } = ctx;
  const pending = state.pendingEvent;
  const event = pendingEventDef(state, content);
  const scene = currentScene(state, content);
  if (!pending || !event || !scene) return null;
  const protagonist = findCharacter(state, pending.protagonist);
  if (!protagonist) throw new Error(`Unknown main participant ${pending.protagonist}`);
  const path = scenePath(pending.page);
  const render = (template: string, slot: string) => renderTemplate(ctx, template, pending.scope, pending.seq, slot);
  const options: OptionView[] = [];
  if (!scene.options) {
    options.push({ index: 0, text: null, available: true, reasons: [], chance: null });
  } else {
    scene.options.forEach((option, index) => {
      const s = optionState(ctx, option, protagonist, pending.scope);
      if (s.hidden) return;
      const percent = option.check ? checkChance(ctx, option.check, protagonist, pending.scope) : null;
      options.push({
        index,
        text: render(option.text, `${path}options.${index}.text`),
        available: s.available,
        reasons: s.reasons,
        chance: percent === null ? null : { percent, band: chanceBand(percent) },
      });
    });
  }
  return { eventId: event.id, protagonist: pending.protagonist, page: pending.page, text: render(scene.text, `${path}text`), options };
}
