import { loadContent, type SourceFile } from '../../src/core/content/load';
import type { Content, Settings } from '../../src/core/content/schema';
import { readContentFiles } from '../../tools/content-files';

/**
 * Small, stable content for tests that need exact numbers: one file per module
 * in tests/fixtures/base/. A module's tests override what they need on top.
 */
export const BASE_FILES: SourceFile[] = readContentFiles('tests/fixtures/base');

export function loadOrThrow(files: SourceFile[]): Content {
  const result = loadContent(files);
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n'));
  return result.content;
}

export function fixtureContent(settings: Partial<Settings> = {}, more: Partial<Content> = {}): Content {
  const content = loadOrThrow(BASE_FILES);
  return { ...content, ...more, settings: { ...content.settings, ...settings } };
}

export function realContent(): Content {
  return loadOrThrow(readContentFiles());
}
