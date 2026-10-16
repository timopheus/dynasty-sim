import { describe, expect, it } from 'vitest';
import { botCommand, BOT_CHARACTERS } from '../src/core/bot';
import { BOT_STREAMS } from '../src/core/bots/characters';
import { allVariants, deadVariants, dominant, median, type CharacterRow } from '../src/core/bots/report';
import { chronicleMarkdown } from '../src/core/chronicle/markdown';
import type { Content } from '../src/core/content/schema';
import { findEvent, fireEvent } from '../src/core/events/events';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { seedRng } from '../src/core/rng';
import { runSim } from '../src/core/sim';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const EVENTS = `
events:
  - id: fork
    weight: 1
    followup_only: true
    severity: heavy
    text: "A fork for {name}."
    options:
      - text: Deadly gamble
        check: { stat: prowess, difficulty: 5 }
        success: { effects: { money: 500 }, result: "{name} gambled and won." }
        failure: { effects: { kill: killed_in_duel }, result: "{name} gambled and died." }
      - text: Safe walk
        result: "{name} walked."
      - text: Locked
        when: { money_min: 999999 }
        effects: { money: 9000 }
        result: "{name} got rich."
  - id: pay
    weight: 1
    followup_only: true
    text: "Pay day for {name}."
    options:
      - text: Small
        effects: { money: 10 }
        result: "{name} earned 10."
      - text: Big
        effects: { money: 80 }
        result: "{name} earned 80."
      - text: Nothing
        result: "{name} earned nothing."
  - id: duel_offer
    weight: 1
    followup_only: true
    text: "An insult to {name}."
    options:
      - text: Swallow it
        result: "{name} swallowed it."
      - text: Challenge
        check: { stat: prowess, difficulty: 5 }
        success: { result: "{name} won the duel.", mood: threat }
        failure: { effects: { wound: scratch }, result: "{name} lost the duel.", mood: threat }
  - id: risky
    weight: 1
    followup_only: true
    severity: heavy
    text: "A bet for {name}."
    options:
      - text: Sure thing
        effects: { money: 5 }
        result: "{name} won a little."
      - text: Long shot
        check: { stat: prowess, difficulty: 30 }
        success: { effects: { money: 60 }, result: "{name} won big." }
        failure: { effects: { kill: killed_in_duel }, result: "{name} lost everything." }
`;

const content: Content = loadOrThrow([...BASE_FILES, { path: 'tests/bots-events.yaml', text: EVENTS }]);

function pending(id: string, seed = 1) {
  const state = newGame(seed, content);
  const ctx = { state, content };
  fireEvent(ctx, findEvent(content, id), getPlayer(state));
  return state;
}

describe('bot characters (D-247, D-319)', () => {
  it('lists four characters, each with a stream of its own', () => {
    expect([...BOT_CHARACTERS]).toEqual(['random', 'cautious', 'greedy', 'duelist']);
    expect(new Set(Object.values(BOT_STREAMS)).size).toBe(4);
    expect(BOT_STREAMS.random).toBe(1); // the stream the random bot always had
  });

  it('cautious does not choose a death risk while a safe option is open', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = pending('fork', seed);
      expect(botCommand(state, content, seedRng(seed, 11), 'cautious')).toEqual({ type: 'choose', option: 1 });
    }
    const state = pending('risky');
    expect(botCommand(state, content, seedRng(1, 11), 'cautious')).toEqual({ type: 'choose', option: 0 });
  });

  it('greedy takes the bigger money', () => {
    const state = pending('pay');
    expect(botCommand(state, content, seedRng(1, 12), 'greedy')).toEqual({ type: 'choose', option: 1 });
    // ... even over a sure death, if the money is bigger
    const gamble = pending('fork');
    expect(botCommand(gamble, content, seedRng(1, 12), 'greedy')).toEqual({ type: 'choose', option: 0 });
  });

  it('duelist takes the challenge, not the swallowed insult', () => {
    const state = pending('duel_offer');
    expect(botCommand(state, content, seedRng(1, 13), 'duelist')).toEqual({ type: 'choose', option: 1 });
  });

  it('never chooses an unavailable option', () => {
    for (const character of BOT_CHARACTERS) {
      const state = pending('fork');
      for (let i = 0; i < 50; i++) {
        const cmd = botCommand(state, content, seedRng(i, 99), character);
        expect(cmd).not.toEqual({ type: 'choose', option: 2 });
      }
    }
  });

  it('chooses the same under the same generator and consumes only its own', () => {
    for (const character of BOT_CHARACTERS) {
      const state = pending('pay');
      const before = [...state.rng];
      const a = botCommand(state, content, seedRng(3, 5), character);
      const b = botCommand(state, content, seedRng(3, 5), character);
      expect(a).toEqual(b);
      expect(state.rng).toEqual(before);
    }
  });

  it('starts an action in the money-per-day order for greedy', () => {
    const state = newGame(1, content);
    const cmd = botCommand(state, content, seedRng(1, 12), 'greedy');
    expect(cmd.type).toBe('start');
  });

  it('does not change the world stream: the bot never touches the state generator', () => {
    for (const character of BOT_CHARACTERS) {
      const state = newGame(7, content);
      const before = [...state.rng];
      botCommand(state, content, seedRng(7, BOT_STREAMS[character]), character);
      expect(state.rng, character).toEqual(before);
    }
  });

  it('plays 30 years of every character without invariant violations; random keeps the old chronicle stream', () => {
    const real = realContent();
    for (const bot of BOT_CHARACTERS) {
      const r = runSim(real, { seed: 3, years: 30, bot });
      expect(r.violations, bot).toEqual([]);
      expect(Object.keys(r.choices).length).toBeGreaterThan(0);
    }
    const a = runSim(real, { seed: 3, years: 30 });
    const b = runSim(real, { seed: 3, years: 30, bot: 'random' });
    expect(chronicleMarkdown(a.state)).toBe(chronicleMarkdown(b.state));
    const c = runSim(real, { seed: 3, years: 30, bot: 'duelist' });
    expect(chronicleMarkdown(c.state)).not.toBe(chronicleMarkdown(a.state));
  }, 120_000);
});

describe('bot report (D-319)', () => {
  const row = (character: CharacterRow['character'], money: number, age: number, ended: number): CharacterRow => ({
    character, runs: 10, moneyAtDeath: money, ageAtDeath: age, linesPerLife: 30, endedPercent: ended,
  });

  it('takes the median of numbers', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('names the dominant character only when it is best at everything', () => {
    expect(dominant([row('random', 10, 40, 20), row('cautious', 30, 50, 0), row('greedy', 20, 45, 10), row('duelist', 5, 30, 40)])).toBe('cautious');
    expect(dominant([row('random', 10, 40, 20), row('cautious', 30, 35, 0), row('greedy', 20, 45, 10), row('duelist', 5, 30, 40)])).toBeNull();
    expect(dominant([row('random', 10, 40, 20), row('cautious', 10, 40, 20)])).toBeNull();
  });

  it('lists the variants nobody chose', () => {
    const all = allVariants(content);
    expect(all).toContain('fork/-/0');
    expect(all).toContain('action/rest');
    const chosen = Object.fromEntries(all.filter((v) => v !== 'fork/-/2').map((v) => [v, 1]));
    expect(deadVariants(content, [chosen])).toEqual(['fork/-/2']);
  });
});
