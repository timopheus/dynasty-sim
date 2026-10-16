import { describe, expect, it } from 'vitest';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { apply, DAY_PHASES, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import type { GameState } from '../src/core/state';
import { ageYears } from '../src/core/time/calendar';
import { fixtureContent, fixtureNarrator, realContent } from './fixtures/content';

/** Starts an action and answers every event with the given option; returns [day, eventId] of each event. */
function runAction(state: GameState, content: Content, actionId: string, option = 1): [number, string][] {
  const events: [number, string][] = [];
  apply(state, content, { type: 'start', actionId });
  while (state.status === 'awaiting_choice' && state.pendingEvent) {
    events.push([state.day, state.pendingEvent.eventId]);
    apply(state, content, { type: 'choose', option });
  }
  return events;
}

describe('game loop', () => {
  it('starts with one living character and a chronicle entry', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(state.characters).toHaveLength(1);
    expect(getPlayer(state).money).toBe(10);
    expect(entryText(state.chronicle[0]!)).toBe('Anne Fixture started at 20.');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('runs an action for exactly its duration when no events fire', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBe(30);
    expect(state.status).toBe('awaiting_action');
    expect(getPlayer(state).money).toBe(11);
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture waited.');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('interrupts an action with an event and resumes it after the choice', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    expect(state.day).toBe(1);
    expect(state.activeAction?.endDay).toBe(30);

    // With the event always firing and no cooldowns, every day stops for a choice.
    while (state.status === 'awaiting_choice') {
      apply(state, content, { type: 'choose', option: 1 });
      expect(checkInvariants(state, content)).toEqual([]);
    }
    expect(state.day).toBe(30);
    expect(state.chronicle.filter((e) => e.kind === 'event')).toHaveLength(29);
    expect(state.chronicle.at(-1)?.kind).toBe('action');
  });

  it('rejects commands that do not fit the current status', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    expect(() => apply(state, content, { type: 'choose', option: 0 })).toThrow();
    expect(() => apply(state, content, { type: 'start', actionId: 'nope' })).toThrow();
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(() => apply(state, content, { type: 'start', actionId: 'wait' })).toThrow();
    expect(() => apply(state, content, { type: 'choose', option: 5 })).toThrow();
  });

  it('kills a character of a condition and hands over to a placeholder heir', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    apply(state, content, { type: 'choose', option: 0 }); // a mortal wound, death at the weekly roll on day 7
    while (state.status === 'awaiting_choice') apply(state, content, { type: 'choose', option: 1 });

    const [founder, heir] = state.characters;
    expect(founder?.deathDay).toBe(7);
    expect(founder?.deathCause).toBe('illness');
    expect(state.playerId).toBe(heir?.id);
    expect(heir?.surname).toBe('Fixture');
    expect(heir?.money).toBe(10);
    expect(heir && ageYears(heir.birthDay, state.day)).toBe(18);
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.chronicle.slice(-3).map((e) => e.kind)).toEqual(['death', 'death_cause', 'succession']);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('creates the first head of the house within the configured age range', () => {
    const content = realContent();
    const { min, max } = content.settings.startAge;
    for (let seed = 0; seed < 1000; seed++) {
      const founder = getPlayer(newGame(seed, content));
      const age = ageYears(founder.birthDay, 0);
      expect(age >= min && age <= max, `seed ${seed}: age ${age}`).toBe(true);
    }
  });
});

describe('day loop', () => {
  it('runs the phases in the order of D-053', () => {
    expect(DAY_PHASES.map((p) => p.id)).toEqual([
      'new_day', 'scheduled', 'health', 'death', 'world', 'relations', 'action_end', 'stories', 'narrator',
    ]);
  });
});

describe('event rules', () => {
  it('keeps the minimum gap between events', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000, minDaysBetweenEvents: 5 });
    const days = runAction(newGame(1, content), content, 'wait').map(([day]) => day);
    expect(days).toEqual([1, 6, 11, 16, 21, 26]);
  });

  it('does not repeat an event before its cooldown ends', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000, eventRepeatCooldownDays: 10 });
    expect(runAction(newGame(1, content), content, 'wait')).toEqual([
      [1, 'ping'],
      [11, 'ping'],
      [21, 'ping'],
    ]);
  });

  it('fires action-bound events only during their actions', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    const duringWait = runAction(state, content, 'wait').map(([, id]) => id);
    expect(new Set(duringWait)).toEqual(new Set(['ping']));
    const duringRest = runAction(state, content, 'rest').map(([, id]) => id);
    expect(duringRest).toContain('rest_only');
  });
});
