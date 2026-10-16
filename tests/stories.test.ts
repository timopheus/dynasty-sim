import { describe, expect, it } from 'vitest';
import { entryText } from '../src/core/chronicle/log';
import { loadContent } from '../src/core/content/load';
import type { Content } from '../src/core/content/schema';
import { eventWeight, findEvent, fireEvent } from '../src/core/events/events';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { narratorPhase } from '../src/core/narrator/phases';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx } from '../src/core/state';
import { storiesPhase } from '../src/core/stories/phases';
import { dueEvents, isStoryOpen, storyGiven, STORY_WEIGHT_MAX, STORY_WEIGHT_MIN, storyWeight } from '../src/core/stories/stories';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

const STORY_FILES = readContentFiles('tests/fixtures/stories');
// Population and opinions make a circle valid; the stories fixture adds the events.
const WORLD_FILES = [...readContentFiles('tests/fixtures/population'), ...readContentFiles('tests/fixtures/opinions')];
const content: Content = loadOrThrow([...BASE_FILES, ...WORLD_FILES, ...STORY_FILES]);

/** A new game on day 0 with a circle of `n` people; no action yet. The base pace never rolls the deck. */
function game(n = 2, c: Content = content): { ctx: Ctx; hero: Character; people: Character[] } {
  const state = newGame(1, c);
  const ctx = { state, content: c };
  const people = Array.from({ length: n }, () => {
    const p = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
    p.occupation = 'porter';
    state.circle.push(p.id);
    return p;
  });
  return { ctx, hero: getPlayer(state), people };
}

/** Fires the event for the hero and answers its first option. */
function answer(ctx: Ctx, id: string, option = 0): void {
  expect(fireEvent(ctx, findEvent(ctx.content, id), getPlayer(ctx.state))).toBe('waiting');
  apply(ctx.state, ctx.content, { type: 'choose', option });
}

const texts = (ctx: Ctx) => ctx.state.chronicle.map((e) => entryText(e));

describe('follow-ups', () => {
  it('a challenge brings the duel in N days with the same rival', () => {
    const { ctx } = game(3);
    answer(ctx, 'challenge');
    const rival = ctx.state.followups[0]?.given.rival;
    expect(ctx.state.followups).toMatchObject([{ eventId: 'duel', dueDay: 5, given: { rival } }]);
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(ctx.state.day).toBe(5);
    expect(ctx.state.pendingEvent).toMatchObject({ eventId: 'duel', scope: { rival } });
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
    apply(ctx.state, ctx.content, { type: 'choose', option: 0 });
    expect(ctx.state.followups).toEqual([]);
    expect(texts(ctx).some((t) => t.includes('fought a duel with'))).toBe(true);
  });

  it('puts a ▸ on the choice that schedules', () => {
    const { ctx } = game();
    answer(ctx, 'challenge');
    expect(ctx.state.chronicle.at(-1)).toMatchObject({ kind: 'event', level: 'chronicle', mark: true });
    const refused = game();
    answer(refused.ctx, 'challenge', 1);
    expect(refused.ctx.state.chronicle.at(-1)?.mark).toBeUndefined();
  });

  it('the rival died: no duel, a journal line instead', () => {
    const { ctx } = game(1);
    answer(ctx, 'challenge');
    const rival = ctx.state.characters.find((c) => c.id === ctx.state.followups[0]?.given.rival)!;
    kill(ctx, rival, 'fever');
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(ctx.state.status).toBe('awaiting_action');
    expect(ctx.state.followups).toEqual([]);
    const line = ctx.state.chronicle.find((e) => e.kind === 'followup_cancelled');
    expect(line?.level).toBe('journal');
    expect(entryText(line!)).toMatch(/business with .* came to nothing/);
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
  });

  it('death of the main participant cancels the follow-up', () => {
    const { ctx, hero } = game();
    answer(ctx, 'challenge');
    kill(ctx, hero, 'fever');
    expect(ctx.state.followups).toEqual([]);
  });

  it('goes to the role named protagonist', () => {
    const { ctx, hero } = game();
    answer(ctx, 'slow_accusation', 1);
    expect(ctx.state.followups).toMatchObject([{ eventId: 'errand', protagonist: hero.id, dueDay: 2, given: {} }]);
    const money = hero.money;
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(hero.money).toBe(money + 2 + 1);
  });

  it('is handed over again the next day if the narrator could not start it, and only once a day per event', () => {
    const { ctx, people } = game(2);
    ctx.state.activeAction = { actionId: 'wait', endDay: 100 };
    const hero = getPlayer(ctx.state);
    for (const p of people) ctx.state.followups.push({ eventId: 'duel', protagonist: hero.id, given: { rival: p.id }, dueDay: 0, offered: null });
    storiesPhase.run(ctx);
    expect(dueEvents(ctx)).toEqual([{ eventId: 'duel', protagonist: hero.id, given: { rival: people[0]!.id } }]);
    expect(narratorPhase.run(ctx)).toBe(true);
    apply(ctx.state, ctx.content, { type: 'choose', option: 0 });
    // The next day the first one is gone and the second one is due.
    expect(ctx.state.pendingEvent).toMatchObject({ eventId: 'duel', scope: { rival: people[1]!.id } });
    expect(ctx.state.day).toBe(1);
  });

  it('a save between the challenge and the duel goes on with the same story', () => {
    const { ctx } = game(3);
    answer(ctx, 'challenge');
    const loaded = deserialize(serialize(ctx.state), content);
    apply(ctx.state, content, { type: 'start', actionId: 'wait' });
    apply(loaded, content, { type: 'start', actionId: 'wait' });
    expect(loaded.pendingEvent).toEqual(ctx.state.pendingEvent);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    apply(loaded, content, { type: 'choose', option: 0 });
    expect(serialize(loaded)).toBe(serialize(ctx.state));
  });
});

