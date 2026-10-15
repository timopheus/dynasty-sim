/** Several runs side by side and the comparison of two result files (2.7). Pure data in, data out. */
import type { RunMetrics } from './metrics';

export interface Summary {
  min: number;
  median: number;
  max: number;
}

/** Scalar view of one run: dotted names to numbers. Death causes become `deaths.<cause>`. */
export function flatten(m: RunMetrics): Record<string, number> {
  const flat: Record<string, number> = {
    'heads.count': m.heads.count,
    'heads.ageAtDeath.median': m.heads.ageAtDeath.median,
    'heads.ageAtDeath.mean': m.heads.ageAtDeath.mean,
    'heads.ageAtDeath.min': m.heads.ageAtDeath.min,
    'heads.ageAtDeath.max': m.heads.ageAtDeath.max,
    'heads.tenure.median': m.heads.tenure.median,
    'heads.tenure.mean': m.heads.tenure.mean,
    'heads.chronicleLinesPerLife.median': m.heads.chronicleLinesPerLife.median,
    'heads.journalLinesPerLife.median': m.heads.journalLinesPerLife.median,
    actions: m.actions,
    events: m.events,
    eventsPerAction: m.eventsPerAction,
    eventsPerYear: m.eventsPerYear,
    'chronicle.total': m.chronicle.total,
    'chronicle.chronicleLevel': m.chronicle.chronicleLevel,
    'chronicle.journalLevel': m.chronicle.journalLevel,
    'characters.total': m.characters.total,
    'characters.alive': m.characters.alive,
    'money.currentHead': m.money.currentHead,
    'money.atDeath.median': m.money.atDeath.median,
    saveBytes: m.saveBytes,
  };
  for (const { cause, count } of m.deathCauses) flat[`deaths.${cause}`] = count;
  return flat;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Min, median and max of every scalar over runs. A name missing in a run counts as 0 (e.g. no deaths of that cause). */
export function summarize(runs: RunMetrics[]): Record<string, Summary> {
  const flats = runs.map(flatten);
  const names = [...new Set(flats.flatMap((f) => Object.keys(f)))].sort();
  const out: Record<string, Summary> = {};
  for (const name of names) {
    const values = flats.map((f) => f[name] ?? 0).sort((a, b) => a - b);
    out[name] = { min: values[0] as number, median: median(values), max: values[values.length - 1] as number };
  }
  return out;
}

export interface Difference {
  name: string;
  before: number | null;
  after: number | null;
  /** after − before; null when the name is only on one side. */
  delta: number | null;
}

/** Medians of two summaries side by side, names sorted; only names whose median differs when `changedOnly`. */
export function compare(a: Record<string, Summary>, b: Record<string, Summary>, changedOnly = false): Difference[] {
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const rows = names.map((name) => {
    const before = a[name]?.median ?? null;
    const after = b[name]?.median ?? null;
    return { name, before, after, delta: before === null || after === null ? null : Math.round((after - before) * 100) / 100 };
  });
  return changedOnly ? rows.filter((r) => r.delta !== 0) : rows;
}
