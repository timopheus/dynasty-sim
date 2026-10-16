import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content } from '../src/core/content/schema';
import type { EventDef } from '../src/core/events/content';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { narratorPhase } from '../src/core/narrator/phases';
import { deserialize, serialize } from '../src/core/save/save';
import type { Ctx } from '../src/core/state';
import { fixtureNarrator } from './fixtures/content';

// The stories of 3.8 are stubs; the tests put in their own follow-ups and weights.
const stories = vi.hoisted(() => ({
  due: [] as { eventId: string; protagonist: string; given: Record<string, string> }[],
  weight: 0,
}));
vi.mock('../src/core/stories/stories', async (original) => {
  const actual = await original<typeof import('../src/core/stories/stories')>();
  return { ...actual, dueEvents: () => stories.due, storyWeight: () => stories.weight };
});

beforeEach(() => {
  stories.due = [];
  stories.weight = 0;
});

/** An event with a choice (or a notice) that always fits. */
function ev(id: string, more: Partial<EventDef> = {}): EventDef {
  return { id, weight: 10, text: `${id} for {name}.`, options: [{ text: 'Ok', result: `{name} did ${id}.` }], ...more } as EventDef;
}

const SURE = { eventChancePer10k: 10000, minDaysBetweenEvents: 0, eventRepeatCooldownDays: 0 };

function setup(events: EventDef[], pace: Partial<NonNullable<Content['narrator']>> = {}, seed = 1): Ctx {
  const content = fixtureNarrator({ ...SURE, ...pace }, { events });
  const state = newGame(seed, content);
  state.day = 100;
  state.tensionDay = 100;
  state.activeAction = { actionId: 'wait', endDay: 130 };
  return { state, content };
}

const fired = (ctx: Ctx): string | null => ctx.state.pendingEvent?.eventId ?? null;

/** Rolls the narrator once on a fresh game per seed; the ids that fell. */
function rolls(events: EventDef[], pace: Partial<NonNullable<Content['narrator']>>, n: number, prepare?: (ctx: Ctx) => void): string[] {
  const out: string[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const ctx = setup(events, pace, seed);
    prepare?.(ctx);
    narratorPhase.run(ctx);
    out.push(fired(ctx) ?? 'none');
  }
  return out;
}

const TENSION = { gain: { medium: 15, heavy: 40 }, decayPerDay: 1, high: 50, lightFactor: 9 };

describe('the deck', () => {
  it('takes only main-deck events of the hero, never follow-ups, backstory scenes or people of the world', () => {
    const events = [
      ev('main'),
      ev('followup', { followup_only: true, weight: 1000 }),
      ev('scene', { deck: 'backstory', weight: 1000 }),
      ev('npc', { who: 'npc', weight: 1000 }),
      ev('both', { who: 'both' }),
    ];
    const ids = new Set(rolls(events, {}, 60));
    expect([...ids].sort()).toEqual(['both', 'main']);
  });

  it('does not spend randomness on conditions: the same roll with and without eligible events', () => {
    const a = setup([ev('only', { actions: ['rest'] })], { eventChancePer10k: 0 });
    const b = setup([], { eventChancePer10k: 0 });
    narratorPhase.run(a);
    narratorPhase.run(b);
    expect(a.state.rng).toEqual(b.state.rng);
  });
});

