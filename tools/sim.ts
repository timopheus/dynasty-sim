/**
 * Headless simulation run: a random bot plays, the chronicle goes to a file.
 * Usage: npm run sim -- --years 300 --seed 42 [--out path/to/chronicle.md]
 *        npm run sim -- --years 300 --seed 1 --runs 10 [--json [file]]   metrics of seeds 1..10
 *        npm run sim -- --compare a.json b.json                          medians side by side
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { fullName } from '../src/core/character/character';
import { chronicleMarkdown } from '../src/core/chronicle/markdown';
import { loadContent } from '../src/core/content/load';
import { compare, computeMetrics, summarize, type RunMetrics, type Summary } from '../src/core/metrics';
import { isValidSeed, MAX_SEED } from '../src/core/rng';
import { runSim } from '../src/core/sim';
import { getPlayer } from '../src/core/helpers';
import { ageYears, formatDate } from '../src/core/time/calendar';
import { readContentFiles } from './content-files';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const USAGE =
  'Usage: npm run sim -- --years 300 --seed 42 [--out path/to/chronicle.md] [--runs N] [--json]\n' +
  '       npm run sim -- --compare a.json b.json';

function readArgs() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        years: { type: 'string', default: '300' },
        seed: { type: 'string', default: '1' },
        out: { type: 'string' },
        runs: { type: 'string', default: '1' },
        json: { type: 'boolean', default: false },
        compare: { type: 'string' },
      },
    });
  } catch (err) {
    return fail(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
  }
}

/** The file `--json` prints: per-run metrics and a summary over runs (the part --compare reads). */
interface Report {
  years: number;
  runs: { seed: number; elapsedMs: number; metrics: RunMetrics }[];
  summary: Record<string, Summary>;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function readReport(file: string): Report {
  try {
    const report = JSON.parse(readFileSync(file, 'utf8')) as Report;
    if (typeof report.summary !== 'object' || report.summary === null) throw new Error('no "summary"');
    return report;
  } catch (err) {
    return fail(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const { values, positionals } = readArgs();

if (values.compare !== undefined) {
  const [other] = positionals;
  if (other === undefined || positionals.length !== 1) fail(`--compare needs two files.\n${USAGE}`);
  const a = readReport(values.compare);
  const b = readReport(other);
  console.log(`${'metric'.padEnd(38)}${'A'.padStart(12)}${'B'.padStart(12)}${'B − A'.padStart(12)}`);
  for (const r of compare(a.summary, b.summary, true)) {
    const cell = (n: number | null) => (n === null ? '–' : fmt(n)).padStart(12);
    console.log(`${r.name.padEnd(38)}${cell(r.before)}${cell(r.after)}${cell(r.delta)}`);
  }
  console.log(`(medians over ${a.runs.length} and ${b.runs.length} runs, ${a.years} and ${b.years} years; unchanged metrics hidden)`);
  process.exit(0);
}

const DIGITS = /^\d+$/;
const years = DIGITS.test(values.years) ? Number(values.years) : NaN;
const seed = DIGITS.test(values.seed) ? Number(values.seed) : NaN;
const runs = DIGITS.test(values.runs) ? Number(values.runs) : NaN;
if (!Number.isInteger(years) || years < 1) fail(`--years must be a positive integer, got "${values.years}"`);
if (!isValidSeed(seed)) fail(`--seed must be an integer in 0..${MAX_SEED}, got "${values.seed}"`);
if (!Number.isInteger(runs) || runs < 1) fail(`--runs must be a positive integer, got "${values.runs}"`);
if (!isValidSeed(seed + runs - 1)) fail(`--seed + --runs - 1 must be at most ${MAX_SEED}`);
if (runs > 1 && values.out !== undefined) fail('--out names one chronicle file; with --runs the files are out/chronicle-seed<N>-<years>y.md');

const loaded = loadContent(readContentFiles());
if (!loaded.ok) {
  for (const e of loaded.errors) console.error(`  ${e.file}: ${e.path}: ${e.message}`);
  fail('Content is invalid, run `npm run validate`.');
}
const { content } = loaded;

// With --json stdout holds only the JSON; the human-readable text goes to stderr.
const say = values.json ? console.error : console.log;
const report: Report = { years, runs: [], summary: {} };
let violationCount = 0;

for (let i = 0; i < runs; i++) {
  const runSeed = seed + i;
  const out = values.out ?? `out/chronicle-seed${runSeed}-${years}y.md`;
  const started = performance.now();
  let result;
  try {
    result = runSim(content, { seed: runSeed, years });
  } catch (err) {
    console.error(err);
    fail(`Simulation crashed (seed ${runSeed}, ${years} years).`);
  }
  const elapsedMs = Math.round(performance.now() - started);
  const { state, steps, violations } = result;
  const metrics = computeMetrics(state);
  report.runs.push({ seed: runSeed, elapsedMs, metrics });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, chronicleMarkdown(state));

  const head = getPlayer(state);
  say(`Simulated ${years} years, seed ${runSeed}: ${formatDate(0)} → ${formatDate(state.day)} in ${elapsedMs} ms`);
  say(`Steps: ${steps}, chronicle entries: ${state.chronicle.length}`);
  say(`Actions completed: ${metrics.actions}, events: ${metrics.events}, deaths: ${metrics.deathCauses.reduce((n, d) => n + d.count, 0)}`);
  say(`Heads of the house: ${metrics.heads.count}`);
  say(
    `Current head: ${fullName(head)}, age ${ageYears(head.birthDay, state.day)}, ` +
      `health ${head.health}, money ${head.money}`,
  );
  say(`Chronicle: ${out}`);
  if (violations.length > 0) {
    violationCount += violations.length;
    console.error(`\nInvariant violations (seed ${runSeed}): ${violations.length}`);
    for (const v of violations.slice(0, 20)) console.error(`  ${v}`);
  } else say('Invariant violations: none');
}

report.summary = summarize(report.runs.map((r) => r.metrics));
const times = report.runs.map((r) => r.elapsedMs).sort((x, y) => x - y);
const midTime = Math.floor(times.length / 2);
report.summary.elapsedMs = {
  min: times[0] as number,
  median: times.length % 2 === 1 ? (times[midTime] as number) : ((times[midTime - 1] as number) + (times[midTime] as number)) / 2,
  max: times[times.length - 1] as number,
};

if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  say(`\nMetrics over ${runs} run${runs > 1 ? 's' : ''} (seeds ${seed}..${seed + runs - 1}), ${years} years`);
  say(`${'metric'.padEnd(38)}${'min'.padStart(12)}${'median'.padStart(12)}${'max'.padStart(12)}`);
  for (const [name, s] of Object.entries(report.summary)) {
    say(`${name.padEnd(38)}${fmt(s.min).padStart(12)}${fmt(s.median).padStart(12)}${fmt(s.max).padStart(12)}`);
  }
}

if (violationCount > 0) process.exit(1);
