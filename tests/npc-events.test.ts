import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '../src/core/chronicle/log';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import type { EventDef } from '../src/core/events/content';
import { fireEvent } from '../src/core/events/events';
import { aiWeight, runNpcEvent } from '../src/core/events/npc';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import { checkInvariants } from '../src/core/invariants';
import { computeMetrics } from '../src/core/metrics/metrics';
import { narratorPhase } from '../src/core/narrator/phases';
import { personPage } from '../src/core/pages/person';
import { acquaintanceLevel, introduce } from '../src/core/relations/acquaintance';
import { activeRelationBetween } from '../src/core/relations/links';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const base: Content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/population'), ...readContentFiles('tests/fixtures/opinions')]);

const ev = (id: string, more: Partial<EventDef>): EventDef => ({ id, weight: 10, text: `${id} for {name}.`, options: [{ text: 'Ok', result: `{name} did ${id}.` }], ...more }) as EventDef;

function setup(events: EventDef[], npcChance = 0, seed = 1): { ctx: Ctx; hero: Character; people: Character[] } {
  const content: Content = { ...base, events, narrator: { ...(base.narrator as NonNullable<Content['narrator']>), npcChancePer10k: npcChance } };
  const state = newGame(seed, content);
  state.day = 100;
  const ctx = { state, content };
  const people = [0, 1, 2, 3].map(() => {
    const p = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
    p.traits = [];
    p.occupation = 'porter';
    p.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
    state.circle.push(p.id);
    return p;
  });
  return { ctx, hero: getPlayer(state), people };
}

const lines = (ctx: Ctx, kind: string): ChronicleEntry[] => ctx.state.chronicle.filter((e) => e.kind === kind);

describe('choice by the weights of ai (3.9)', () => {
  const duel = ev('quarrel', {
    who: 'npc',
    options: [
      { text: 'Swallow it', effects: { money: 1 }, ai: { base: 10 } },
      { text: 'Challenge', effects: { money: 100 }, ai: { base: 10, traits: { proud: 30, humble: -10 } } },
    ],
  } as Partial<EventDef>);

  it('weighs base plus the traits held, never below 0; no ai is weight 1', () => {
    const { people } = setup([duel]);
    const [swallow, challenge] = duel.options as NonNullable<EventDef['options']>;
    const p = people[0] as Character;
    p.traits = ['proud'];
    expect([aiWeight(swallow!, p), aiWeight(challenge!, p)]).toEqual([10, 40]);
    p.traits = ['humble'];
    expect(aiWeight(challenge!, p)).toBe(0);
    expect(aiWeight({ text: 'x' } as never, p)).toBe(1);
  });

  it('lets a proud person challenge more often (1000 events)', () => {
    const { ctx, people } = setup([duel]);
    const [proud, plain] = people as [Character, Character];
    proud.traits = ['proud'];
    const share = (c: Character): number => {
      c.money = 0;
      for (let i = 0; i < 1000; i++) expect(runNpcEvent(ctx, duel, c)).toBe(true);
      return Math.floor((c.money - 1000) / 99);
    };
    // 1000 events: each is either +1 (swallow) or +100 (challenge); money = 1000 + 99 * challenges.
    const proudChallenges = share(proud);
    const plainChallenges = share(plain);
    expect(proudChallenges).toBeGreaterThan(700);
    expect(plainChallenges).toBeGreaterThan(400);
    expect(plainChallenges).toBeLessThan(600);
    expect(proudChallenges).toBeGreaterThan(plainChallenges + 150);
  });

  it('takes only the options available to the person', () => {
    const e = ev('gated', {
      who: 'npc',
      options: [
        { text: 'Humble', effects: { money: 1 }, ai: { base: 1 } },
        { text: 'Proud only', when: { traits_any: ['proud'] }, effects: { money: 100 }, ai: { base: 1000 } },
      ],
    } as Partial<EventDef>);
    const { ctx, people } = setup([e]);
    const p = people[0] as Character;
    p.money = 0;
    runNpcEvent(ctx, e, p);
    expect(p.money).toBe(1);
  });

  it('rolls the check of the option with the stat of the person', () => {
    const e = ev('trial', {
      who: 'npc',
      options: [{ text: 'Try', check: { stat: 'prowess', difficulty: 0 }, success: { effects: { money: 7 } }, failure: { effects: { money: -7 } } }],
    } as Partial<EventDef>);
    const { ctx, people } = setup([e]);
    const p = people[0] as Character;
    p.baseStats = { ...p.baseStats, prowess: 20 };
    p.money = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      p.money = 0;
      runNpcEvent(ctx, e, p);
      seen.add(p.money);
    }
    expect([...seen].sort()).toEqual([-7, 7]);
  });
});

