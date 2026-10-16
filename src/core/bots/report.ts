import type { Content } from '../content/schema';
import { type BotCharacter } from './characters';

/** Numbers of one character over its runs (medians over seeds), the line of the bot report (D-319). */
export interface CharacterRow {
  character: BotCharacter;
  runs: number;
  /** Median over runs of the median money of heads at death. */
  moneyAtDeath: number;
  /** Median over runs of the median age of heads at death. */
  ageAtDeath: number;
  /** Median over runs of the chronicle-level lines of the heads. */
  linesPerLife: number;
  /** Share of runs where the house ended (percent). */
  endedPercent: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * The variants a bot can choose: every option of every page of events with a hero in them (`who` is not `npc`) as
 * `<event>/<page or ->/<option>`, and every action as `action/<id>`. A notice has one option, 0 (its "Continue").
 */
export function allVariants(content: Content): string[] {
  const out: string[] = content.actions.map((a) => `action/${a.id}`);
  for (const e of content.events) {
    if (e.who === 'npc') continue;
    const scenes = [['-', e] as const, ...Object.entries(e.pages ?? {})];
    for (const [page, scene] of scenes) {
      const n = scene.options?.length ?? 1;
      for (let i = 0; i < n; i++) out.push(`${e.id}/${page}/${i}`);
    }
  }
  return out;
}

/** Variants no character chose in any run: `choices` are the counts of the runs (`SimResult.choices`). */
export function deadVariants(content: Content, choices: readonly Record<string, number>[]): string[] {
  const chosen = new Set(choices.flatMap((c) => Object.keys(c)));
  return allVariants(content).filter((v) => !chosen.has(v));
}

/**
 * The character that is best by all numbers at once (ties count as best): the most money and the oldest heads at
 * death, the fewest ended houses. Chronicle lines are a measure of the story, not of success, so they are left out.
 * Null when no one is best everywhere (D-319: a dominant strategy would mean the choices carry no weight).
 */
export function dominant(rows: readonly CharacterRow[]): BotCharacter | null {
  for (const row of rows) {
    const best =
      rows.every((r) => row.moneyAtDeath >= r.moneyAtDeath) &&
      rows.every((r) => row.ageAtDeath >= r.ageAtDeath) &&
      rows.every((r) => row.endedPercent <= r.endedPercent);
    // all rows equal is no dominance
    const strictlyBetter = rows.some((r) => r !== row && (row.moneyAtDeath > r.moneyAtDeath || row.ageAtDeath > r.ageAtDeath || row.endedPercent < r.endedPercent));
    if (best && strictlyBetter) return row.character;
  }
  return null;
}

