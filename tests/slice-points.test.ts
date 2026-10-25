import { describe, expect, it } from 'vitest';
import { conditionReport } from '../src/core/condition-keys';
import { applyEffects, type Effects } from '../src/core/effects';
import { eventsRefs, findEvent, fireEvent } from '../src/core/events/events';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { checkInvariants } from '../src/core/invariants';
import { happinessOf } from '../src/core/mind/mind';
import { mindOnSuccession } from '../src/core/mind/phases';
import { partsText } from '../src/core/text/text';
import type { Ctx } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, fixtureContent, loadOrThrow } from './fixtures/content';

/** Points of the slice besides the place (S.9a): the hero's happiness and the new fields of events. */
const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/places')]);

function game(): Ctx {
  const state = newGame(1, content);
  return { state, content };
}

describe('happiness (S.9a, D-457)', () => {
  it('is null without the key mind, the base at a new game with it', () => {
    const base = fixtureContent();
    const bare = newGame(1, base);
    expect(bare.mind.happiness).toBeNull();
    expect(checkInvariants(bare, base)).toEqual([]);
    const ctx = game();
    expect(happinessOf(ctx.state, getPlayer(ctx.state))).toBe(50);
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('moves by the effect within the range, for the hero only', () => {
    const ctx = game();
    const hero = getPlayer(ctx.state);
    const scope = { hero: hero.id, protagonist: hero.id };
    applyEffects(ctx, hero, { happiness: -70 } as Effects, scope);
    expect(ctx.state.mind.happiness).toBe(0);
    applyEffects(ctx, hero, { happiness: 500 } as Effects, scope);
    expect(ctx.state.mind.happiness).toBe(100);
    const other = createCharacter(ctx, { surname: 'Other', age: { min: 30, max: 30 } });
    applyEffects(ctx, other, { happiness: -30 } as Effects, { hero: hero.id, protagonist: other.id });
    expect(ctx.state.mind.happiness).toBe(100);
    expect(happinessOf(ctx.state, other)).toBeNull();
  });

  it('tells the hero why happiness_min and happiness_max are unmet, and hides them for anyone else', () => {
    const ctx = game();
    const hero = getPlayer(ctx.state);
    const scope = { hero: hero.id, protagonist: hero.id };
    expect(conditionReport(ctx, hero, { happiness_min: 60 }, scope).reasons).toEqual(['Requires happiness of at least 60']);
    expect(conditionReport(ctx, hero, { happiness_max: 40 }, scope).reasons).toEqual(['Requires happiness of at most 40']);
    expect(conditionReport(ctx, hero, { happiness_min: 50, happiness_max: 50 }, scope).met).toBe(true);
    const other = createCharacter(ctx, { surname: 'Other', age: { min: 30, max: 30 } });
    const report = conditionReport(ctx, other, { happiness_min: 0 }, { hero: hero.id, protagonist: other.id });
    expect(report.met).toBe(false);
    expect(report.hidden).toBe(true);
  });

  it('starts a new head from the base', () => {
    const ctx = game();
    const hero = getPlayer(ctx.state);
    ctx.state.mind.happiness = 7;
    const heir = createCharacter(ctx, { surname: 'Heir', age: { min: 20, max: 20 } });
    mindOnSuccession(ctx, hero, heir);
    expect(ctx.state.mind.happiness).toBe(50);
  });

  it('keeps the risk and the deeds of an option in the content', () => {
    const option = findEvent(content, 'highwaymen').options?.[0];
    expect(option?.risk).toBe('they may want more than the purse');
    expect(option?.acts).toEqual(['flee']);
    expect(option?.aftermath).toBe('You hand over the purse, and they let you ride on.');
  });
});

describe('the text of the outcome (S.9a, D-440)', () => {
  it('keeps the second-person text of the chosen outcome after the event, until the next choice', () => {
    const ctx = game();
    const { state } = ctx;
    const hero = getPlayer(state);
    const event = findEvent(content, 'highwaymen');
    expect(fireEvent(ctx, event, hero)).toBe('waiting');
    const seq = state.pendingEvent?.seq;
    apply(state, content, { type: 'choose', option: 0 });
    expect(state.pendingEvent).toBeNull();
    expect(state.aftermath?.seq).toBe(seq);
    expect(partsText(state.aftermath?.parts ?? [])).toBe('You hand over the purse, and they let you ride on.');
    expect(state.mind.happiness).toBe(45);
    expect(eventsRefs(ctx)).toEqual([]);
    expect(fireEvent(ctx, event, hero)).toBe('waiting');
    apply(state, content, { type: 'choose', option: 1 });
    expect(state.aftermath).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });
});
