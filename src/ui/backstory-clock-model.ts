import type { Content } from '../core/content/schema';
import { timeRuns } from '../core/game';
import type { GameState } from '../core/state';
import type { Journal } from '../core/save/journal';
import { toYmd, ageYears } from '../core/time/calendar';
import { getPlayer } from '../core/helpers';
import { tick } from './clock-model';
import { currentLang, ruPlural, tr } from './i18n';

/**
 * The backstory on one clock (D-479, T.5): between the scenes the screen feeds the game time itself, a chunk of days
 * a frame, so the years run by on the screen. The speeds and the pause of the game's clock are not used here.
 */

/** Days handed to the game in one frame: about twelve frames a year. */
export const BACKSTORY_CHUNK_DAYS = 30;

/** Days of one frame with the test flag `?fastyears=1` (T.4): a whole year, so the browser tests that do not look at the childhood fit the CI limit. */
export const BACKSTORY_FAST_DAYS = 365;

/** Milliseconds between two frames: a year of the childhood runs by in about 0.7 s. */
export const BACKSTORY_FRAME_MS = 60;

/** Days run since the last save, at which the backstory saves on its own (rarer than the game's clock, which saves every 30 days, D-439: a frame is already 30 days; accepted by the lead). */
export const BACKSTORY_SAVE_EVERY_DAYS = 360;

/** The backstory is on the clock and no scene waits: the next frame hands time to the game. */
export function backstoryRuns(state: GameState, content: Content): boolean {
  return state.backstory.running && content.backstory?.fromBirth === true && timeRuns(state);
}

/** The line over the scene: the year of the world and the age of the hero, "1707" and 7. */
export interface BackstoryDate {
  year: number;
  age: number;
}

export function backstoryDate(state: GameState): BackstoryDate {
  const hero = getPlayer(state);
  return { year: toYmd(state.day).year, age: ageYears(hero.birthDay, state.day) };
}

/**
 * One frame: up to `days` days of the clock (the idle `early_years` start again by themselves), stopping at the first
 * decision. Returns the days that passed and whether the clock stopped (a scene is waiting, or the game ended).
 * The same game as one `wait` of as many days: only the journal's cut into commands is different.
 */
export function backstoryFrame(journal: Journal, state: GameState, content: Content, days = BACKSTORY_CHUNK_DAYS): { passed: number; stopped: boolean } {
  const start = state.day;
  let stopped = false;
  while (state.day - start < days && !stopped) stopped = tick(journal, state, content);
  return { passed: state.day - start, stopped };
}


/** "1707 · you are 7" / "1707 · тебе 7 лет". */
export function backstoryHead(year: number, age: number): string {
  const years = currentLang() === 'ru' ? `${age} ${ruPlural(age, 'год', 'года', 'лет')}` : String(age);
  return tr('{year} · you are {years}', { year, years });
}
