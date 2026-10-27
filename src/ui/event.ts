import { actionAvailability } from '../core/actions/actions';
import type { ChanceBand } from '../core/events/checks';
import { eventView, type OptionView } from '../core/events/view';
import type { Ctx } from '../core/state';
import { partsText, type TextPart } from '../core/text/text';
import { control, plainLabel, type Control } from './access';
import type { Tip } from './tips';

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
  /** Word of the chance and its percent, always shown together (D-433, D-434); null without a check (D-042). */
  chance: { word: string; percent: number; title: string } | null;
  /** Small signs on the button (D-463): a die, a trait, a coin. No numbers. */
  icons: { check: boolean; cost: boolean; trait: boolean };
  /** What the tooltip of the button says; null when there is nothing to add to the words on it (D-465). */
  tip: Tip | null;
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
      icons: o.icons,
      tip: optionTip(o),
    })),
  };
}

/**
 * The tooltip of a variant, as in CK3 (D-463): the chance in words and percent with what it is made of, what a success
 * and a failure bring, the price, the risk the author wrote, why it is grey. A grey variant shows no chance (S.10). One
 * line per fact; null when the button says it all.
 */
export function optionTip(o: OptionView): Tip | null {
  const lines: string[] = [];
  if (o.available) {
    if (o.chance) lines.push(`Chance: ${CHANCE_WORDS[o.chance.band]}, ${o.chance.percent}%`, ...o.outcomes.chanceBasis);
    if (o.outcomes.success.length) lines.push(`If it works: ${o.outcomes.success.join('; ')}`);
    if (o.outcomes.failure.length) lines.push(`If it fails: ${o.outcomes.failure.join('; ')}`);
    if (o.outcomes.result.length) lines.push(`Result: ${o.outcomes.result.join('; ')}`);
    if (o.outcomes.cost.length) lines.push(o.outcomes.cost.join('; '));
    if (o.risk) lines.push(`Risk: ${o.risk}`);
  } else if (o.reasons.length) {
    lines.push(`Unavailable: ${o.reasons.join('; ')}`);
  }
  return lines.length ? { text: lines.join('\n') } : null;
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

/** Chance as the screen words it: "a toss-up, 50%" (D-433, D-434). */
export function chanceText(chance: NonNullable<OptionRow['chance']>): string {
  return `${chance.word}, ${chance.percent}%`;
}

/**
 * One option of the event window as a button: key and name (D-463). The chance, the outcomes, the price and the risk
 * are in its tooltip (`optionTip`), the signs on it are `OptionRow.icons`. The note (chance) and the reason of a grey one
 * stay as text for a screen reader only, who has no hover (D-444).
 */
export function optionControl(o: OptionRow, position: number): Control {
  return control('option', position, plainLabel(o.label), o.chance ? `(${chanceText(o.chance)})` : '', o.grey, o.reason);
}

/** Text for the live region when a new event page appears: the event, then its options with keys. */
export function eventAnnouncement(text: readonly TextPart[], controls: readonly Control[]): string {
  const options = controls.map((c) => `${c.text}${c.note ? ` ${c.note}` : ''}${c.reason ? `. ${c.reason}` : ''}`).join('. ');
  return `New event. ${partsText(text)} Choices: ${options}.`;
}

/** Identity of an event page, so a page is announced once (D-264). */
export function eventPageKey(text: readonly TextPart[], options: readonly OptionRow[]): string {
  return eventAnnouncement(text, options.map((o, i) => optionControl(o, i)));
}

/**
 * Title of the event window. A scene of the backstory names the age of its stage, "Age 7", and no year: the scenes of
 * learning shift the birth (`age_years`), so a year would drift from the dates of the lines (S.4). Events have no
 * title of their own: a notice is "News", an event with answers "A decision".
 */
export function eventTitle(ctx: Ctx, screen: EventScreen): string {
  const { state, content } = ctx;
  if (state.backstory.running) {
    const age = content.backstory?.stages[state.backstory.stage]?.age;
    return age === undefined ? 'Growing up' : `Age ${String(age)}`;
  }
  return screen.options.every((o) => o.label.length === 1 && o.label[0] === CONTINUE_LABEL) ? 'News' : 'A decision';
}
