import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/core/state';

// The after-choice hook of the backstory (3.1e) is a stub until 3.11; here it starts one more scene, as 3.11 will.
const hook = vi.hoisted(() => ({ after: (_ctx: Ctx): void => {} }));
vi.mock('../src/core/backstory/phases', () => ({
  backstoryOnNewGame: () => {},
  backstoryAfterChoice: (ctx: Ctx) => hook.after(ctx),
}));

const { apply, newGame } = await import('../src/core/game');
const { findEvent, startEvent } = await import('../src/core/events/events');
const { getPlayer } = await import('../src/core/helpers');
const { checkInvariants } = await import('../src/core/invariants');
const { fixtureNarrator } = await import('./fixtures/content');

describe('after-choice hooks (3.1e)', () => {
  it('a hook may start the next scene after a choice outside an action; days do not run', () => {
    const content = fixtureNarrator({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    const ctx = { state, content };
    let scenes = 1;
    hook.after = (c) => {
      if (scenes < 2) {
        scenes += 1;
        startEvent(c, findEvent(c.content, 'ping'), getPlayer(c.state));
      }
    };
    expect(startEvent(ctx, findEvent(content, 'ping'), getPlayer(state))).toBe(true);
    apply(state, content, { type: 'choose', option: 1 });
    expect(state.status).toBe('awaiting_choice');
    expect(state.pendingEvent?.eventId).toBe('ping');
    expect(state.day).toBe(0);
    expect(checkInvariants(state, content)).toEqual([]);
    apply(state, content, { type: 'choose', option: 1 });
    expect(state.status).toBe('awaiting_action');
    expect(state.pendingEvent).toBeNull();
    expect(state.day).toBe(0);
  });
});
