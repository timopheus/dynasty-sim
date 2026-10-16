import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content/load';
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

  it('accepts the empty keys of later modules at most once', () => {
    const file = { path: 'fixture/later.yaml', text: 'opinions: {}\nchronicle: {}\ntraits: []\n' };
    const once = loadContent([...BASE_FILES, file]);
    expect(once.ok).toBe(true);
    if (once.ok) expect(once.content.opinions).toEqual({});
    const base = loadContent(BASE_FILES);
    if (base.ok) expect(base.content.opinions).toBeNull();
    const twice = loadContent([...BASE_FILES, file, { ...file, path: 'fixture/later2.yaml' }]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.errors.map((e) => e.path)).toContain('opinions');
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
