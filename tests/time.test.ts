import { describe, expect, it } from 'vitest';
import { narratorContent } from '../src/core/narrator/content';
import { actionAvailability, availableActions, interruptAction } from '../src/core/actions/actions';
import { botCommand } from '../src/core/bot';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { play, DAY_PHASES, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { conditionReport, unmetConditions } from '../src/core/condition-keys';
import { applyEffects } from '../src/core/effects';
import { createCharacter, kill } from '../src/core/lifecycle';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import type { GameState } from '../src/core/state';
import { fromYmd } from '../src/core/time/calendar';
import { loadContent } from '../src/core/content/load';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const content: Content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/time')]);

function start(state: GameState, actionId: string): void {
  play(state, content, { type: 'start', actionId });
}

function reasons(state: GameState, id: string): string[] {
  return actionAvailability({ state, content }).find((a) => a.action.id === id)?.unmet ?? [];
}

describe('day phases', () => {
  it('run in the order of D-053 and stage 4 (4.1)', () => {
    expect(DAY_PHASES.map((p) => p.id)).toEqual([
      'new_day', 'scheduled', 'health', 'death', 'world', 'family', 'succession', 'relations', 'economy', 'summary', 'archive', 'action_end', 'stories', 'narrator',
    ]);
  });
});

describe('conditions', () => {
  it('gates by season with a reason from content', () => {
    const state = newGame(1, content);
    expect(reasons(state, 'winter_only')).toEqual([]);
    state.day = fromYmd(1700, 7, 1);
    expect(reasons(state, 'winter_only')).toEqual(['Only in winter']);
    expect(availableActions({ state, content }).map((a) => a.id)).not.toContain('winter_only');
  });

  it('gates by money and age, and does not consume randomness', () => {
    const state = newGame(1, content); // 10 crowns, age 20
    const rng = [...state.rng];
    expect(reasons(state, 'rich')).toEqual(['Requires 100 crowns']);
    expect(reasons(state, 'adult')).toEqual(['Requires age 30 or older']);
    expect(reasons(state, 'young')).toEqual([]);
    getPlayer(state).money = 100;
    expect(reasons(state, 'rich')).toEqual([]);
    expect(state.rng).toEqual(rng);
  });

  it('gates by money_max (3.1) with a reason from content', () => {
    const state = newGame(1, content); // 10 crowns
    const ctx = { state, content };
    const hero = getPlayer(state);
    expect(unmetConditions(ctx, hero, { money_max: 10 }, {})).toEqual([]);
    expect(unmetConditions(ctx, hero, { money_max: 9 }, {})).toEqual(['Only with 9 crowns or less']);
    expect(conditionReport(ctx, hero, { money_max: 9 }, {})).toEqual({ met: false, reasons: ['Only with 9 crowns or less'], hidden: false });
  });

  it('refuses to start an unavailable action', () => {
    const state = newGame(1, content);
    expect(() => start(state, 'rich')).toThrow(/not available/);
  });

  it('does not let winter quarters start in summer in the real content', () => {
    const real = realContent();
    const state = newGame(1, real);
    getPlayer(state).money = 500;
    state.day = fromYmd(1700, 7, 1);
    const winter = actionAvailability({ state, content: real }).find((a) => a.action.id === 'winter_quarters');
    expect(winter?.unmet).toEqual(['Only in autumn or winter']);
  });

  it('lets the bot pick only available actions', () => {
    const state = newGame(3, content);
    const rng = seedRng(3, 1);
    for (let i = 0; i < 200; i += 1) {
      const cmd = botCommand(state, content, rng);
      if (cmd.type === 'start') expect(availableActions({ state, content }).map((a) => a.id)).toContain(cmd.actionId);
      play(state, content, cmd);
      expect(checkInvariants(state, content)).toEqual([]);
    }
  });

  it('reports content with no available action (D-017)', () => {
    const gated = { ...content, actions: content.actions.filter((a) => a.id === 'rich') };
    const state = newGame(1, gated);
    expect(checkInvariants(state, gated).some((p) => p.includes('D-017'))).toBe(true);
  });
});

describe('scheduled effects', () => {
  it('fire on their day, survive a save and are cancelled by death', () => {
    const state = newGame(1, content);
    start(state, 'pay_later'); // ends day 10, queues money for day 25
    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0]?.dueDay).toBe(25);
    const money = getPlayer(state).money;
    while (state.day < 24) start(state, 'tick');
    expect(getPlayer(state).money).toBe(money);
    const loaded = deserialize(serialize(state), content);
    expect(loaded).toEqual(state);
    start(state, 'tick');
    start(loaded, 'tick');
    expect(state.day).toBe(25);
    expect(getPlayer(state).money).toBe(money + 100);
    expect(state.scheduled).toHaveLength(0);
    expect(loaded).toEqual(state);

    const other = newGame(1, content);
    start(other, 'pay_later');
    kill({ state: other, content }, getPlayer(other), 'natural');
    expect(other.scheduled).toEqual([]);
  });
});

