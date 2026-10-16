import { actionAvailability } from '../core/actions/actions';
import type { ChanceBand } from '../core/events/checks';
import { eventView } from '../core/events/view';
import type { Ctx } from '../core/state';
import type { TextPart } from '../core/text/text';

/** Words of the chance bands (D-042, D-175): the core gives ids, the screen words them. */
export const CHANCE_WORDS: Record<ChanceBand, string> = {
  hopeless: 'almost hopeless',
  risky: 'risky',
  even: 'a toss-up',
  likely: 'likely',
  certain: 'almost certain',
};

export const CONTINUE_LABEL = 'Continue';

export interface OptionRow {
  /** Index for the `choose` command. */
  index: number;
  /** Label parts; the "Continue" of a notice is a plain string (D-181). */
  label: TextPart[];
  /** Grey options are not buttons the player can press (D-043). */
  grey: boolean;
  /** Why the option is grey, joined; empty when available. */
  reason: string;
  /** Word of the chance and its percent (shown beside the word on request, hover is only a bonus, D-248); null without a check (D-042). */
  chance: { word: string; percent: number; title: string } | null;
}

export interface EventScreen {
  text: TextPart[];
  options: OptionRow[];
}

/** The pending event as the screen shows it: names as links, grey options with reasons, chance in words. Pure. */
export function eventScreen(ctx: Ctx): EventScreen | null {
  const view = eventView(ctx);
  if (!view) return null;
  return {
    text: view.text,
    options: view.options.map((o) => ({
      index: o.index,
      label: o.text ?? [CONTINUE_LABEL],
      grey: !o.available,
      reason: o.reasons.join('; '),
      chance: o.chance ? { word: CHANCE_WORDS[o.chance.band], percent: o.chance.percent, title: `${o.chance.percent}%` } : null,
    })),
  };
}

export interface ActionRow {
  id: string;
  name: string;
  days: string;
  grey: boolean;
  reason: string;
}

/** Actions the player sees: hidden ones (the reason would give away what the hero cannot know, D-043) are left out. */
export function actionRows(ctx: Ctx): ActionRow[] {
  return actionAvailability(ctx)
    .filter((a) => !a.hidden)
    .map(({ action, unmet }) => ({
      id: action.id,
      name: action.name,
      days: `${action.duration.min}–${action.duration.max} days`,
      grey: unmet.length > 0,
      reason: unmet.join('; '),
    }));
}