describe('the pace', () => {
  it('keeps a minimum gap between events', () => {
    const ctx = setup([ev('a')], { minDaysBetweenEvents: 10 });
    ctx.state.lastEventDay = 95;
    expect(narratorPhase.run(ctx)).toBe(false);
    expect(fired(ctx)).toBeNull();
    ctx.state.lastEventDay = 90;
    expect(narratorPhase.run(ctx)).toBe(true);
    expect(fired(ctx)).toBe('a');
    expect(ctx.state.lastEventDay).toBe(100);
  });

  it('rolls a higher chance on a long action than on a short one', () => {
    const pace = { eventChancePer10k: 0, longActionChancePer10k: 10000 };
    const events = [ev('a')];
    const short = setup(events, pace);
    short.state.activeAction = { actionId: 'rest', endDay: 108 };
    expect(narratorPhase.run(short)).toBe(false);
    const long = setup(events, { ...pace, longActionDays: 30 });
    expect(narratorPhase.run(long)).toBe(true);
  });

  it('counts the actions it saw once and the events by their length', () => {
    const ctx = setup([ev('a')], { eventChancePer10k: 0, longActionChancePer10k: 0 });
    narratorPhase.run(ctx);
    ctx.state.day += 1;
    narratorPhase.run(ctx);
    // `wait` is 30 days: short under 60, and the second day of the same action is not a new action.
    expect(ctx.state.narratorStats).toMatchObject({ shortActions: 1, longActions: 0 });
  });

  it('lets the same event repeat only after the cooldown, and cooldown_days overrides the pace', () => {
    const ctx = setup([ev('a')], { eventRepeatCooldownDays: 50 });
    ctx.state.lastFired.a = 70;
    expect(narratorPhase.run(ctx)).toBe(false);
    ctx.state.lastFired.a = 40;
    expect(narratorPhase.run(ctx)).toBe(true);
    const own = setup([ev('a', { cooldown_days: 10 })], { eventRepeatCooldownDays: 50 });
    own.state.lastFired.a = 70;
    expect(narratorPhase.run(own)).toBe(true);
  });

  it('keeps once: life to one life and once: game for good', () => {
    const ctx = setup([ev('life', { once: 'life' }), ev('game', { once: 'game' })]);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      ctx.state.pendingEvent = null;
      ctx.state.status = 'awaiting_action';
      ctx.state.day += 1;
      narratorPhase.run(ctx);
      seen.push(fired(ctx) ?? 'none');
    }
    expect(seen.filter((s) => s === 'life')).toHaveLength(1);
    expect(seen.filter((s) => s === 'game')).toHaveLength(1);
    // A new head: `life` can fall again, `game` never.
    ctx.state.playerId = getPlayer(ctx.state).id;
    ctx.state.lifeHero = 'previous_head';
    ctx.state.pendingEvent = null;
    ctx.state.day += 1;
    narratorPhase.run(ctx);
    expect(fired(ctx)).toBe('life');
  });
});

describe('tension', () => {
  const heavy = ev('heavy', { severity: 'heavy' });
  const light = ev('light');
  const medium = ev('medium', { severity: 'medium' });

  it('stops heavy events at high tension and lets them fall below it', () => {
    const high = rolls([heavy, light], { tension: TENSION }, 40, (ctx) => (ctx.state.tension = 60));
    expect(new Set(high)).toEqual(new Set(['light']));
    const calm = new Set(rolls([heavy, light], { tension: TENSION }, 40));
    expect(calm.has('heavy')).toBe(true);
  });

  it('makes light events more frequent at high tension', () => {
    const calm = rolls([medium, light], { tension: TENSION }, 200).filter((id) => id === 'light').length;
    const tense = rolls([medium, light], { tension: TENSION }, 200, (ctx) => (ctx.state.tension = 60)).filter((id) => id === 'light').length;
    expect(tense).toBeGreaterThan(calm + 40);
  });

  it('is raised by medium and heavy events and fades with the days', () => {
    const ctx = setup([heavy], { tension: TENSION });
    narratorPhase.run(ctx);
    expect(ctx.state.tension).toBe(40);
    ctx.state.pendingEvent = null;
    ctx.state.day += 30;
    const lightCtx = setup([heavy], { tension: TENSION });
    lightCtx.state.tension = 40;
    lightCtx.state.tensionDay = 70; // 30 days ago: 10 left
    lightCtx.state.lastFired = {};
    narratorPhase.run(lightCtx);
    expect(lightCtx.state.tension).toBe(50); // 40 - 30 + 40
    expect(lightCtx.state.tensionDay).toBe(100);
  });

  it('counts heavy events and notices', () => {
    const ctx = setup([heavy], { tension: TENSION });
    narratorPhase.run(ctx);
    expect(ctx.state.narratorStats.heavy).toBe(1);
    const notice = setup([ev('note', { options: undefined, result: '{name} noticed.' } as Partial<EventDef>)], {});
    narratorPhase.run(notice);
    expect(notice.state.narratorStats.notices).toBe(1);
  });
});

