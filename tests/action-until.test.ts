import { describe, expect, it } from 'vitest';
import type { ActionDef } from '../src/core/actions/content';
import type { Content } from '../src/core/content/schema';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { fixtureContent } from './fixtures/content';

/** D-466: an action with a goal ends as completed once the goal holds, before its last day. */
function withAction(action: ActionDef): Content {
  const base = fixtureContent();
  return { ...base, events: [], actions: [...base.actions, action] };
}

const saving: ActionDef = {
  id: 'save_up',
  name: 'Save up',
  category: 'self',
  duration: { min: 100, max: 100 },
  until: { when: { money_min: 60 } },
  effects: { money: 1 },
  text: '{name} saved up.',
};

describe('the goal of an action (D-466)', () => {
  it('ends the action as completed on the day its goal holds, with its effects and line', () => {
    const content = withAction(saving);
    const state = newGame(1, content);
    getPlayer(state).money = 50;
    apply(state, content, { type: 'start', actionId: 'save_up' });
    const start = state.day;
    apply(state, content, { type: 'wait', days: 5 });
    expect(state.activeAction?.actionId).toBe('save_up');
    getPlayer(state).money = 60;
    apply(state, content, { type: 'wait', days: 5 });
    expect(state.activeAction).toBeNull();
    expect(state.day).toBe(start + 6);
    expect(getPlayer(state).money).toBe(61);
    expect(state.chronicle.at(-1)?.kind).toBe('action');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('writes the goal line instead of its own, or none when it is null', () => {
    for (const [text, kinds] of [['{name} had enough at last.', 1], [null, 0]] as const) {
      const content = withAction({ ...saving, until: { when: { money_min: 60 }, text } });
      const state = newGame(1, content);
      apply(state, content, { type: 'start', actionId: 'save_up' });
      getPlayer(state).money = 70;
      const lines = state.chronicle.length;
      apply(state, content, { type: 'wait', days: 3 });
      expect(state.activeAction).toBeNull();
      const added = state.chronicle.slice(lines).filter((e) => e.kind === 'action');
      expect(added.length).toBe(kinds);
      if (text !== null) expect(JSON.stringify(added[0]?.parts)).toContain('had enough at last');
    }
  });

  it('runs to its last day while the goal does not hold', () => {
    const content = withAction(saving);
    const state = newGame(1, content);
    getPlayer(state).money = 0;
    apply(state, content, { type: 'start', actionId: 'save_up' });
    const start = state.day;
    apply(state, content, { type: 'wait', days: 200 });
    expect(state.activeAction).toBeNull();
    expect(state.day).toBe(start + 100);
  });
});