describe('stories', () => {
  it('opens the story of the main participant; its weight grows to the deadline', () => {
    const { ctx, hero } = game();
    expect(storyWeight(ctx, 'feud', hero.id)).toBe(0);
    answer(ctx, 'accusation');
    expect(isStoryOpen(ctx.state, hero.id, 'feud')).toBe(true);
    expect(Object.keys(storyGiven(ctx.state, hero.id, 'feud'))).toEqual(['accuser']);
    expect(ctx.state.chronicle.at(-1)?.mark).toBe(true);
    expect(storyWeight(ctx, 'feud', hero.id)).toBe(STORY_WEIGHT_MIN);
    ctx.state.day = 15;
    expect(storyWeight(ctx, 'feud', hero.id)).toBeGreaterThan(STORY_WEIGHT_MIN);
    ctx.state.day = 30;
    expect(storyWeight(ctx, 'feud', hero.id)).toBe(STORY_WEIGHT_MAX);
  });

  it('an event of the story closes it', () => {
    const { ctx, hero } = game();
    answer(ctx, 'accusation');
    const pace = { ...ctx.content.narrator!, eventChancePer10k: 10000 };
    const c = { ...ctx.content, narrator: pace };
    const run = { state: ctx.state, content: c };
    ctx.state.activeAction = { actionId: 'wait', endDay: 100 };
    ctx.state.day = 3;
    const accuser = storyGiven(ctx.state, hero.id, 'feud').accuser;
    expect(narratorPhase.run(run)).toBe(true);
    expect(ctx.state.pendingEvent?.eventId).toBe('feud_settled');
    // The story event from the deck comes with the people of the story (D-178).
    expect(ctx.state.pendingEvent?.scope.accuser).toBe(accuser);
    apply(ctx.state, c, { type: 'choose', option: 0 });
    expect(isStoryOpen(ctx.state, hero.id, 'feud')).toBe(false);
    expect(storyWeight(run, 'feud', hero.id)).toBe(0);
  });

  it('a story event from the deck weighs nothing once its person of the story is gone (D-178)', () => {
    const { ctx, hero } = game();
    answer(ctx, 'accusation');
    const settled = findEvent(ctx.content, 'feud_settled');
    const given = storyGiven(ctx.state, hero.id, 'feud');
    expect(eventWeight(ctx, settled, hero, given)).toBeGreaterThan(0);
    expect(eventWeight(ctx, settled, hero)).toBe(0); // without the people of the story the role cannot be filled
    kill(ctx, ctx.state.characters.find((p) => p.id === given.accuser)!, 'old_age');
    expect(eventWeight(ctx, settled, hero, given)).toBe(0);
  });

  it('an event of the story on the day it opens (inside later) closes it too', () => {
    const { ctx, hero } = game();
    answer(ctx, 'slow_accusation');
    // Every day rolls an event, but the deck holds nothing else: the story event falls the day the story opens.
    const events = ctx.content.events.filter((e) => e.id !== 'ping');
    const c = { ...ctx.content, events, narrator: { ...ctx.content.narrator!, eventChancePer10k: 10000, eventRepeatCooldownDays: 1000 } };
    apply(ctx.state, c, { type: 'start', actionId: 'wait' });
    expect(ctx.state.day).toBe(3);
    expect(ctx.state.pendingEvent?.eventId).toBe('feud_settled');
    apply(ctx.state, c, { type: 'choose', option: 0 });
    expect(isStoryOpen(ctx.state, hero.id, 'feud')).toBe(false);
    for (let i = 0; i < 3 && ctx.state.day < 40; i++) {
      if (ctx.state.status === 'awaiting_choice') apply(ctx.state, c, { type: 'choose', option: 0 });
      else apply(ctx.state, c, { type: 'start', actionId: 'wait' });
    }
    expect(texts({ ...ctx, content: c }).some((t) => t.includes('forgot the quarrel'))).toBe(false);
  });

  it('at the deadline the first fallback that fits ends it', () => {
    const { ctx, hero } = game();
    answer(ctx, 'accusation');
    const accuser = ctx.state.openStories[0]!.given.accuser;
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(isStoryOpen(ctx.state, hero.id, 'feud')).toBe(false);
    // feud_fades needs a fortune; feud_forgotten is a quiet notice with the same accuser.
    const line = ctx.state.chronicle.find((e) => entryText(e).includes('forgot the quarrel'));
    // Day 30 ends the first wait: nothing fires on the last day of an action, so the fallback comes the next day.
    expect(line).toMatchObject({ day: 31, level: 'journal' });
    expect(line?.parts).toContainEqual(expect.objectContaining({ id: accuser }));
    expect(ctx.state.lastFired.feud_forgotten).toBe(31);
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
  });

  it('closes quietly when no fallback fits', () => {
    const { ctx, hero } = game(1);
    answer(ctx, 'accusation');
    kill(ctx, ctx.state.characters.find((c) => c.id === ctx.state.openStories[0]!.given.accuser)!, 'fever');
    const before = ctx.state.chronicle.length;
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(isStoryOpen(ctx.state, hero.id, 'feud')).toBe(false);
    expect(ctx.state.chronicle.slice(before).some((e) => /quarrel|peace/.test(entryText(e)))).toBe(false);
    expect(ctx.state.lastFired).not.toHaveProperty('feud_forgotten');
  });

  it('the hero dies: the hero’s stories close', () => {
    const { ctx, hero } = game();
    answer(ctx, 'accusation');
    kill(ctx, hero, 'fever');
    expect(ctx.state.openStories).toEqual([]);
  });
});