describe('follow-ups and stories', () => {
  it('starts a follow-up due today before the deck, whatever the chance and the gap', () => {
    const ctx = setup([ev('deck'), ev('followup', { followup_only: true })], { eventChancePer10k: 0, minDaysBetweenEvents: 999 });
    ctx.state.lastEventDay = 99;
    stories.due = [{ eventId: 'followup', protagonist: ctx.state.playerId, given: {} }];
    expect(narratorPhase.run(ctx)).toBe(true);
    expect(fired(ctx)).toBe('followup');
  });

  it('takes an event of an open story before the deck', () => {
    const events = [ev('deck', { weight: 1000 }), ev('chapter', { story: 'feud', followup_only: false })];
    stories.weight = 1;
    const ids = new Set(rolls(events, {}, 20));
    expect([...ids]).toEqual(['chapter']);
    stories.weight = 0;
    expect(new Set(rolls(events, {}, 20))).toEqual(new Set(['deck']));
  });
});

describe('the way up from the bottom', () => {
  const bottom = { when: { money_max: 10 }, wayUpFactor: 20, forceAfterDays: 100 };
  const events = [ev('plain', { weight: 10 }), ev('up', { weight: 10, tags: ['way_up'] })];

  it('weighs way_up events more at the bottom only', () => {
    const poor = rolls(events, { bottom }, 200, (ctx) => (getPlayer(ctx.state).money = 0)).filter((id) => id === 'up').length;
    const rich = rolls(events, { bottom }, 200, (ctx) => (getPlayer(ctx.state).money = 500)).filter((id) => id === 'up').length;
    expect(poor).toBeGreaterThan(170);
    expect(rich).toBeLessThan(130);
    expect(rich).toBeGreaterThan(70);
  });

  it('puts one way_up event out of turn after a long stay at the bottom', () => {
    const ctx = setup(events, { bottom, eventChancePer10k: 0 });
    getPlayer(ctx.state).money = 0;
    ctx.state.bottomSince = 0;
    expect(narratorPhase.run(ctx)).toBe(true);
    expect(fired(ctx)).toBe('up');
    expect(ctx.state.lastWayUpDay).toBe(100);
  });

  it('does not force it before the time, or when the hero is not at the bottom', () => {
    const soon = setup(events, { bottom, eventChancePer10k: 0 });
    getPlayer(soon.state).money = 0;
    soon.state.bottomSince = 50;
    expect(narratorPhase.run(soon)).toBe(false);
    const rich = setup(events, { bottom, eventChancePer10k: 0 });
    getPlayer(rich.state).money = 500;
    rich.state.bottomSince = 0;
    expect(narratorPhase.run(rich)).toBe(false);
    expect(rich.state.bottomSince).toBeNull();
  });
});

describe('state', () => {
  it('survives a save and keeps the invariants', () => {
    const ctx = setup([ev('a', { once: 'life', severity: 'heavy' })], { tension: TENSION });
    narratorPhase.run(ctx);
    expect(deserialize(serialize(ctx.state), ctx.content)).toEqual(ctx.state);
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
  });

  it('reports a tension that is not a number', () => {
    const ctx = setup([], {});
    ctx.state.tension = -1;
    expect(checkInvariants(ctx.state, ctx.content).join('\n')).toMatch(/tension/);
  });
});
