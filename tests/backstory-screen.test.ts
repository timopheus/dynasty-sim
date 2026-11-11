import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { newGame } from '../src/core/game';
import { checkInvariants } from '../src/core/invariants';
import { seedRng } from '../src/core/rng';
import { allChronicle } from '../src/core/archive/archive';
import { applyRecorded, newJournal, replay } from '../src/core/save/journal';
import type { GameState } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { backstoryDate, backstoryFrame, backstoryHead, backstoryRuns, BACKSTORY_CHUNK_DAYS, BACKSTORY_FRAME_MS } from '../src/ui/backstory-clock-model';
import { setLang } from '../src/ui/i18n';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

/** The screen of the early years on one clock (D-479, T.5): its head and its frames, on the clock fixture. */
const loaded: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/backstory-clock'),
]);
const content: Content = { ...loaded, health: { ...loaded.health, mortality: [{ per100k: 0, cause: 'illness' }] } };

/** Plays like the screen: frames while time runs, the first answer of the bot at a scene. Reports the heads seen. */
function play(seed: number, chunk: number): { state: GameState; heads: string[]; frames: number; journal: ReturnType<typeof newJournal> } {
  const state = newGame(seed, content);
  const journal = newJournal(seed, 'v');
  const bot = seedRng(seed, 99);
  const heads: string[] = [];
  let frames = 0;
  for (let guard = 0; state.backstory.running && guard < 20000; guard++) {
    const d = backstoryDate(state);
    heads.push(`${d.year}/${d.age}`);
    if (backstoryRuns(state, content)) {
      backstoryFrame(journal, state, content, chunk);
      frames++;
    } else applyRecorded(journal, state, content, botCommand(state, content, bot));
  }
  return { state, heads, frames, journal };
}

describe('the screen of the early years on one clock (T.5)', () => {
  it('heads the screen with the real date of the world and the age of the hero', () => {
    setLang('en');
    expect(backstoryHead(1707, 7)).toBe('1707 · you are 7');
    setLang('ru');
    expect(backstoryHead(1707, 7)).toBe('1707 · тебе 7 лет');
    expect(backstoryHead(1711, 11)).toBe('1711 · тебе 11 лет');
    expect(backstoryHead(1701, 1)).toBe('1701 · тебе 1 год');
    expect(backstoryHead(1703, 3)).toBe('1703 · тебе 3 года');
    setLang('en');
  });

  it('shows 1700 and age 0 at birth, and a year and an age that agree at every scene', () => {
    const state = newGame(3, content);
    expect(backstoryDate(state)).toEqual({ year: 1700, age: 0 });
    const { state: end, heads } = play(3, BACKSTORY_CHUNK_DAYS);
    for (const h of heads) {
      const [year, age] = h.split('/').map(Number);
      expect(age).toBeGreaterThanOrEqual(year! - 1700 - 1);
      expect(age).toBeLessThanOrEqual(year! - 1700);
    }
    expect(end.backstory.running).toBe(false);
    expect(backstoryDate(end).age).toBeGreaterThanOrEqual(15);
  });

  it('runs the years in frames of about thirty days, each short enough not to hang', () => {
    expect(BACKSTORY_CHUNK_DAYS).toBe(30);
    expect(BACKSTORY_FRAME_MS * (365 / BACKSTORY_CHUNK_DAYS)).toBeLessThanOrEqual(1000);
    expect(BACKSTORY_FRAME_MS * (365 / BACKSTORY_CHUNK_DAYS)).toBeGreaterThanOrEqual(300);
    const state = newGame(2, content);
    const journal = newJournal(2, 'v');
    applyRecorded(journal, state, content, botCommand(state, content, seedRng(2, 99)));
    // a frame stops at the scene: it may be shorter, never longer, than the chunk (a day may overshoot by an action's end)
    for (let i = 0; i < 400 && backstoryRuns(state, content); i++) {
      const { passed } = backstoryFrame(journal, state, content);
      expect(passed).toBeLessThanOrEqual(BACKSTORY_CHUNK_DAYS);
    }
    expect(state.status === 'awaiting_choice' || state.pendingEvent !== null || state.backstory.running === false).toBe(true);
  });

  it.each([1, 2, 3, 4, 5])('seed %i: a frame of 30 days and a frame of 1 day make the same game, and it replays', (seed) => {
    const a = play(seed, 30);
    const b = play(seed, 1);
    expect(a.state).toEqual(b.state);
    expect(allChronicle(a.state)).toEqual(allChronicle(b.state));
    expect(a.frames).toBeLessThan(b.frames);
    expect(checkInvariants(a.state, content)).toEqual([]);
    const again = replay(content, a.journal);
    expect(again).toEqual(a.state);
  });

  // T.4: the old way (scenes at once, no frames) is gone; the real content runs on the clock
  it('runs the real content on the clock: frames run the years until the first scene', () => {
    const real = realContent();
    expect(real.backstory?.fromBirth).toBe(true);
    const state = newGame(5, real);
    expect(state.pendingEvent !== null || backstoryRuns(state, real)).toBe(true);
  });
});
