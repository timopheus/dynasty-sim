import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { MAX_WAIT_DAYS, apply, newGame, play } from '../src/core/game';
import { eventView } from '../src/core/events/view';
import { checkInvariants } from '../src/core/invariants';
import { seedRng } from '../src/core/rng';
import type { Content } from '../src/core/content/schema';
import type { GameState } from '../src/core/state';
import { realContent } from './fixtures/content';

/** A game past the backstory: the hero is an adult and waits for an action. */
function grownUp(content: Content, seed: number): GameState {
  const state = newGame(seed, content);
  const rng = seedRng(seed, 77);
  for (let i = 0; i < 200 && state.backstory.running; i++) play(state, content, botCommand(state, content, rng));
  while (state.status === 'awaiting_choice') play(state, content, botCommand(state, content, rng));
  expect(state.backstory.running).toBe(false);
  return state;
}

describe('living time (S.6, D-325)', () => {
  const content = realContent();

  it('offers live to a grown hero; it is idle: it writes no chronicle line', () => {
    const state = grownUp(content, 3);
    expect(content.actions.find((a) => a.id === 'live')?.idle).toBe(true);
    expect(state.status).toBe('awaiting_action');
    const before = state.chronicle.length;
    apply(state, content, { type: 'start', actionId: 'live' });
    expect(state.status).toBe('running');
    apply(state, content, { type: 'wait', days: 40 });
    expect(state.chronicle.filter((e) => e.kind === 'action' && e.level === 'chronicle').length).toBe(
      state.chronicle.slice(0, before).filter((e) => e.kind === 'action' && e.level === 'chronicle').length,
    );
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('365 × wait 1 and one wait 365 in live give the same state', () => {
    const a = grownUp(content, 3);
    const b = structuredClone(a);
    apply(a, content, { type: 'start', actionId: 'live' });
    apply(b, content, { type: 'start', actionId: 'live' });
    const target = a.day + 365;
    const drive = (s: GameState, step: (s: GameState) => void) => {
      while (s.day < target && s.status !== 'ended') {
        if (s.status === 'running') step(s);
        else if (s.status === 'awaiting_choice') apply(s, content, { type: 'choose', option: eventView({ state: s, content })!.options.find((o) => o.available)!.index });
        else apply(s, content, { type: 'start', actionId: 'live' });
      }
    };
    drive(a, (s) => apply(s, content, { type: 'wait', days: 1 }));
    drive(b, (s) => apply(s, content, { type: 'wait', days: target - s.day }));
    expect(a.day).toBe(b.day);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the end of an action stops the clock; a new start breaks the action off with a journal line', () => {
    const state = grownUp(content, 3);
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.status).toBe('running');
    apply(state, content, { type: 'start', actionId: 'hunt' });
    expect(state.status).toBe('running');
    expect(state.activeAction?.actionId).toBe('hunt');
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'interrupt', level: 'journal' });
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a notice does not stop the clock', () => {
    const state = grownUp(content, 3);
    apply(state, content, { type: 'start', actionId: 'live' });
    const end = state.activeAction!.endDay;
    apply(state, content, { type: 'wait', days: MAX_WAIT_DAYS });
    // Stopped by a decision (event with a choice) or by the end of the action, never in the middle by a notice.
    expect(state.status === 'awaiting_choice' || state.day >= end || state.status === 'ended').toBe(true);
    if (state.pendingEvent) expect(state.pendingEvent.eventId).toBeTruthy();
  });
});
