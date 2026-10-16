/**
 * Metric gates (D-203): run the pinned seeds and check the corridors from tools/metrics-gates.ts.
 * Usage: npm run gates                 runs the sim (several minutes), prints the table, exits 1 on a failed gate
 *        npm run gates -- --from a.json  checks a report written by `sim --json` instead of running
 * In CI the table also goes to $GITHUB_STEP_SUMMARY.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { checkGates, gatesMarkdown, type Summary } from './gates-check';
import { GATES, RUNS } from './metrics-gates';

const { values } = parseArgs({ options: { from: { type: 'string' } } });

let json: string;
if (values.from !== undefined) json = readFileSync(values.from, 'utf8');
else {
  // The sim exits 1 on invariant violations but still prints the report, so the status is not checked here.
  const args = ['tools/sim.ts', '--years', String(RUNS.years), '--seed', String(RUNS.seed), '--runs', String(RUNS.count), '--json'];
  const r = spawnSync('npx', ['tsx', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
  json = r.stdout;
}

let summary: Record<string, Summary>;
let runs: number;
try {
  const report = JSON.parse(json) as { summary: Record<string, Summary>; runs: unknown[] };
  summary = report.summary;
  runs = report.runs.length;
} catch {
  console.error('The sim produced no report (it crashed?).');
  process.exit(1);
}

const results = checkGates(summary, GATES);
const table = gatesMarkdown(results, `Metric gates: ${runs} runs, seeds ${RUNS.seed}..${RUNS.seed + runs - 1}, ${RUNS.years} years`);
console.log(table);
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) appendFileSync(stepSummary, table + '\n');

const failed = results.filter((r) => r.status === 'fail');
if (failed.length > 0) {
  console.error(`Failed gates: ${failed.map((r) => r.gate.metric).join(', ')}`);
  process.exit(1);
}
