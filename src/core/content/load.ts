/**
 * Assembly file (D-052): parses content files, merges the top-level keys of all
 * modules and runs the cross-checks of all modules.
 */
import { parseDocument } from 'yaml';
import type { z } from 'zod';
import { ContentFileSchema, CROSS_CHECKS, LIST_KEYS, OPTIONAL_KEYS, SINGLE_KEYS, type Content, type ContentSources } from './schema';
import type { ContentError } from './types';

export type { ContentError } from './types';

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  path: string;
  text: string;
}

export type LoadResult = { ok: true; content: Content } | { ok: false; errors: ContentError[] };

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out === '' ? String(key) : `.${String(key)}`;
  }
  return out === '' ? '(root)' : out;
}

function zodErrors(file: string, error: z.ZodError): ContentError[] {
  return error.issues.map((issue) => ({
    file,
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

function emptySources(): ContentSources {
  const sources: Record<string, unknown[]> = {};
  for (const key of [...SINGLE_KEYS, ...OPTIONAL_KEYS, ...LIST_KEYS]) sources[key] = [];
  return sources as ContentSources;
}

/**
 * Parses and validates content files. Files are merged in the order given;
 * callers sort them by path so the result does not depend on the file system.
 */
export function loadContent(files: readonly SourceFile[]): LoadResult {
  const errors: ContentError[] = [];
  const sources = emptySources();
  const anySources = sources as Record<string, { file: string; index: number; item: unknown }[]>;

  for (const { path: file, text } of files) {
    const doc = parseDocument(text);
    if (doc.errors.length > 0) {
      for (const e of doc.errors) {
        const line = e.linePos?.[0];
        const where = line ? `line ${line.line}, col ${line.col}` : '(yaml)';
        errors.push({ file, path: where, message: e.message.split('\n')[0] ?? e.message });
      }
      continue;
    }
    const parsed = ContentFileSchema.safeParse(doc.toJS() ?? {});
    if (!parsed.success) {
      errors.push(...zodErrors(file, parsed.error));
      continue;
    }
    const data = parsed.data as Record<string, unknown>;
    for (const key of [...SINGLE_KEYS, ...OPTIONAL_KEYS]) {
      if (data[key] !== undefined) anySources[key]?.push({ file, index: 0, item: data[key] });
    }
    for (const key of LIST_KEYS) {
      const list = data[key];
      if (Array.isArray(list)) list.forEach((item: unknown, index) => anySources[key]?.push({ file, index, item }));
    }
  }

  for (const key of SINGLE_KEYS) {
    const found = sources[key];
    if (found.length !== 1) {
      errors.push({
        file: found.map((s) => s.file).join(', ') || '(content)',
        path: key,
        message: `${key} must be defined exactly once, found ${found.length}`,
      });
    }
  }
  for (const key of OPTIONAL_KEYS) {
    const found = sources[key];
    if (found.length > 1) {
      errors.push({
        file: found.map((s) => s.file).join(', '),
        path: key,
        message: `${key} must be defined at most once, found ${found.length}`,
      });
    }
  }
  for (const check of CROSS_CHECKS) errors.push(...check(sources));
  if (errors.length > 0) return { ok: false, errors };

  const content: Record<string, unknown> = {};
  for (const key of SINGLE_KEYS) content[key] = sources[key][0]?.item;
  for (const key of OPTIONAL_KEYS) content[key] = sources[key][0]?.item ?? null;
  for (const key of LIST_KEYS) content[key] = sources[key].map((s) => s.item);
  return { ok: true, content: content as Content };
}
