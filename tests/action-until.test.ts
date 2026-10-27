import { describe, expect, it } from 'vitest';
import type { ActionDef } from '../src/core/actions/content';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { marry } from '../src/core/family/marriage';
import { apply, newGame, play } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { checkInvariants } from '../src/core/invariants';
import { placeIdOf, position } from '../src/core/place/place';
import { seedRng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, fixtureContent, loadOrThrow, realContent } from './fixtures/content';

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

  it('a journey whose goal holds on the way ends where the hero stands, not where he set out (D-462)', () => {
    const base = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/places')]);
    const travel = base.actions.find((a) => a.target === 'place');
    if (!travel) throw new Error('no journey in the fixture');
    const content: Content = { ...base, events: [], actions: base.actions.map((a) => (a === travel ? { ...a, until: { when: { money_min: 60 } } } : a)) };
    const state = newGame(1, content);
    getPlayer(state).money = 10;
    const to = placeIdOf(state, 'rohrbach');
    apply(state, content, { type: 'start', actionId: travel.id, target: to as string });
    apply(state, content, { type: 'wait', days: 8 });
    const way = position(state, content);
    expect(way && 'road' in way).toBe(true);
    getPlayer(state).money = 100;
    apply(state, content, { type: 'wait', days: 1 });
    expect(state.activeAction).toBeNull();
    // he stands a day further along the same road, not back in Ostmere
    const after = position(state, content);
    expect(after && 'road' in after ? after.road : null).toEqual(way && 'road' in way ? { ...way.road, done: way.road.done + 1 } : null);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

/** A game of the real content past the backstory, the hero an adult and unmarried, nothing happening by itself. */
function single(content: Content): GameState {
  for (let seed = 1; seed < 40; seed++) {
    const state = newGame(seed, content);
    const rng = seedRng(seed, 77);
    for (let i = 0; i < 200 && state.backstory.running; i++) play(state, content, botCommand(state, content, rng));
    while (state.status === 'awaiting_choice') play(state, content, botCommand(state, content, rng));
    const hero = getPlayer(state);
    if (!state.backstory.running && state.status === 'awaiting_action' && hero.spouse === null) return state;
  }
  throw new Error('no unmarried adult hero in 40 seeds');
}

describe('looking for a spouse ends with the wedding (playtest 27.10, item 6)', () => {
  it('the search stops the day after the marriage, with no line of its own', () => {
    const real = realContent();
    const content: Content = { ...real, narrator: { ...real.narrator!, eventChancePer10k: 0, idleChancePer10k: 0, npcChancePer10k: 0 } };
    const state = single(content);
    const hero = getPlayer(state);
    hero.money = 50;
    apply(state, content, { type: 'start', actionId: 'seek_spouse' });
    expect(state.activeAction?.actionId).toBe('seek_spouse');
    const end = state.activeAction?.endDay as number;
    apply(state, content, { type: 'wait', days: 3 });
    // a match found on the way (here without the event that would bring it)
    const ctx = { state, content };
    const other = createCharacter(ctx, { surname: 'Test', age: { min: 25, max: 25 } });
    other.sex = hero.sex === 'male' ? 'female' : 'male';
    expect(marry(ctx, hero, other)).not.toBeNull();
    const lines = state.chronicle.length;
    apply(state, content, { type: 'wait', days: 1 });
    expect(state.activeAction).toBeNull();
    expect(state.day).toBeLessThan(end);
    expect(state.status).toBe('awaiting_action');
    expect(state.chronicle.slice(lines).filter((e) => e.kind === 'action')).toEqual([]);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

