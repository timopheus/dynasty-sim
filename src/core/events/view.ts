import { findCharacter } from '../helpers';
import type { Ctx } from '../state';
import { renderTemplate } from '../text/render';
import { partsText, type TextPart } from '../text/text';
import { chanceBand, checkChance, type ChanceBand } from './checks';
import { moodOf, scenePath } from './content';
import { currentScene, optionState, pendingEventDef, visibleOptionCount } from './events';
import { isRealChoice, natureLines, natureOf } from '../mind/nature';
import { optionOutcomes, type OptionOutcomes } from './outcomes';

const EMPTY: OptionOutcomes = { cost: [], result: [], success: [], failure: [], chanceBasis: [] };

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
  /**
   * What the button shows besides its text (D-463, as in CK3): a die for a check, a coin for a price, a trait for a deed
   * by or against the hero's nature (S.10b). No numbers: they are in the tooltip.
   */
  icons: { check: boolean; cost: boolean; trait: boolean };
  /** What the tooltip says: the price, the outcomes in words and what the chance is made of (D-463). */
  outcomes: OptionOutcomes;
  /** By or against the hero's nature (D-457, D-467): the lines of the tooltip and the happiness it brings; null when neither. */
  nature: { lines: string[]; delta: number } | null;
  /** The main risk as the author wrote it (`risk:`, D-439); null when none. */
  risk: string | null;
}

export interface EventView {
  eventId: string;
  protagonist: string;
  page: string | null;
  text: TextPart[];
  /** Options the player may see: hidden ones are left out (D-043). Always at least one available. */
  options: OptionView[];
  /** Mood of the scene shown, for the portrait (D-177, D-300). */
  mood: string;
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
  const render = (template: string, slot: string) => renderTemplate(ctx, template, pending.scope, pending.seq, slot, event.grammar ?? null);
  const options: OptionView[] = [];
  if (!scene.options) {
    options.push({ index: 0, text: null, available: true, reasons: [], chance: null, icons: { check: false, cost: false, trait: false }, outcomes: EMPTY, nature: null, risk: null });
  } else {
    scene.options.forEach((option, index) => {
      const s = optionState(ctx, option, protagonist, pending.scope);
      if (s.hidden) return;
      const percent = option.check ? checkChance(ctx, option.check, protagonist, pending.scope) : null;
      const outcomes = optionOutcomes(ctx, option, protagonist, pending.scope);
      const report = isRealChoice(visibleOptionCount(ctx, scene.options ?? [], protagonist, pending.scope)) ? natureOf(content, protagonist, option.acts) : null;
      options.push({
        index,
        text: render(option.text, `${path}options.${index}.text`),
        available: s.available,
        reasons: s.reasons,
        chance: percent === null ? null : { percent, band: chanceBand(percent) },
        icons: { check: percent !== null, cost: outcomes.cost.length > 0 || option.when?.can_afford !== undefined, trait: report !== null },
        outcomes,
        nature: report ? { lines: natureLines(report), delta: report.delta } : null,
        risk: option.risk === undefined ? null : partsText(render(option.risk, `${path}options.${index}.risk`)),
      });
    });
  }
  return { eventId: event.id, protagonist: pending.protagonist, page: pending.page, text: render(scene.text, `${path}text`), options, mood: moodOf(scene) };
}
