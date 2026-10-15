import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content/load';
import { BASE_FILES, realContent } from './fixtures/content';

describe('content', () => {
  it('loads the real game content', () => {
    const content = realContent();
    expect(content.actions.length).toBeGreaterThan(0);
    expect(content.events.length).toBeGreaterThan(0);
  });

  it('loads the base fixture', () => {
    expect(loadContent(BASE_FILES).ok).toBe(true);
  });

  const cases: [file: string, path: string, message: RegExp][] = [
    ['duplicate-id.yaml', 'actions[0].id', /duplicate action id "wait"/],
    ['unknown-action-ref.yaml', 'events[0].actions[0]', /unknown action "fly"/],
    ['empty-options.yaml', 'events[0].options', /.+/],
    ['unknown-key.yaml', 'actions[0]', /colour/],
    ['float-weight.yaml', 'events[0].weight', /.+/],
    ['yaml-syntax.yaml', 'line', /.+/],
    ['unknown-placeholder.yaml', 'actions[0].text', /unknown placeholder \{title\}/],
    ['bad-id.yaml', 'actions[0].id', /lower_snake_case/],
    ['reversed-range.yaml', 'actions[0].duration', /max must be >= min/],
  ];

  it.each(cases)('rejects %s with an error at %s', (name, path, message) => {
    const file = `tests/fixtures/bad/${name}`;
    const result = loadContent([...BASE_FILES, { path: file, text: readFileSync(file, 'utf8') }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const match = result.errors.find((e) => e.file === file && e.path.startsWith(path) && message.test(e.message));
    expect(match, JSON.stringify(result.errors, null, 2)).toBeDefined();
  });

  it('requires settings and names exactly once', () => {
    const result = loadContent([...BASE_FILES, ...BASE_FILES.map((f) => ({ ...f, path: 'fixture/copy.yaml' }))]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('settings');
    expect(paths).toContain('names');
  });
});