describe('a person of the world (3.9)', () => {
  it('an event of a person of the world schedules a follow-up: it comes with the same people and never waits for the player', () => {
    const { ctx, hero } = game(3);
    const roll = { ...ctx.content, narrator: { ...ctx.content.narrator!, npcChancePer10k: 10000 } };
    narratorPhase.run({ state: ctx.state, content: roll });
    const f = ctx.state.followups[0]!;
    expect(f).toMatchObject({ eventId: 'npc_revenge', dueDay: 3 });
    expect(f.protagonist).not.toBe(hero.id);
    expect(f.given.offender).not.toBe(f.protagonist);
    const [actor, offender] = [f.protagonist, f.given.offender!].map((id) => ctx.state.characters.find((c) => c.id === id)!);
    const money = [actor!.money, offender!.money];
    apply(ctx.state, ctx.content, { type: 'start', actionId: 'wait' });
    expect(ctx.state.status).toBe('awaiting_action');
    expect(ctx.state.followups).toEqual([]);
    expect([actor!.money, offender!.money]).toEqual([money[0]! + 7, money[1]! - 7]);
    const line = ctx.state.chronicle.find((e) => e.kind === 'npc_event');
    expect(line).toMatchObject({ day: 3, subject: actor!.id });
    expect(entryText(line!)).toContain('took revenge on');
    expect(checkInvariants(ctx.state, ctx.content)).toEqual([]);
  });
});

describe('the deck', () => {
  it('never gives a follow-up, nor a story event while the story is not open', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { ctx } = game(2);
      const c = { ...ctx.content, narrator: { ...ctx.content.narrator!, eventChancePer10k: 10000 } };
      ctx.state.rng = newGame(seed, c).rng;
      ctx.state.activeAction = { actionId: 'wait', endDay: 100 };
      ctx.state.day = 3;
      narratorPhase.run({ state: ctx.state, content: c });
      expect(['ping', undefined]).toContain(ctx.state.pendingEvent?.eventId);
    }
  });
});

describe('check of the content', () => {
  const errors = (yaml: string) => {
    const result = loadContent([...BASE_FILES, ...WORLD_FILES, ...STORY_FILES, { path: 'fixture/extra.yaml', text: yaml }]);
    return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
  };

  it('wants the given roles of a follow-up handed over, and only those', () => {
    const yaml = `events:
  - id: bad
    weight: 1
    roles: { foe: { pick: circle } }
    text: "x"
    options:
      - text: y
        effects: { schedule: [{ event: duel, after_days: { min: 1, max: 1 }, roles: { enemy: foe } }] }
        result: "{name} did."
`;
    expect(errors(yaml)).toEqual([
      'events[0].options[0].effects.schedule[0].roles.enemy: event "duel" has no role "enemy" with pick: given',
      'events[0].options[0].effects.schedule[0]: role "rival" of event "duel" is not handed over',
    ]);
  });

  it('wants a story event to be opened by some effect, and roles named to exist', () => {
    const yaml = `events:
  - id: lonely
    weight: 1
    story: nobody_opens
    text: "x"
    options:
      - text: y
        effects: { schedule: [{ event: duel, after_days: { min: 1, max: 1 }, roles: { rival: ghost } }] }
        result: "{name} did."
`;
    expect(errors(yaml)).toEqual(
      expect.arrayContaining(['events[0].story: no effect opens story "nobody_opens"', expect.stringMatching(/unknown role "ghost"/)]),
    );
  });
});
