/**
 * Bot report (D-319, report only, no gate): each character plays the same seeds, and the table shows what its choices did.
 * Usage: npm run bots [-- --years 300 --seed 1 --runs 10]
 * Prints, per character, medians of the money and age of heads at death, the chronicle lines of a life and the share
 * of ended houses; the "dead" variants nobody chose, and the "dominant" character if one is best at everything.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BOT_CHARACTERS } from '../src/core/bots/characters';
import { deadVariants, dominant, median, type CharacterRow } from '../src/core/bots/report';
import { loadContent } from '../src/core/content/load';
import { computeMetrics } from '../src/core/metrics';
import { runSim } from '../src/core/sim';
import { readContentFiles } from './content-files';

const { values } = parseArgs({ options: { years: { type: 'string', default: '300' }, seed: { type: 'string', default: '1' }, runs: { type: 'string', default: '10' } } });
const years = Number(values.years);
const seed = Number(values.seed);
const runs = Number(values.runs);
if (![years, seed, runs].every((n) => Number.isInteger(n) && n >= 1)) {
  console.error('--years, --seed and --runs must be positive integers');
  process.exit(1);
}

const loaded = loadContent(readContentFiles());
if (!loaded.ok) {
  for (const e of loaded.errors) console.error(`  ${e.file}: ${e.path}: ${e.message}`);
  console.error('Content is invalid, run `npm run validate`.');
  process.exit(1);
}
const { content } = loaded;

const rows: CharacterRow[] = [];
const allChoices: Record<string, number>[] = [];
let violations = 0;
for (const character of BOT_CHARACTERS) {
  const money: number[] = [];
  const age: number[] = [];
  const lines: number[] = [];
  let ended = 0;
  for (let i = 0; i < runs; i++) {
    const r = runSim(content, { seed: seed + i, years, bot: character });
    violations += r.violations.length;
    const m = computeMetrics(r.state);
    money.push(m.money.atDeath.median);
    age.push(m.heads.ageAtDeath.median);
    lines.push(m.heads.chronicleLinesPerLife.median);
    if (m.house.ended) ended += 1;
    allChoices.push(r.choices);
  }
  rows.push({ character, runs, moneyAtDeath: median(money), ageAtDeath: median(age), linesPerLife: median(lines), endedPercent: Math.round((ended * 100) / runs) });
  console.error(`${character} done`);
}

const out: string[] = [`Bot report: ${runs} runs, seeds ${seed}..${seed + runs - 1}, ${years} years`, ''];
out.push('| character | money at death | age at death | lines per life | ended, % |', '|---|---:|---:|---:|---:|');
for (const r of rows) out.push(`| ${r.character} | ${r.moneyAtDeath} | ${r.ageAtDeath} | ${r.linesPerLife} | ${r.endedPercent} |`);
const dead = deadVariants(content, allChoices);
const dom = dominant(rows);
out.push('', `Dominant character: ${dom ?? 'none'}`, `Dead variants (chosen by no character): ${dead.length}`);
for (const d of dead) out.push(`  ${d}`);
const text = out.join('\n');
console.log(text);
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) appendFileSync(stepSummary, text + '\n');
if (violations > 0) {
  console.error(`Invariant violations: ${violations}`);
  process.exit(1);
}
