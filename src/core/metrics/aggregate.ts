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
    'heads.marksPerLife.median': m.heads.marksPerLife.median,
    actions: m.actions,
    events: m.events,
    eventsPerAction: m.eventsPerAction,
    eventsPerYear: m.eventsPerYear,
    eventsPerShortAction: m.eventsPerShortAction,
    eventsPerLongAction: m.eventsPerLongAction,
    heavyPerYear: m.heavyPerYear,
    notices: m.notices,
    npcEventsPerYear: m.npcEventsPerYear,
    npcStoredShare: m.npcStoredShare,
    'chronicle.total': m.chronicle.total,
    'chronicle.chronicleLevel': m.chronicle.chronicleLevel,
    'chronicle.journalLevel': m.chronicle.journalLevel,
    'characters.total': m.characters.total,
    'characters.alive': m.characters.alive,
    'characters.livingMax': m.livingMax,
    // 1 for a run whose house ended: over runs, the share of houses that ended (summarize takes the mean).
    'house.endedShare': m.house.ended ? 1 : 0,
    'money.currentHead': m.money.currentHead,
    'money.atDeath.median': m.money.atDeath.median,
    saveBytes: m.saveBytes,
    hotBytes: m.hotBytes,
    archiveBytes: m.archiveBytes,
  };
  for (const era of m.eras) {
    flat[`eras.${era.id}.heads`] = era.heads;
    // An era where no head died has no medians: a 0 would pull down the median over runs.
    if (era.heads === 0) continue;
    flat[`eras.${era.id}.ageAtDeath.median`] = era.ageAtDeath.median;
    flat[`eras.${era.id}.eventsPerYear.median`] = era.eventsPerYear.median;
  }
  for (const { cause, count } of m.deathCauses) flat[`deaths.${cause}`] = count;
  if (m.house.endYear !== null) flat['house.endYear'] = m.house.endYear;
  return flat;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Names counted only over the runs that have them: the year the house ended means nothing for a house that did not. */
const ONLY_WHERE_PRESENT = (name: string): boolean => name === 'house.endYear' || /^eras\..+\.(ageAtDeath|eventsPerYear)\.median$/.test(name);
/** Names whose min, median and max over runs are all the mean, two decimals: a share of runs (D-315). */
const SHARES: ReadonlySet<string> = new Set(['house.endedShare']);

/**
 * Min, median and max of every scalar over runs. A name missing in a run counts as 0 (e.g. no deaths of that cause),
 * except the names of ONLY_WHERE_PRESENT; a share (SHARES) is the mean over runs in all three.
 */
export function summarize(runs: RunMetrics[]): Record<string, Summary> {
  const flats = runs.map(flatten);
  const names = [...new Set(flats.flatMap((f) => Object.keys(f)))].sort();
  const out: Record<string, Summary> = {};
  for (const name of names) {
    const values = (ONLY_WHERE_PRESENT(name) ? flats.flatMap((f) => (f[name] === undefined ? [] : [f[name]])) : flats.map((f) => f[name] ?? 0)).sort((a, b) => a - b);
    if (SHARES.has(name)) {
      const share = Math.round((values.reduce((s, v) => s + v, 0) * 100) / values.length) / 100;
      out[name] = { min: share, median: share, max: share };
    } else out[name] = { min: values[0] as number, median: median(values), max: values[values.length - 1] as number };
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
    // A death cause missing on one side means zero deaths, as in summarize.
    const absent = name.startsWith('deaths.') ? 0 : null;
    const before = a[name]?.median ?? absent;
    const after = b[name]?.median ?? absent;
    return { name, before, after, delta: before === null || after === null ? null : Math.round((after - before) * 100) / 100 };
  });
  return changedOnly ? rows.filter((r) => r.delta !== 0) : rows;
}