describe('the roll of the day (3.9)', () => {
  it('gives the hero no role and never makes them the main participant', () => {
    const e = ev('gossip', { who: 'npc', roles: { other: { pick: 'circle' } }, effects: { money: 1 }, on: { other: { money: 10 } }, options: undefined, result: '{name} told {other} a tale.' } as Partial<EventDef>);
    const { ctx, hero, people } = setup([e], 10000);
    ctx.state.circle.push(hero.id);
    hero.money = 0;
    for (let i = 0; i < 300; i++) {
      ctx.state.day += 1;
      narratorPhase.run(ctx);
    }
    expect(hero.money).toBe(0);
    expect(people.reduce((s, p) => s + p.money, 0)).toBeGreaterThan(0);
    expect(ctx.state.narratorStats.npcEvents).toBe(300);
    expect(ctx.state.pendingEvent).toBeNull();
  });

  it('fires nothing without a chance, and spends no randomness then', () => {
    const e = ev('gossip', { who: 'npc' });
    const { ctx } = setup([e], 0);
    const before = [...ctx.state.rng];
    for (let i = 0; i < 20; i++) narratorPhase.run(ctx);
    expect(ctx.state.rng).toEqual(before);
    expect(ctx.state.narratorStats.npcEvents).toBe(0);
  });

  it('skips the hero events, events of the hero bound to an action, and keeps the pace of the hero', () => {
    const only = ev('hero_only', { who: 'hero' });
    const { ctx } = setup([only], 10000);
    narratorPhase.run(ctx);
    expect(ctx.state.narratorStats.npcEvents).toBe(0);
    expect(ctx.state.lastEventDay).toBeNull();
  });

  it('is deterministic and survives saving between days', () => {
    const e = ev('gossip', { who: 'both', result: '{name} gossiped.', chronicle: true } as Partial<EventDef>);
    const run = (): string => {
      const { ctx } = setup([e], 3000, 5);
      for (let i = 0; i < 200; i++) {
        ctx.state.day += 1;
        narratorPhase.run(ctx);
      }
      expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
      return serialize(ctx.state);
    };
    expect(run()).toBe(run());
  });
});

describe('the line of an event of a person of the world (D-166)', () => {
  const quiet = ev('quiet', { who: 'npc', options: [{ text: 'Ok', result: '{name} had a quiet day.' }] } as Partial<EventDef>);
  const loud = ev('loud', { who: 'npc', options: [{ text: 'Ok', result: '{name} made a scene.', chronicle: true }] } as Partial<EventDef>);

  it('is not stored without chronicle: true, and stored in the journal with it', () => {
    const { ctx, people } = setup([quiet, loud]);
    const p = people[0] as Character;
    runNpcEvent(ctx, quiet, p);
    expect(ctx.state.chronicle.filter((e) => e.subject === p.id && e.kind === 'npc_event')).toEqual([]);
    runNpcEvent(ctx, loud, p);
    const stored = lines(ctx, 'npc_event');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ subject: p.id, level: 'journal' });
    expect(entryText(stored[0] as ChronicleEntry)).toContain('made a scene');
    expect(ctx.state.narratorStats).toMatchObject({ npcEvents: 2, npcStored: 1 });
  });

  it('shows on the page of a person the hero knows, not of a stranger, and not other journal lines', () => {
    const { ctx, people } = setup([loud]);
    const [known, stranger] = people as [Character, Character];
    ctx.state.acquaintances.length = 0;
    introduce(ctx, known.id, 'known');
    expect(acquaintanceLevel(ctx.state, ctx.content, ctx.state.playerId, stranger.id)).toBeNull();
    runNpcEvent(ctx, loud, known);
    runNpcEvent(ctx, loud, stranger);
    expect(personPage(ctx, known.id)?.journal.map(entryText)).toEqual([expect.stringContaining('made a scene')]);
    expect(personPage(ctx, stranger.id)?.journal).toEqual([]);
  });

  it('counts events and the share stored in the metrics', () => {
    const { ctx, people } = setup([quiet, loud]);
    ctx.state.day = 365 * 2;
    const p = people[0] as Character;
    runNpcEvent(ctx, quiet, p);
    runNpcEvent(ctx, loud, p);
    runNpcEvent(ctx, loud, p);
    runNpcEvent(ctx, quiet, p);
    const m = computeMetrics(ctx.state);
    expect(m.npcEventsPerYear).toBe(2);
    expect(m.npcStoredShare).toBe(0.5);
    expect(m.events).toBe(0);
  });

  it('counts an event whose outcomes write no line', () => {
    const bare = ev('bare', { who: 'npc', options: [{ text: 'Ok', effects: { money: 1 } }] } as Partial<EventDef>);
    const { ctx, people } = setup([bare]);
    runNpcEvent(ctx, bare, people[0] as Character);
    expect(ctx.state.narratorStats).toMatchObject({ npcEvents: 1, npcStored: 0 });
  });
});

