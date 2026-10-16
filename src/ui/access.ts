import { partsText, type TextPart } from '../core/text/text';
import type { ActionRow, OptionRow } from './event';

/**
 * Phone and accessibility rules of the screen as pure functions (D-248, D-262): nothing is reachable by hover only,
 * choices have number keys, grey choices say why in text, new events and chronicle lines are announced.
 * No DOM here, so tests import it without a browser.
 */

/** Digits 1…9 then 0 choose the first ten choices of a screen. */
export const SHORTCUT_LIMIT = 10;

/** The key that chooses the choice at `position` (0-based), or null past the tenth. */
export function shortcutKey(position: number): string | null {
  if (position < 0 || position >= SHORTCUT_LIMIT) return null;
  return String((position + 1) % 10);
}

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Tag of the focused element: typing in a field is never a shortcut. */
  target?: string;
}

/** The choice position a key press asks for, or null when it is not a plain digit shortcut. */
export function shortcutPosition(e: KeyLike): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (e.target && /^(input|textarea|select)$/i.test(e.target)) return null;
  if (!/^[0-9]$/.test(e.key)) return null;
  return (Number(e.key) + 9) % 10;
}

/** Word with its number beside it when the player asked for numbers (D-031, D-035: tap, not hover). */
export function withNumber(word: string, value: number | null, show: boolean): string {
  return show && value !== null ? `${word} (${value})` : word;
}

/** A cause line of an opinion: text, year, "never fades", and the signed number on request. */
export function opinionLineText(l: { text: string; year: number | null; lasting: boolean; value: number | null }, show: boolean): string {
  const number = show && l.value !== null ? ` (${l.value > 0 ? '+' : ''}${l.value})` : '';
  return `${l.text}${l.year !== null ? `, ${l.year}` : ''}${l.lasting ? ' (never fades)' : ''}${number}`;
}

export function chanceText(chance: NonNullable<OptionRow['chance']>, show: boolean): string {
  return show ? `${chance.word}, ${chance.percent}%` : chance.word;
}

export const NUMBERS_ON = 'Hide numbers';
export const NUMBERS_OFF = 'Show numbers';

/** The "numbers" switch: a toggle button, its state read by a screen reader (`aria-pressed`). */
export function numbersToggle(show: boolean): { text: string; attrs: Record<string, string> } {
  return {
    text: show ? NUMBERS_ON : NUMBERS_OFF,
    attrs: { 'aria-pressed': String(show), 'aria-label': 'Numbers beside words (stats, chances, opinions)' },
  };
}

export interface Control {
  /** Visible text of the button, with the key shown first ("1. Hunt"). */
  text: string;
  /** Visible small text beside it: chance for options, duration for actions. */
  note: string;
  /** Why it is unavailable, as text (not only colour); empty when available. */
  reason: string;
  /** Plain-text DOM id of the reason, referenced by `aria-describedby`. */
  reasonId: string;
  attrs: Record<string, string>;
  key: string | null;
}

function control(prefix: string, position: number, name: string, note: string, grey: boolean, reason: string): Control {
  const key = shortcutKey(position);
  const reasonId = `${prefix}-${position}-reason`;
  const attrs: Record<string, string> = {};
  if (key) attrs['aria-keyshortcuts'] = key;
  if (grey) {
    // aria-disabled, not disabled: the button stays focusable, so a screen reader finds it and reads the reason
    attrs['aria-disabled'] = 'true';
    if (reason) attrs['aria-describedby'] = reasonId;
  }
  return {
    text: key ? `${key}. ${name}` : name,
    note,
    reason: grey ? `Unavailable${reason ? `: ${reason}` : ''}` : '',
    reasonId,
    attrs,
    key,
  };
}

export function plainLabel(label: readonly TextPart[]): string {
  return partsText(label);
}

/** One event option as a button: key, name, chance word (percent on request), reason when grey. */
export function optionControl(o: OptionRow, position: number, showNumbers: boolean): Control {
  return control('option', position, plainLabel(o.label), o.chance ? `(${chanceText(o.chance, showNumbers)})` : '', o.grey, o.reason);
}

/** One action as a button; its duration is text beside the name, not a hover title. */
export function actionControl(a: ActionRow, position: number): Control {
  return control('action', position, a.name, a.days, a.grey, a.reason);
}

/** Positions of the choices a key can pick: grey ones are skipped by the handler, not hidden. */
export function pickableAt(rows: readonly { grey: boolean }[], position: number): number | null {
  const row = rows[position];
  return row && !row.grey ? position : null;
}

/** Text for the live region when a new event page appears: the event, then its options with keys. */
export function eventAnnouncement(text: readonly TextPart[], controls: readonly Control[]): string {
  const options = controls.map((c) => `${c.text}${c.note ? ` ${c.note}` : ''}${c.reason ? `. ${c.reason}` : ''}`).join('. ');
  return `New event. ${partsText(text)} Choices: ${options}.`;
}

/** Text for the live region when new chronicle lines were written. */
export function chronicleAnnouncement(lines: readonly string[]): string {
  return lines.length === 0 ? '' : `Chronicle: ${lines.join(' ')}`;
}
