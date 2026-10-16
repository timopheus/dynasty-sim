/**
 * Size and write time of the hot part of the save (D-312): runs the sim on seeds and times `hotSave` at the end.
 * Usage: npm run save-bench -- [--seed 1] [--runs 10] [--years 300] [--json]
 * Times are of this machine (Node): the budget of a write in the browser, 50 ms, is checked in Chromium (D-312).
 */
import { parseArgs } from 'node:util';
import { loadContent } from '../src/core/content/load';
import { utf8Bytes } from '../src/core/metrics/metrics';
import { isValidSeed } from '../src/core/rng';
import { chunkSave, hotSave } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import { readContentFiles } from './content-files';

const { values } = parseArgs({
  options: { seed: { type: 'string', default: '1' }, runs: { type: 'string', default: '10' }, years: { type: 'string', default: '300' }, json: { type: 'boolean', default: false } },
});
const seed = Number(values.seed);
const runs = Number(values.runs);
const years = Number(values.years);
if (!isValidSeed(seed) || !Number.isInteger(runs) || runs < 1 || !Number.isInteger(years) || years < 1) {
  console.error('Usage: npm run save-bench -- [--seed 1] [--runs 10] [--years 300] [--json]');
  process.exit(1);
}
const loaded = loadContent(readContentFiles());
if (!loaded.ok) {
  console.error('Content is invalid, run `npm run validate`.');
  process.exit(1);
}

/** Median time of `n` calls, ms to two decimals. */
function timeOf(n: number, f: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    f();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return Math.round((times[Math.floor(n / 2)] as number) * 100) / 100;
}

const rows: { seed: number; hotBytes: number; archiveBytes: number; chunks: number; hotSerializeMs: number; chunkSerializeMs: number }[] = [];
for (let s = seed; s < seed + runs; s++) {
  const { state } = runSim(loaded.content, { seed: s, years });
  const hot = hotSave(state);
  const chunks = state.archive.map((_, i) => chunkSave(state, i));
  rows.push({
    seed: s,
    hotBytes: utf8Bytes(hot),
    archiveBytes: chunks.reduce((n, c) => n + utf8Bytes(c), 0),
    chunks: chunks.length,
    hotSerializeMs: timeOf(21, () => hotSave(state)),
    chunkSerializeMs: state.archive.length === 0 ? 0 : timeOf(21, () => chunkSave(state, state.archive.length - 1)),
  });
  if (!values.json) console.error(`seed ${s}: done`);
}

if (values.json) console.log(JSON.stringify({ years, rows }, null, 2));
else {
  const cols = ['seed', 'hotBytes', 'archiveBytes', 'chunks', 'hotSerializeMs', 'chunkSerializeMs'] as const;
  console.log(cols.map((c) => c.padStart(17)).join(''));
  for (const r of rows) console.log(cols.map((c) => String(r[c]).padStart(17)).join(''));
  const max = (k: (typeof cols)[number]) => Math.max(...rows.map((r) => r[k]));
  console.log(['max', ...cols.slice(1).map((c) => String(max(c)))].map((x) => x.padStart(17)).join(''));
}