describe('events that do not change the hero (D-174)', () => {
  const both = ev('favour', {
    who: 'both',
    roles: { friend: { pick: 'circle' } },
    options: [
      {
        text: 'Help',
        effects: { money: 5, relation: [{ start: 'friend', with: 'hero' }, { start: 'friend', with: 'friend' }], opinion: [{ toward: 'hero', reason: 'gift' }], introduce: 'known' },
        on: { hero: { money: 50 }, friend: { money: 3 } },
        result: '{name} helped {friend}.',
      },
    ],
  } as Partial<EventDef>);

  it('skips the keys that change the hero when the main participant is a person of the world', () => {
    const { ctx, hero, people } = setup([both]);
    ctx.state.acquaintances.length = 0;
    const p = people[0] as Character;
    hero.money = 0;
    p.money = 0;
    runNpcEvent(ctx, both, p);
    expect(hero.money).toBe(0);
    expect(p.money).toBe(5);
    // the opinion toward the hero is the person's own feeling and stays
    expect(ctx.state.opinionReasons.some((r) => r.holder === p.id && r.target === hero.id && r.reason === 'gift')).toBe(true);
    expect(activeRelationBetween(ctx.state, p.id, hero.id, 'friend')).toBeFalsy();
    expect(acquaintanceLevel(ctx.state, ctx.content, hero.id, p.id)).toBeNull();
  });

  it('applies all of them when the main participant is the hero', () => {
    const { ctx, hero, people } = setup([both]);
    ctx.state.acquaintances.length = 0;
    hero.money = 0;
    const other = people[1] as Character;
    expect(fireEvent(ctx, both, hero)).toBe('waiting');
    apply(ctx.state, ctx.content, { type: 'choose', option: 0 });
    expect(hero.money).toBe(55);
    expect(other).toBeDefined();
  });

  it('skips them inside later, too', () => {
    const e = ev('delayed', {
      who: 'both',
      options: [{ text: 'Ok', effects: { later: [{ after_days: 5, effects: { introduce: 'known', money: 9 } }] }, on: { hero: { money: 1 } }, result: '{name} waited.' }],
    } as Partial<EventDef>);
    const { ctx, people } = setup([e]);
    ctx.state.acquaintances.length = 0;
    const p = people[0] as Character;
    runNpcEvent(ctx, e, p);
    const queued = ctx.state.scheduled.at(-1);
    expect(queued?.effects).toEqual({ money: 9 });
  });
});

describe('side lines follow the line of the event (D-176)', () => {
  const grow = ev('growing', {
    who: 'both',
    options: [{ text: 'Ok', effects: { traits: { add: ['proud'] } }, result: '{name} swaggered.', chronicle: true, next: 'later_page' }],
    pages: { later_page: { text: 'Then...', options: [{ text: 'Ok', result: '{name} swaggered on.' }] } },
  } as Partial<EventDef>);

  it('writes the change of a trait after the line of the event, and keeps it across a save', () => {
    const { ctx, hero } = setup([grow]);
    hero.traits = [];
    fireEvent(ctx, grow, hero);
    const before = ctx.state.chronicle.length;
    apply(ctx.state, ctx.content, { type: 'choose', option: 0 });
    // the first page is over: the side line waits in the event, the chronicle is untouched
    expect(ctx.state.chronicle.length).toBe(before);
    expect(ctx.state.pendingEvent?.after).toHaveLength(1);
    const loaded = deserialize(serialize(ctx.state), ctx.content);
    expect(loaded.pendingEvent?.after).toEqual(ctx.state.pendingEvent?.after);
    apply(ctx.state, ctx.content, { type: 'choose', option: 0 });
    const tail = ctx.state.chronicle.slice(before).map((e) => e.kind);
    expect(tail).toEqual(['event', 'trait_change']);
    expect(ctx.state.pendingEvent).toBeNull();
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
  });

  it('writes the side lines as usual when the line of the event is not stored', () => {
    const e = ev('silent', { who: 'npc', options: [{ text: 'Ok', effects: { traits: { add: ['proud'] } }, result: '{name} swaggered.' }] } as Partial<EventDef>);
    const { ctx, people } = setup([e]);
    const p = people[0] as Character;
    p.traits = [];
    const before = ctx.state.chronicle.length;
    runNpcEvent(ctx, e, p);
    expect(ctx.state.chronicle.slice(before).map((x) => x.kind)).toEqual(['trait_change']);
  });
});
