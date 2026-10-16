import { describe, expect, it } from 'vitest';
import {
  eventPageKey, actionControl, chanceText, chronicleAnnouncement, eventAnnouncement, numbersToggle, opinionLineText, optionControl, pickableAt,
  shortcutKey, shortcutPosition, withNumber,
} from '../src/ui/access';
import type { ActionRow, OptionRow } from '../src/ui/event';

const option = (over: Partial<OptionRow> = {}): OptionRow => ({ index: 0, label: ['Hunt'], grey: false, reason: '', chance: null, ...over });
const chance = { word: 'risky', percent: 25, title: '25%' };

describe('number keys (D-248)', () => {
  it('maps positions to digits 1…9, 0 and back', () => {
    expect([0, 1, 8, 9, 10].map(shortcutKey)).toEqual(['1', '2', '9', '0', null]);
    expect(shortcutPosition({ key: '1' })).toBe(0);
    expect(shortcutPosition({ key: '9' })).toBe(8);
    expect(shortcutPosition({ key: '0' })).toBe(9);
  });

  it('ignores modifiers, repeats, typing in fields and other keys', () => {
    expect(shortcutPosition({ key: '1', ctrlKey: true })).toBeNull();
    expect(shortcutPosition({ key: '1', metaKey: true })).toBeNull();
    expect(shortcutPosition({ key: '1', altKey: true })).toBeNull();
    expect(shortcutPosition({ key: '1', repeat: true })).toBeNull();
    expect(shortcutPosition({ key: '1', target: 'INPUT' })).toBeNull();
    expect(shortcutPosition({ key: '1', target: 'BUTTON' })).toBe(0);
    expect(shortcutPosition({ key: 'a' })).toBeNull();
    expect(shortcutPosition({ key: 'Enter' })).toBeNull();
  });

  it('picks only available choices that exist', () => {
    const rows = [{ grey: false }, { grey: true }];
    expect(pickableAt(rows, 0)).toBe(0);
    expect(pickableAt(rows, 1)).toBeNull();
    expect(pickableAt(rows, 5)).toBeNull();
  });
});

describe('numbers are not hover-only', () => {
  it('puts the number beside the word on request', () => {
    expect(withNumber('good', 11, false)).toBe('good');
    expect(withNumber('good', 11, true)).toBe('good (11)');
    expect(withNumber('good', null, true)).toBe('good');
    expect(chanceText(chance, false)).toBe('risky');
    expect(chanceText(chance, true)).toBe('risky, 25%');
  });

  it('shows the switch state to a screen reader', () => {
    expect(numbersToggle(false)).toEqual({ text: 'Show numbers', attrs: { 'aria-pressed': 'false' } });
    expect(numbersToggle(true)).toMatchObject({ text: 'Hide numbers', attrs: { 'aria-pressed': 'true' } });
  });

  it('shows the duration of an action as text beside its name', () => {
    const row: ActionRow = { id: 'hunt', name: 'Hunt', days: '3–5 days', grey: false, reason: '' };
    expect(actionControl(row, 0)).toMatchObject({ text: '1. Hunt', note: '3–5 days', reason: '' });
  });
});

describe('controls', () => {
  it('labels an available option with its key, chance word and shortcut attribute', () => {
    const c = optionControl(option({ chance }), 2, false);
    expect(c).toMatchObject({ text: '3. Hunt', note: '(risky)', reason: '' });
    expect(c.attrs).toEqual({ 'aria-keyshortcuts': '3', 'aria-describedby': c.noteId });
    expect(optionControl(option({ chance }), 2, true).note).toBe('(risky, 25%)');
  });

  it('names link labels by plain text', () => {
    const c = optionControl(option({ label: ['Ask ', { id: 'c1', name: 'Anna' }, ' for help'] }), 0, false);
    expect(c.text).toBe('1. Ask Anna for help');
  });

  it('reads a grey option by its reason as text, stays focusable and linked to the reason', () => {
    const c = optionControl(option({ grey: true, reason: 'Requires 1000 crowns' }), 1, false);
    expect(c.reason).toBe('Unavailable: Requires 1000 crowns');
    expect(c.attrs).toMatchObject({ 'aria-disabled': 'true', 'aria-describedby': c.reasonId });
    expect(c.attrs).not.toHaveProperty('disabled');
    expect(actionControl({ id: 'x', name: 'X', days: '1–2 days', grey: true, reason: 'Not in winter' }, 0).reason).toBe('Unavailable: Not in winter');
  });

  it('gives no key past the tenth choice', () => {
    const c = optionControl(option(), 10, false);
    expect(c.text).toBe('Hunt');
    expect(c.attrs).toEqual({});
  });
});

describe('live region texts', () => {
  it('keeps the page key the same whether numbers are shown or not', () => {
    const o = [option({ chance })];
    expect(eventPageKey(['Text.'], o)).toBe(eventAnnouncement(['Text.'], [optionControl(o[0]!, 0, false)]));
    expect(eventPageKey(['Text.'], o)).not.toContain('25%');
  });

  it('announces a new event with its choices, keys and reasons', () => {
    const controls = [optionControl(option({ chance }), 0, false), optionControl(option({ label: ['Wait'], grey: true, reason: 'Requires 5 crowns' }), 1, false)];
    expect(eventAnnouncement(['A choice for ', { id: 'c1', name: 'Anna' }, '.'], controls)).toBe(
      'New event. A choice for Anna. Choices: 1. Hunt (risky). 2. Wait. Unavailable: Requires 5 crowns.',
    );
  });

  it('announces new chronicle lines and stays silent without any', () => {
    expect(chronicleAnnouncement([])).toBe('');
    expect(chronicleAnnouncement(['Bought a horse.', 'Anna died.'])).toBe('Chronicle: Bought a horse. Anna died.');
  });
});

describe('opinion lines', () => {
  const line = { text: 'Helped once', year: 1701, lasting: false, value: 15 };

  it('shows the signed cause number as text when asked, and only words otherwise', () => {
    expect(opinionLineText(line, false)).toBe('Helped once, 1701');
    expect(opinionLineText(line, true)).toBe('Helped once, 1701 (+15)');
    expect(opinionLineText({ ...line, value: -10, lasting: true, year: null }, true)).toBe('Helped once (never fades) (-10)');
    expect(opinionLineText({ ...line, value: null }, true)).toBe('Helped once, 1701');
  });
});
