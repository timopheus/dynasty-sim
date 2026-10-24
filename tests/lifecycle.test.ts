import { describe, expect, it } from 'vitest';
import { interruptAction } from '../src/core/actions/actions';
import { unmetConditions } from '../src/core/condition-keys';
import { play, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { statModifiers } from '../src/core/modifiers';
import { fixtureContent, fixtureNarrator } from './fixtures/content';

/** Contracts of the hook points that later tasks fill (2.1). */
describe('hook points', () => {
  it('kills a character who is not the hero without a succession', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    const ctx = { state, content };
    const other = createCharacter(ctx, { surname: 'Other', age: { min: 30, max: 30 } });
    kill(ctx, other, 'natural');
    expect(other.deathDay).toBe(0);
    expect(other.deathCause).toBe('natural');
    expect(state.playerId).toBe('c1');
    expect(state.characters).toHaveLength(2);
    expect(state.chronicle.at(-1)?.kind).toBe('death');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('interrupts the hero action and hands control back to the player', () => {
    const content = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    interruptAction({ state, content });
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.pendingEvent).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('has no condition keys and no stat modifiers yet', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    const before = [...state.rng];
    expect(unmetConditions({ state, content }, getPlayer(state), {}, {})).toEqual([]);
    expect(statModifiers({ state, content }, getPlayer(state))).toEqual([{}]);
    expect(state.rng).toEqual(before);
  });
});
