import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { SourceFile } from '../src/core/content/load';

export const CONTENT_DIR = 'content';

/** Reads all YAML files under `dir`, sorted by path so merging is deterministic. */
export function readContentFiles(dir = CONTENT_DIR): SourceFile[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .map((name) => join(dir, name))
    .sort()
    .map((path) => ({
      path: relative('.', path).split(sep).join('/'),
      text: readFileSync(path, 'utf8'),
    }));
}
