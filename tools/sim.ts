/**
 * Headless simulation run: a random bot plays, the chronicle goes to a file.
 * Usage: npm run sim -- --years 300 --seed 42 [--out path/to/chronicle.md]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { ageYears, formatDate } from '../src/core/calendar';
import { fullName } from '../src/core/character';
import { chronicleMarkdown } from '../src/core/chronicle';
import { loadContent } from '../src/core/content/load';
import { getPlayer } from '../src/core/game';
import { isValidSeed, MAX_SEED } from '../src/core/rng';
import { runSim } from '../src/core/sim';
import { readContentFiles } from './content-files';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    years: { type: 'string', default: '300' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string' },
  },
});

const years = Number(values.years);
const seed = Number(values.seed);
if (!Number.isInteger(years) || years < 1) fail(`--years must be a positive integer, got "${values.years}"`);
if (!isValidSeed(seed)) fail(`--seed must be an integer in 0..${MAX_SEED}, got "${values.seed}"`);
const out = values.out ?? `out/chronicle-seed${seed}-${years}y.md`;

const loaded = loadContent(readContentFiles());
if (!loaded.ok) {
  for (const e of loaded.errors) console.error(`  ${e.file}: ${e.path}: ${e.message}`);
  fail('Content is invalid, run `npm run validate`.');
}
const { content } = loaded;

let result;
try {
  result = runSim(content, { seed, years });
} catch (err) {
  console.error(err);
  fail(`Simulation crashed (seed ${seed}, ${years} years).`);
}
const { state, steps, violations } = result;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, chronicleMarkdown(state));

const count = (kind: string) => state.chronicle.filter((e) => e.kind === kind).length;
const head = getPlayer(state);
console.log(`Simulated ${years} years, seed ${seed}: ${formatDate(0)} → ${formatDate(state.day)}`);
console.log(`Steps: ${steps}, chronicle entries: ${state.chronicle.length}`);
console.log(`Actions completed: ${count('action')}, events: ${count('event')}, deaths: ${count('death')}`);
console.log(`Heads of the house: ${state.characters.length}`);
console.log(
  `Current head: ${fullName(head)}, age ${ageYears(head.birthDay, state.day)}, ` +
    `health ${head.health}, money ${head.money}`,
);
console.log(`Chronicle: ${out}`);

if (violations.length > 0) {
  console.error(`\nInvariant violations: ${violations.length}`);
  for (const v of violations.slice(0, 20)) console.error(`  ${v}`);
  process.exit(1);
}
console.log('Invariant violations: none');
