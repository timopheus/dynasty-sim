/**
 * Plays a journal of commands again (D-202) and writes the chronicle, the journal of the game and the metrics.
 * Usage: npm run replay -- game-journal.json [--out out/replay.md]
 *        npm run replay -- --record out/journal.json --seed 1 --years 50   a journal of the random bot, for tests
 * The journal is the file the game offers to download; the content must be the one it was played on.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { botCommand } from '../src/core/bot';
import { chronicleMarkdown, journalMarkdown } from '../src/core/chronicle/markdown';
import { loadContent } from '../src/core/content/load';
import { newGame } from '../src/core/game';
import { checkInvariants } from '../src/core/invariants';
import { computeMetrics, flatten } from '../src/core/metrics';
import { isValidSeed, seedRng } from '../src/core/rng';
import { contentVersion } from '../src/core/save/content-version';
import { applyRecorded, newJournal, readJournal, replay } from '../src/core/save/journal';
import { formatDate, fromYmd, START_YEAR } from '../src/core/time/calendar';
import { readContentFiles } from './content-files';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const USAGE = 'Usage: npm run replay -- journal.json [--out out/replay.md]\n       npm run replay -- --record out/journal.json --seed 1 --years 50';

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, record: { type: 'string' }, seed: { type: 'string', default: '1' }, years: { type: 'string', default: '50' } },
  });
} catch (err) {
  fail(`${err instanceof Error ? err.message : String(err)}\n${USAGE}`);
}
const { values, positionals } = parsed;

const files = readContentFiles();
const loaded = loadContent(files);
if (!loaded.ok) fail('Content is invalid, run `npm run validate`.');
const { content } = loaded;
const version = contentVersion(files);

if (values.record !== undefined) {
  const seed = Number(values.seed);
  const years = Number(values.years);
  if (!isValidSeed(seed) || !Number.isInteger(years) || years < 1) fail(`Bad --seed or --years.\n${USAGE}`);
  const state = newGame(seed, content);
  const journal = newJournal(seed, version);
  const bot = seedRng(seed, 1);
  const endDay = fromYmd(START_YEAR + years, 1, 1);
  while (state.day < endDay && state.status !== 'ended') applyRecorded(journal, state, content, botCommand(state, content, bot));
  mkdirSync(dirname(values.record), { recursive: true });
  writeFileSync(values.record, JSON.stringify(journal));
  console.log(`Recorded ${journal.commands.length} commands, seed ${seed}, ${years} years: ${values.record}`);
  process.exit(0);
}

const [file] = positionals;
if (file === undefined || positionals.length !== 1) fail(USAGE);
const read = readJournal(readFileSync(file, 'utf8'));
if (!read.ok) fail(`${file}: ${read.message}`);
const { journal } = read;
if (journal.content !== version) {
  console.error(`Warning: the journal was played on content ${journal.content}, this is ${version}; the story may go elsewhere or stop.`);
}

let state;
try {
  state = replay(content, journal);
} catch (err) {
  fail(`Replay stopped: ${err instanceof Error ? err.message : String(err)}`);
}
const out = values.out ?? `out/replay-seed${journal.seed}.md`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, chronicleMarkdown(state));
const journalOut = out.replace(/\.md$/, '') + '-journal.md';
writeFileSync(journalOut, journalMarkdown(state));
console.log(`Replayed ${journal.commands.length} commands, seed ${journal.seed}: ${formatDate(0)} → ${formatDate(state.day)}`);
console.log(`Chronicle: ${out}, journal: ${journalOut}`);
const violations = checkInvariants(state, content);
console.log(violations.length === 0 ? 'Invariant violations: none' : `Invariant violations: ${violations.join('; ')}`);
for (const [name, n] of Object.entries(flatten(computeMetrics(state, content)))) console.log(`${name.padEnd(38)}${String(n).padStart(12)}`);
if (violations.length > 0) process.exit(1);