describe('scope of roles in later (3.1)', () => {
  it('keeps the roles of the block for the queued effects, through a save', () => {
    const state = newGame(1, content);
    const ctx = { state, content };
    const hero = getPlayer(state);
    const friend = createCharacter(ctx, { surname: 'Friend', age: { min: 30, max: 30 } });
    const scope = { hero: hero.id, protagonist: hero.id, friend: friend.id };
    applyEffects(ctx, hero, { later: [{ after_days: 3, effects: { money: 7, later: [{ after_days: 2, effects: { money: 1 } }] } }] }, scope);
    expect(state.scheduled).toEqual([{ dueDay: 3, characterId: hero.id, effects: expect.anything(), scope }]);
    expect(deserialize(serialize(state), content).scheduled[0]?.scope).toEqual(scope);
    const money = hero.money;
    while (state.day < 3) start(state, 'tick');
    expect(hero.money).toBe(money + 7);
    // The nested later was queued by the phase with the same scope.
    expect(state.scheduled).toEqual([{ dueDay: 5, characterId: hero.id, effects: { money: 1 }, scope }]);
  });

  it('reports a role given to an unknown character', () => {
    const state = newGame(1, content);
    state.scheduled.push({ dueDay: 5, characterId: state.playerId, effects: {}, scope: { friend: 'c999' } });
    expect(checkInvariants(state, content).some((p) => p.includes('role friend'))).toBe(true);
  });
});

describe('interrupting an action', () => {
  it('end_action stops the action and writes a journal line', () => {
    const state = newGame(1, content);
    start(state, 'omen'); // day 1, queues end_action for day 6
    const money = getPlayer(state).money;
    start(state, 'wait');
    expect(state.day).toBe(6);
    expect(state.activeAction).toBeNull();
    expect(state.status).toBe('awaiting_action');
    expect(getPlayer(state).money).toBe(money);
    const last = state.chronicle.at(-1)!;
    expect(last.level).toBe('journal');
    expect(last.kind).toBe('interrupt');
    expect(entryText(last)).toBe('Anne Fixture had to break off the course of the day.');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('interruptAction takes a text of its own', () => {
    const state = newGame(1, content);
    state.activeAction = { actionId: 'wait', endDay: 30 };
    interruptAction({ state, content }, '{name} fell ill.');
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture fell ill.');
    expect(state.activeAction).toBeNull();
  });
});

describe('time content', () => {
  it('requires every month to belong to exactly one season', () => {
    const base = BASE_FILES.map((f) => (f.path.endsWith('time.yaml') ? { ...f, text: f.text.replace('[12, 1, 2]', '[12, 1]') } : f));
    const result = loadContent(base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => /month 2 belongs to no season/.test(e.message))).toBe(true);
    const twice = BASE_FILES.map((f) => (f.path.endsWith('time.yaml') ? { ...f, text: f.text.replace('[12, 1, 2]', '[12, 1, 2, 3]') } : f));
    const dup = loadContent(twice);
    expect(dup.ok).toBe(false);
  });
});

describe('event options', () => {
  const eventContent: Content = {
    ...content,
    narrator: { ...narratorContent(content), eventChancePer10k: 10000, minDaysBetweenEvents: 0 },
    events: content.events.filter((e) => e.id === 'stop'),
  };

  it('end_action and later in an option take effect after the answer', () => {
    const state = newGame(1, eventContent);
    play(state, eventContent, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    const money = getPlayer(state).money;
    play(state, eventContent, { type: 'choose', option: 0 });
    expect(state.activeAction).toBeNull();
    expect(state.status).toBe('awaiting_action');
    expect(getPlayer(state).money).toBe(money); // the action's own effects are skipped
    expect(state.scheduled).toHaveLength(1);
    expect(state.chronicle.at(-1)!.kind).toBe('interrupt');
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture had to break off the course of the day.');
    expect(checkInvariants(state, eventContent)).toEqual([]);
  });

  it('end_action takes a text of its own', () => {
    const state = newGame(1, eventContent);
    play(state, eventContent, { type: 'start', actionId: 'wait' });
    play(state, eventContent, { type: 'choose', option: 1 });
    expect(entryText(state.chronicle.at(-1)!)).toBe('Anne Fixture gave up the road.');
    expect(state.activeAction).toBeNull();
  });
});

describe('time content checks', () => {
  const errorsOf = (files: typeof BASE_FILES) => {
    const result = loadContent(files);
    return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
  };

  it('requires the time section', () => {
    const files = BASE_FILES.filter((f) => !f.path.endsWith('time.yaml'));
    expect(errorsOf(files).some((e) => /^time: .*required/.test(e))).toBe(true);
  });

  it('rejects unknown placeholders in reasons and the interrupt text', () => {
    const edit = (from: string, to: string) =>
      BASE_FILES.map((f) => (f.path.endsWith('time.yaml') ? { ...f, text: f.text.replace(from, to) } : f));
    expect(errorsOf(edit('Requires {amount}', 'Requires {age}')).some((e) => /time\.reasons\.money_min: unknown placeholder/.test(e))).toBe(true);
    expect(errorsOf(edit('"{name} had', '"{pronoun} had')).some((e) => /time\.texts\.interrupted: unknown placeholder/.test(e))).toBe(true);
  });
});
