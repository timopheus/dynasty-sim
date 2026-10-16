import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content/load';
import { Factor, factorParts } from '../src/core/content/types';
import { BASE_FILES, realContent } from './fixtures/content';

const BAD_DIR = 'tests/fixtures/bad';
const EXPECT_RE = /^# expect-error: (\S+) \/(.+)\/$/;

/**
 * Bad examples: every file in tests/fixtures/bad/ is loaded on top of the base
 * fixture and must fail. Its first line names the expected error:
 * `# expect-error: <path prefix> /<message regex>/`.
 */
function badExamples(): [file: string, path: string, message: RegExp][] {
  return readdirSync(BAD_DIR)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => {
      const file = `${BAD_DIR}/${name}`;
      const first = readFileSync(file, 'utf8').split('\n')[0] ?? '';
      const match = EXPECT_RE.exec(first);
      if (!match) throw new Error(`${file}: first line must be "# expect-error: <path> /<regex>/"`);
      return [file, match[1] ?? '', new RegExp(match[2] ?? '')];
    });
}

describe('content', () => {
  it('loads the real game content', () => {
    const content = realContent();
    expect(content.actions.length).toBeGreaterThan(0);
    expect(content.events.length).toBeGreaterThan(0);
  });

  it('loads the base fixture', () => {
    expect(loadContent(BASE_FILES).ok).toBe(true);
  });

  it('finds the bad examples', () => {
    expect(badExamples().length).toBeGreaterThanOrEqual(16);
  });

  it.each(badExamples())('rejects %s with an error at %s', (file, path, message) => {
    const result = loadContent([...BASE_FILES, { path: file, text: readFileSync(file, 'utf8') }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const match = result.errors.find((e) => e.file === file && e.path.startsWith(path) && message.test(e.message));
    expect(match, JSON.stringify(result.errors, null, 2)).toBeDefined();
  });

  it('accepts the optional keys of later modules at most once', () => {
    const opinions = [
      'opinions:',
      '  reasons: []',
      '  traitEffects: []',
      '  background: { max: 0, rules: [] }',
      '  words: [{ from: -100, text: low }]',
      '  relations: []',
      '  acquaintance: { meetPer100: 0, closeAfterDays: 0, closePer100: 0 }',
    ].join('\n');
    const file = { path: 'fixture/later.yaml', text: `${opinions}\nchronicle: { bigSum: { min: 1, percent: 1 }, repeatDays: 0, famousFame: 1 }\ntraits: []\n` };
    const once = loadContent([...BASE_FILES, file]);
    expect(once.ok, JSON.stringify(!once.ok && once.errors)).toBe(true);
    if (once.ok) expect(once.content.opinions?.words).toHaveLength(1);
    const base = loadContent(BASE_FILES);
    if (base.ok) expect(base.content.opinions).toBeNull();
    const twice = loadContent([...BASE_FILES, file, { ...file, path: 'fixture/later2.yaml' }]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.errors.map((e) => e.path)).toContain('opinions');
  });

  it('requires the narrator section (pace of events, D-170)', () => {
    const result = loadContent(BASE_FILES.filter((f) => !f.path.endsWith('narrator.yaml')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'narrator' && /required/.test(e.message))).toBe(true);
  });

  it('accepts the new keys grammar and backstory, and factors as integer fractions', () => {
    const file = { path: 'fixture/stage3.yaml', text: 'grammar:\n  dawn: ["at first light", { text: "in the snow", when: { season: [winter] } }]\nbackstory: {}\n' };
    const result = loadContent([...BASE_FILES, file]);
    expect(result.ok, JSON.stringify(!result.ok && result.errors)).toBe(true);
    expect(Factor.safeParse('1/2').success).toBe(true);
    expect(Factor.safeParse(3).success).toBe(true);
    expect(Factor.safeParse(0).success).toBe(false);
    expect(Factor.safeParse('0/2').success).toBe(false);
    expect(factorParts('3/4')).toEqual({ num: 3, den: 4 });
  });

  it('requires single keys exactly once', () => {
    const result = loadContent([...BASE_FILES, ...BASE_FILES.map((f) => ({ ...f, path: `copy/${f.path}` }))]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('settings');
    expect(paths).toContain('names');
    expect(paths).toContain('health');
  });
});
