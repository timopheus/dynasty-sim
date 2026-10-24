import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { eventView } from '../src/core/events/view';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { apply, newGame } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { applyRecorded, newJournal, replay, type Journal } from '../src/core/save/journal';
import type { GameState } from '../src/core/state';
import { clockMode, idleAction, isPauseKey, newClock, speedForKey, tick, tickMs, waitDay } from '../src/ui/clock-model';
import { realContent } from './fixtures/content';

/** A game past the backstory, with its journal: the hero is an adult and waits for an action. */
function grownUp(content: Content, seed: number): { state: GameState; journal: Journal } {
  const state = newGame(seed, content);
  const journal = newJournal(seed, 'v');
  const rng = seedRng(seed, 77);
  const step = () => {
    const cmd = botCommand(state, content, rng);
    applyRecorded(journal, state, content, cmd);
    if (state.status === 'running') applyRecorded(journal, state, content, { type: 'wait', days: 36525 });
  };
  for (let i = 0; i < 200 && state.backstory.running; i++) step();
  while (state.status === 'awaiting_choice') step();
  expect(state.backstory.running).toBe(false);
  expect(state.status).toBe('awaiting_action');
  return { state, journal };
}

/** Commands change the status behind the back of the type checker. */
const statusOf = (s: GameState): string => s.status;

const quietOf = (content: Content): Content => ({ ...content, narrator: { ...content.narrator!, eventChancePer10k: 0, idleChancePer10k: 0, npcChancePer10k: 0 } });

describe('the time player (S.8)', () => {
  const content = realContent();

  it('×1 is a day a second, ×2 and ×5 faster', () => {
    expect(tickMs(1)).toBe(1000);
    expect(tickMs(2)).toBe(500);
    expect(tickMs(5)).toBe(200);
  });

  it('keys (D-448): Space pauses unless a button, a link or a field has the focus; 1/2/3 pick ×1/×2/×5', () => {
    expect(isPauseKey({ key: ' ' })).toBe(true);
    expect(isPauseKey({ key: ' ', target: 'DIV' })).toBe(true);
    expect(isPauseKey({ key: ' ', target: 'H2' })).toBe(true);
    for (const target of ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']) expect(isPauseKey({ key: ' ', target })).toBe(false);
    expect(isPauseKey({ key: ' ', repeat: true })).toBe(false);
    expect(isPauseKey({ key: ' ', ctrlKey: true })).toBe(false);
    expect(isPauseKey({ key: 'p' })).toBe(false);
    expect([speedForKey('1'), speedForKey('2'), speedForKey('3'), speedForKey('4'), speedForKey('0')]).toEqual([1, 2, 5, null, null]);
  });

  it('runs only while an action is under way, not paused, and no window waits', () => {
    const { state } = grownUp(content, 3);
    const clock = newClock(false);
    expect(clockMode(state, clock, false)).toBe('idle');
    apply(state, content, { type: 'start', actionId: 'live' });
    expect(clockMode(state, clock, false)).toBe('running');
    expect(clockMode(state, clock, true)).toBe('decision');
    expect(clockMode(state, { ...clock, paused: true }, false)).toBe('paused');
    expect(newClock(true).paused).toBe(true);
    state.status = 'ended';
    expect(clockMode(state, clock, false)).toBe('ended');
  });

  it('glues days into one wait in the journal (D-439)', () => {
    const quiet = quietOf(content);
    const { state, journal } = grownUp(quiet, 5);
    applyRecorded(journal, state, quiet, { type: 'start', actionId: 'live' });
    const before = journal.commands.length;
    for (let i = 0; i < 10; i++) waitDay(journal, state, quiet);
    expect(journal.commands.slice(before)).toEqual([{ type: 'wait', days: 10 }]);
  });

  it('starts living as one wills again when it ends, and the clock runs on', () => {
    const quiet = quietOf(content);
    const { state, journal } = grownUp(quiet, 3);
    applyRecorded(journal, state, quiet, { type: 'start', actionId: 'live' });
    const start = state.day;
    const end = state.activeAction!.endDay;
    while (state.day < end) expect(tick(journal, state, quiet)).toBe(false);
    expect(state.status).toBe('running');
    expect(state.activeAction?.actionId).toBe('live');
    expect(journal.commands.slice(-3)).toEqual([{ type: 'start', actionId: 'live' }, { type: 'wait', days: end - start }, { type: 'start', actionId: 'live' }]);
  });

  it('stops when the hero may not live as he wills (a severe illness): the player chooses', () => {
    const quiet = quietOf(content);
    const { state, journal } = grownUp(quiet, 3);
    applyRecorded(journal, state, quiet, { type: 'start', actionId: 'live' });
    getPlayer(state).conditions.push({ id: 'severe_wound', stage: 'fresh', start: state.day } as GameState['characters'][number]['conditions'][number]);
    expect(idleAction(state, quiet)).toBeNull();
    let stopped = false;
    for (let i = 0; i < 100 && !stopped; i++) stopped = tick(journal, state, quiet);
    expect(stopped).toBe(true);
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
  });

  it('stops on an event with a choice; a game played by the clock replays from its glued journal', () => {
    for (const seed of [1, 2]) {
      const { state, journal } = grownUp(content, seed);
      applyRecorded(journal, state, content, { type: 'start', actionId: 'live' });
      const target = state.day + 3 * 365;
      let events = 0;
      while (state.day < target && state.status !== 'ended') {
        if (state.status === 'running') {
          const stopped = tick(journal, state, content);
          if (stopped && statusOf(state) === 'awaiting_choice') events++;
          if (stopped) expect(state.status).not.toBe('running');
        } else if (state.status === 'awaiting_choice') {
          applyRecorded(journal, state, content, { type: 'choose', option: eventView({ state, content })!.options.find((o) => o.available)!.index });
        } else {
          applyRecorded(journal, state, content, { type: 'start', actionId: idleAction(state, content) ?? 'rest' });
        }
      }
      expect(events).toBeGreaterThan(3);
      // no two waits in a row
      journal.commands.forEach((c, i) => {
        if (c.type === 'wait') expect(journal.commands[i + 1]?.type).not.toBe('wait');
      });
      expect(JSON.stringify(replay(content, journal))).toBe(JSON.stringify(state));
      expect(checkInvariants(state, content)).toEqual([]);
    }
  }, 60_000);
});
