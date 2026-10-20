import { describe, expect, it } from 'vitest';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { apply, MAX_WAIT_DAYS, play, DAY_PHASES, newGame, timeRuns } from '../src/core/game';
import { eventView } from '../src/core/events/view';
import { findEvent, startEvent } from '../src/core/events/events';
import { getPlayer } from '../src/core/helpers';
import { deserialize, serialize } from '../src/core/save/save';
import { checkInvariants } from '../src/core/invariants';
import type { GameState } from '../src/core/state';
import { ageYears } from '../src/core/time/calendar';
import { fixtureContent, fixtureNarrator, realContent } from './fixtures/content';

/** Starts an action and answers every event with the given option; returns [day, eventId] of each event. */
function runAction(state: GameState, content: Content, actionId: string, option = 1): [number, string][] {
  const events: [number, string][] = [];
  play(state, content, { type: 'start', actionId });
  while (state.status === 'awaiting_choice' && state.pendingEvent) {
    events.push([state.day, state.pendingEvent.eventId]);
    play(state, content, { type: 'choose', option });
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
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBe(30);
    expect(state.status).toBe('awaiting_action');
    expect(getPlayer(state).money).toBe(11);
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture waited.');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('interrupts an action with an event and resumes it after the choice', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    expect(state.day).toBe(1);
    expect(state.activeAction?.endDay).toBe(30);

    // With the event always firing and no cooldowns, every day stops for a choice.
    while (state.status === 'awaiting_choice') {
      play(state, content, { type: 'choose', option: 1 });
      expect(checkInvariants(state, content)).toEqual([]);
    }
    expect(state.day).toBe(30);
    expect(state.chronicle.filter((e) => e.kind === 'event')).toHaveLength(29);
    expect(state.chronicle.at(-1)?.kind).toBe('action');
  });

  it('rejects commands that do not fit the current status', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    expect(() => play(state, content, { type: 'choose', option: 0 })).toThrow();
    expect(() => play(state, content, { type: 'start', actionId: 'nope' })).toThrow();
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(() => play(state, content, { type: 'start', actionId: 'wait' })).toThrow();
    expect(() => play(state, content, { type: 'choose', option: 5 })).toThrow();
  });

  it('kills a character of a condition and hands over to a placeholder heir', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    play(state, content, { type: 'start', actionId: 'wait' });
    play(state, content, { type: 'choose', option: 0 }); // a mortal wound, death at the weekly roll on day 7
    while (state.status === 'awaiting_choice') play(state, content, { type: 'choose', option: 1 });

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

describe('choice outside an action (3.1)', () => {
  it('waits for the choice without an action, then lets the player pick one without running days', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    const ctx = { state, content };
    // As a scene of the backstory will: an event before the first action.
    expect(startEvent(ctx, findEvent(content, 'ping'), getPlayer(state))).toBe(true);
    expect(state.status).toBe('awaiting_choice');
    expect(state.activeAction).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
    const loaded = deserialize(serialize(state), content);
    expect(loaded).toEqual(state);
    play(state, content, { type: 'choose', option: 1 });
    expect(state.day).toBe(0);
    expect(state.status).toBe('awaiting_action');
    expect(state.pendingEvent).toBeNull();
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture ignored it.');
    expect(checkInvariants(state, content)).toEqual([]);
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBe(30);
  });

  it('keeps the scope of the event for its effects and line', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.pendingEvent).toMatchObject({ eventId: 'ping', protagonist: state.playerId, scope: { hero: state.playerId, protagonist: state.playerId } });
  });
});

describe('day loop', () => {
  it('runs the phases in the order of D-053 and stage 4 (4.1)', () => {
    expect(DAY_PHASES.map((p) => p.id)).toEqual([
      'new_day', 'scheduled', 'health', 'death', 'world', 'family', 'succession', 'relations', 'summary', 'archive', 'action_end', 'stories', 'narrator',
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

/** The first option the player could press now. */
function firstOption(state: GameState, content: Content): number {
  const view = eventView({ state, content });
  const option = view?.options.find((o) => o.available);
  if (!option) throw new Error('no option to press');
  return option.index;
}

describe('time moves only by wait (D-439)', () => {
  it('start leaves the day where it was and the game running; wait runs it to the end of the action', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBe(0);
    expect(state.status).toBe('running');
    expect(timeRuns(state)).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
    apply(state, content, { type: 'wait', days: 10 });
    expect(state.day).toBe(10);
    expect(state.status).toBe('running');
    apply(state, content, { type: 'wait', days: MAX_WAIT_DAYS });
    expect(state.day).toBe(30);
    expect(state.status).toBe('awaiting_action');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('refuses a wait with nothing under way, and a wait of a bad length', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    expect(() => apply(state, content, { type: 'wait', days: 1 })).toThrow(/Cannot wait while awaiting_action/);
    apply(state, content, { type: 'start', actionId: 'wait' });
    for (const days of [0, -1, 1.5, MAX_WAIT_DAYS + 1]) expect(() => apply(state, content, { type: 'wait', days })).toThrow(/wait takes/);
  });

  it('while running, another start, a will or a proposal is refused until S.6 lets the hero switch', () => {
    const content = realContent();
    const state = newGame(7, content);
    // through the backstory to the first action
    while (state.status === 'awaiting_choice') apply(state, content, { type: 'choose', option: firstOption(state, content) });
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.status).toBe('running');
    const hero = getPlayer(state).id;
    expect(() => apply(state, content, { type: 'start', actionId: 'rest' })).toThrow(/while running/);
    expect(() => apply(state, content, { type: 'will', heir: null, guardian: null, items: [] })).toThrow(/Cannot go to the notary while running/);
    expect(() => apply(state, content, { type: 'propose', suitor: hero, target: hero })).toThrow(/Cannot propose a marriage while running/);
    expect(() => apply(state, content, { type: 'choose', option: 0 })).toThrow(/while running/);
    expect(state.status).toBe('running');
  });

  it('the invariant catches a running game without an action, or with an event waiting', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    expect(checkInvariants({ ...state, status: 'running' }, content)).toContain('running without an active action or with a pending event');
  });

  it('a choice does not move time either', () => {
    const content = realContent();
    const state = newGame(7, content);
    // through the backstory to the first event of an action
    while (state.status !== 'ended' && !(state.status === 'awaiting_choice' && state.activeAction)) {
      if (state.status === 'awaiting_choice') play(state, content, { type: 'choose', option: firstOption(state, content) });
      else play(state, content, { type: 'start', actionId: 'rest' });
    }
    const day = state.day;
    apply(state, content, { type: 'choose', option: firstOption(state, content) });
    expect(state.day).toBe(day);
    expect(['running', 'awaiting_choice', 'awaiting_action']).toContain(state.status);
  });

  it('a hundred waits of one day give the same game as one long wait', () => {
    const content = realContent();
    const step = (state: GameState, oneDay: boolean): void => {
      if (state.status === 'awaiting_choice') apply(state, content, { type: 'choose', option: firstOption(state, content) });
      else if (state.status === 'running') apply(state, content, { type: 'wait', days: oneDay ? 1 : MAX_WAIT_DAYS });
      else apply(state, content, { type: 'start', actionId: 'rest' });
    };
    const a = newGame(11, content);
    const b = newGame(11, content);
    while (a.day < 3 * 365 && a.status !== 'ended') step(a, false);
    while (b.day < a.day && b.status !== 'ended') step(b, true);
    // b may stop mid-run on the same day: let it reach the same decision
    while (b.status === 'running') step(b, true);
    expect(b).toEqual(a);
  });
});
