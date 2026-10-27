import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { startEvent } from '../src/core/events/events';
import type { EventDef } from '../src/core/events/content';
import { eventView } from '../src/core/events/view';
import { getPlayer } from '../src/core/helpers';
import { realContent } from './fixtures/content';

const EVENT: EventDef = {
  id: 'test_outcomes',
  weight: 1,
  text: 'A choice.',
  options: [
    { text: 'Pay up', effects: { pay: 'minor' }, risk: 'The man may talk.' },
    {
      text: 'Fight',
      check: { stat: 'prowess', difficulty: 6 },
      success: { effects: { gain: 'trifle', traits: { add: ['brave'] }, stats: { martial: 1 } } },
      failure: { effects: { wound: 'light_wound', money: -3 }, aftermath: 'It hurts.' },
    },
    { text: 'Walk away' },
  ],
};

function view() {
  const base = realContent();
  const content = { ...base, events: [...base.events, EVENT] };
  const state = newGame(3, content);
  startEvent({ state, content }, EVENT, getPlayer(state));
  return eventView({ state, content });
}

describe('option outcomes (S.10, D-463)', () => {
  it('a priced option shows a coin and its price, a risk the author wrote', () => {
    const o = view()!.options[0]!;
    expect(o.icons).toEqual({ check: false, cost: true, trait: false });
    expect(o.outcomes.cost[0]).toMatch(/^Costs a small sum \(\d+ crowns\)$/);
    expect(o.outcomes.result).toEqual([]);
    expect(o.risk).toBe('The man may talk.');
  });

  it('an option with a check shows a die, what the chance is made of and both outcomes in words', () => {
    const o = view()!.options[1]!;
    expect(o.icons.check).toBe(true);
    expect(o.chance).not.toBeNull();
    expect(o.outcomes.chanceBasis[0]).toMatch(/^Prowess \(\d+\) against 6/);
    expect(o.outcomes.success).toEqual(expect.arrayContaining(['Become Brave', '+1 Martial']));
    expect(o.outcomes.success.some((w) => w.startsWith('Gain a trifle'))).toBe(true);
    expect(o.outcomes.failure).toEqual(expect.arrayContaining(['Wound: Light wound', 'Lose 3 crowns']));
  });

  it('does not count a bonus twice in what the chance is made of', () => {
    const base = realContent();
    const event: EventDef = {
      id: 'bonus_test', weight: 1, text: 'A fight.',
      options: [
        { text: 'Fight', check: { stat: 'prowess', difficulty: 6, bonus: [{ when: { money_min: 0 }, add: 3 }] }, success: { result: '{name} won.' }, failure: { result: '{name} lost.' } },
        { text: 'Leave', result: '{name} left.' },
      ],
    };
    const content = { ...base, events: [...base.events, event] };
    const state = newGame(3, content);
    const hero = getPlayer(state);
    startEvent({ state, content }, event, hero);
    const v = eventView({ state, content })!.options[0]!;
    const stat = Number(/\((\d+)\)/.exec(v.outcomes.chanceBasis[0] ?? '')?.[1]);
    expect(v.outcomes.chanceBasis[0]).not.toMatch(/with/);
    expect(v.chance!.percent).toBe(Math.min(95, Math.max(5, 50 + 5 * (stat - 6))));
  });

  it('an option with nothing to say has no icons and no words', () => {
    const o = view()!.options[2]!;
    expect(o.icons).toEqual({ check: false, cost: false, trait: false });
    expect(o.outcomes).toEqual({ cost: [], result: [], success: [], failure: [], chanceBasis: [] });
    expect(o.risk).toBeNull();
  });

  it('is a pure query: asking twice gives the same words and spends no randomness', () => {
    const base = realContent();
    const content = { ...base, events: [...base.events, EVENT] };
    const state = newGame(3, content);
    startEvent({ state, content }, EVENT, getPlayer(state));
    const rng = JSON.stringify(state.rng);
    const a = eventView({ state, content });
    const b = eventView({ state, content });
    expect(b).toEqual(a);
    expect(JSON.stringify(state.rng)).toBe(rng);
  });
});
