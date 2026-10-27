import { describe, expect, it } from 'vitest';
import { newGame, apply } from '../src/core/game';
import { startEvent } from '../src/core/events/events';
import type { EventDef } from '../src/core/events/content';
import { eventView } from '../src/core/events/view';
import { getPlayer } from '../src/core/helpers';
import { happinessMood, happinessWord } from '../src/core/mind/mind';
import { natureLines, natureOf } from '../src/core/mind/nature';
import { mindPhase } from '../src/core/mind/phases';
import { checkInvariants } from '../src/core/invariants';
import { realContent } from './fixtures/content';

const FIRST_OF_FEBRUARY = 31;

function setup(traits: string[]) {
  const base = realContent();
  const event: EventDef = {
    id: 'mind_test', weight: 1, text: 'A choice.',
    options: [
      { text: 'Run', acts: ['flee'], result: '{name} ran.' },
      { text: 'Stay', result: '{name} stayed.' },
    ],
  };
  const content = { ...base, events: [...base.events, event] };
  const state = newGame(5, content);
  const hero = getPlayer(state);
  hero.traits = traits;
  return { content, state, hero, event, ctx: { state, content } };
}

describe('deeds by and against the nature (D-457, D-460, D-467)', () => {
  it('a deed against a trait costs by its size, a deed true to a trait gives a little, none without the trait', () => {
    const { content, hero } = setup(['brave']);
    const against = natureOf(content, hero, ['flee']);
    expect(against).toMatchObject({ delta: -20, against: [{ trait: 'brave', cost: 20 }] });
    expect(natureLines(against!)[0]).toBe('Against your nature (Brave): happiness −20');
    hero.traits = ['craven'];
    expect(natureOf(content, hero, ['flee'])).toMatchObject({ delta: 3, by: [{ trait: 'craven', gain: 3 }] });
    hero.traits = ['strong'];
    expect(natureOf(content, hero, ['flee'])).toBeNull();
    expect(natureOf(content, hero, undefined)).toBeNull();
  });

  it('adds the sizes of several traits and sets gains against costs', () => {
    const { content, hero } = setup(['brave', 'honest']);
    expect(natureOf(content, hero, ['flee', 'deceive'])?.delta).toBe(-30);
    hero.traits = ['brave', 'bear_slayer'];
    expect(natureOf(content, hero, ['flee'])?.delta).toBe(-25);
  });

  it('shows in the view of the option, and the choice moves the happiness once', () => {
    const { ctx, state, hero, content, event } = setup(['brave']);
    startEvent(ctx, event, hero);
    const run = eventView(ctx)!.options[0]!;
    expect(run.icons.trait).toBe(true);
    expect(run.nature?.delta).toBe(-20);
    expect(eventView(ctx)!.options[1]!.nature).toBeNull();
    const before = state.mind.happiness!;
    apply(state, content, { type: 'choose', option: 0 });
    expect(state.mind.happiness).toBe(before - 20);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('costs nothing when the answer is the only one', () => {
    const base = realContent();
    const event: EventDef = { id: 'one_way', weight: 1, text: 'No choice.', options: [{ text: 'Run', acts: ['flee'], result: '{name} ran.' }] };
    const content = { ...base, events: [...base.events, event] };
    const state = newGame(5, content);
    const hero = getPlayer(state);
    hero.traits = ['brave'];
    startEvent({ state, content }, event, hero);
    expect(eventView({ state, content })!.options[0]!.icons.trait).toBe(false);
    const before = state.mind.happiness;
    apply(state, content, { type: 'choose', option: 0 });
    expect(state.mind.happiness).toBe(before);
  });
});

describe('happiness through the months (D-457)', () => {
  it('moves a sixth of the way to the base on the first of the month, at least a point', () => {
    const { ctx, state, hero } = setup([]);
    hero.money = 100;
    state.day = FIRST_OF_FEBRUARY;
    state.mind.happiness = 20;
    mindPhase.run(ctx);
    expect(state.mind.happiness).toBe(25);
    state.mind.happiness = 49;
    mindPhase.run(ctx);
    expect(state.mind.happiness).toBe(50);
    state.mind.happiness = 80;
    mindPhase.run(ctx);
    expect(state.mind.happiness).toBe(75);
  });

  it('does nothing on other days', () => {
    const { ctx, state } = setup([]);
    state.day = FIRST_OF_FEBRUARY + 1;
    state.mind.happiness = 20;
    mindPhase.run(ctx);
    expect(state.mind.happiness).toBe(20);
  });

  it('poverty pulls it down each month', () => {
    const { ctx, state, hero } = setup([]);
    hero.money = -5;
    state.day = FIRST_OF_FEBRUARY;
    state.mind.happiness = 50;
    mindPhase.run(ctx);
    expect(state.mind.happiness).toBe(48);
  });

  it('breaks the hero at the bottom: a trait, a line in the chronicle, a rise to the reset', () => {
    const { ctx, state, hero, content } = setup([]);
    state.mind.happiness = 10;
    // the new game waits on a scene of the backstory: lines written meanwhile follow its line (D-176)
    mindPhase.run(ctx);
    expect(hero.traits).toContain('despondent');
    expect(state.mind.happiness).toBe(40);
    expect([...state.chronicle, ...(state.pendingEvent?.after ?? [])].some((e) => e.kind === 'breakdown' && e.level === 'chronicle')).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('is worded by bands and the portrait takes a mood from it', () => {
    const { content } = setup([]);
    expect([5, 30, 50, 70, 95].map((h) => happinessWord(content, h))).toEqual(['despairing', 'unhappy', 'content', 'happy', 'joyful']);
    expect([10, 50, 90, null].map((h) => happinessMood(content, h))).toEqual(['loss', 'neutral', 'joy', null]);
  });
});
