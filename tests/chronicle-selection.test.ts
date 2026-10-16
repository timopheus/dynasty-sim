import { describe, expect, it } from 'vitest';
import { log } from '../src/core/chronicle/log';
import { chronicleMarkdown, journalMarkdown } from '../src/core/chronicle/markdown';
import type { Content } from '../src/core/content/schema';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import type { Ctx, GameState } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, fixtureContent, loadOrThrow } from './fixtures/content';

const base = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/chronicle')]);

function withMoney(actionMoney: number, optionMoney: number, mark = false): Content {
  return {
    ...base,
    settings: { ...base.settings, eventChancePer10k: 10000, minDaysBetweenEvents: 1000 },
    actions: [{ id: 'wait', name: 'Wait', duration: { min: 30, max: 30 }, effects: { money: actionMoney }, text: '{name} waited.' }],
    events: [
      {
        id: 'ping',
        weight: 1,
        text: 'Ping.',
        options: [{ text: 'Ok', result: '{name} answered.', effects: { money: optionMoney }, ...(mark ? { mark: true } : {}) }],
      },
    ],
  };
}

/** Plays one action with the event it brings; returns the "event" and "action" entries. */
function playOnce(content: Content) {
  const state = newGame(1, content);
  apply(state, content, { type: 'start', actionId: 'wait' });
  apply(state, content, { type: 'choose', option: 0 });
  return { state, event: state.chronicle.find((e) => e.kind === 'event'), action: state.chronicle.find((e) => e.kind === 'action') };
}

function addCircle(state: GameState, content: Content): { ctx: Ctx; near: ReturnType<typeof createCharacter>; far: ReturnType<typeof createCharacter> } {
  const ctx: Ctx = { state, content };
  const near = createCharacter(ctx, { surname: 'Near', age: { min: 30, max: 30 } });
  const far = createCharacter(ctx, { surname: 'Far', age: { min: 30, max: 30 } });
  state.circle.push(near.id);
  return { ctx, near, far };
}

describe('chronicle selection (D-019, D-130)', () => {
  it('passes the money change of the action end and of the chosen option to log', () => {
    // Hero has 10 crowns. 25 is at least 20 and at least 50% of the 10 before: a big sum.
    const big = playOnce(withMoney(25, 25));
    expect(big.action?.level).toBe('chronicle');
    expect(big.event?.level).toBe('chronicle');
    // 5 is under the minimum of 20: everyday, however small the purse.
    const small = playOnce(withMoney(5, 5));
    expect(small.action?.level).toBe('journal');
    expect(small.event?.level).toBe('journal');
    // Losses count too; the event is judged by its own change, not by the action's.
    const mixed = playOnce(withMoney(1, -25));
    expect(mixed.action?.level).toBe('journal');
    expect(mixed.event?.level).toBe('chronicle');
  });

  it('judges a sum against the money the hero had before it', () => {
    const content = withMoney(25, 0);
    const state = newGame(1, content);
    getPlayer(state).money = 1000; // 25 crowns is 2.5% of 1000 before the change
    apply(state, content, { type: 'start', actionId: 'wait' });
    apply(state, content, { type: 'choose', option: 0 });
    expect(state.chronicle.find((e) => e.kind === 'action')?.level).toBe('journal');
  });

  it('keeps ended actions in the journal as kind "action" for the metrics', () => {
    const { state } = playOnce(withMoney(1, 1));
    expect(state.chronicle.filter((e) => e.kind === 'action')).toHaveLength(1);
  });

  it('marks a chosen option with ▸ and keeps it in the chronicle', () => {
    const { state, event } = playOnce(withMoney(1, 1, true));
    expect(event?.level).toBe('chronicle');
    expect(event?.mark).toBe(true);
    expect(chronicleMarkdown(state)).toMatch(/answered\. ▸\n/);
  });

  it('does not store lines about people far away, keeps the circle in the journal', () => {
    const content = base;
    const state = newGame(1, content);
    const { ctx, near, far } = addCircle(state, content);
    const before = state.chronicle.length;
    expect(log(ctx, { subject: far, kind: 'health', level: 'chronicle', template: '{name} is ill.' })).toBeNull();
    expect(state.chronicle).toHaveLength(before);
    expect(log(ctx, { subject: near, kind: 'health', level: 'chronicle', template: '{name} is ill.' })?.level).toBe('journal');
  });

  it('writes the death of a circle member before it leaves the circle, to the chronicle only if famous', () => {
    const content = base;
    const state = newGame(1, content);
    const { ctx, near } = addCircle(state, content);
    const famous = createCharacter(ctx, { surname: 'Famous', age: { min: 40, max: 40 } });
    state.circle.push(famous.id);
    famous.fame = 2;
    kill(ctx, near, 'old_age');
    kill(ctx, famous, 'old_age');
    const deaths = state.chronicle.filter((e) => e.kind === 'death');
    expect(deaths.map((e) => [e.subject, e.level])).toEqual([
      [near.id, 'journal'],
      [famous.id, 'chronicle'],
    ]);
    expect(chronicleMarkdown(state)).toMatch(/- ◆ \*\*Jan\*\* — .*Famous/);
  });

  it('writes a repeated severe health line within the window to the journal', () => {
    const content = base;
    const state = newGame(1, content);
    const ctx: Ctx = { state, content };
    const hero = getPlayer(state);
    const line = { subject: hero, kind: 'health', level: 'chronicle' as const, template: 'Fever took hold of {name}.' };
    expect(log(ctx, line)?.level).toBe('chronicle');
    state.day += 50;
    expect(log(ctx, line)?.level).toBe('journal');
    state.day += 200;
    expect(log(ctx, line)?.level).toBe('chronicle');
  });

  it('keeps the author level when the content has no chronicle key', () => {
    const content = fixtureContent();
    expect(content.chronicle).toBeNull();
    const state = newGame(1, content);
    const { ctx, far } = addCircle(state, content);
    expect(log(ctx, { subject: far, kind: 'health', level: 'chronicle', template: '{name} is ill.' })?.level).toBe('chronicle');
  });

  it('gives two runs of one seed the same chronicle', () => {
    const run = () => {
      const content = withMoney(25, 25);
      const state = newGame(7, content);
      for (let i = 0; i < 5; i++) {
        apply(state, content, { type: 'start', actionId: 'wait' });
        while (state.status === 'awaiting_choice') apply(state, content, { type: 'choose', option: 0 });
      }
      return JSON.stringify(state.chronicle);
    };
    expect(run()).toBe(run());
  });
});

describe('chronicle markdown', () => {
  it('has sections only for heads of the house, with year · age and links to other heads', () => {
    const content = base;
    const state = newGame(1, content);
    const { ctx, near } = addCircle(state, content);
    log(ctx, { subject: near, kind: 'health', level: 'chronicle', template: '{name} limps.' });
    const first = getPlayer(state);
    kill(ctx, first, 'old_age');
    const heir = getPlayer(state);
    expect(heir.id).not.toBe(first.id);
    state.chronicle.push({ day: state.day, subject: heir.id, kind: 'test', level: 'chronicle', parts: ['Heir of ', { id: first.id, name: 'Anne Fixture' }, '.'] });
    const md = chronicleMarkdown(state);
    expect(md).toContain('Heir of [Anne Fixture](#c1).');
    expect(md.match(/^## /gm)).toHaveLength(2);
    expect(md).toMatch(/^### 1700 · 20$/m);
    expect(md).not.toMatch(/Near/);
    expect(md).toMatch(/<a id="c1"><\/a>\n## Anne Fixture \(1679–1700\)/);
    // The journal keeps the circle member's line, with a day.
    expect(journalMarkdown(state)).toMatch(/- \*\*1 January\*\* — .*limps/);
  });
});
