import { parseDocument } from 'yaml';
import type { z } from 'zod';
import {
  ContentFileSchema,
  PLACEHOLDERS,
  type ActionDef,
  type Content,
  type EventDef,
  type Names,
  type Settings,
} from './schema';

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  path: string;
  text: string;
}

export interface ContentError {
  file: string;
  path: string;
  message: string;
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

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/** Returns an error message if the template has unknown placeholders or stray braces. */
export function checkTemplate(template: string): string | null {
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1] ?? '';
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) {
      return `unknown placeholder {${name}}; allowed: ${PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}`;
    }
  }
  if (/[{}]/.test(template.replace(PLACEHOLDER_RE, ''))) return 'unbalanced { or }';
  return null;
}

interface Located<T> {
  file: string;
  index: number;
  item: T;
}

/**
 * Parses and validates content files. Files are merged in the order given;
 * callers sort them by path so the result does not depend on the file system.
 */
export function loadContent(files: readonly SourceFile[]): LoadResult {
  const errors: ContentError[] = [];
  const actions: Located<ActionDef>[] = [];
  const events: Located<EventDef>[] = [];
  const settings: Located<Settings>[] = [];
  const names: Located<Names>[] = [];

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
    const data = parsed.data;
    if (data.settings) settings.push({ file, index: 0, item: data.settings });
    if (data.names) names.push({ file, index: 0, item: data.names });
    data.actions?.forEach((item, index) => actions.push({ file, index, item }));
    data.events?.forEach((item, index) => events.push({ file, index, item }));
  }

  if (settings.length !== 1) {
    errors.push({
      file: settings.map((s) => s.file).join(', ') || '(content)',
      path: 'settings',
      message: `settings must be defined exactly once, found ${settings.length}`,
    });
  }
  if (names.length !== 1) {
    errors.push({
      file: names.map((s) => s.file).join(', ') || '(content)',
      path: 'names',
      message: `names must be defined exactly once, found ${names.length}`,
    });
  }
  if (actions.length === 0) {
    errors.push({ file: '(content)', path: 'actions', message: 'at least one action is required' });
  }

  const actionIds = new Set<string>();
  for (const { file, index, item } of actions) {
    if (actionIds.has(item.id)) {
      errors.push({ file, path: `actions[${index}].id`, message: `duplicate action id "${item.id}"` });
    }
    actionIds.add(item.id);
  }

  const eventIds = new Set<string>();
  for (const { file, index, item } of events) {
    const at = `events[${index}]`;
    if (eventIds.has(item.id)) {
      errors.push({ file, path: `${at}.id`, message: `duplicate event id "${item.id}"` });
    }
    eventIds.add(item.id);
    item.actions?.forEach((ref, i) => {
      if (!actionIds.has(ref)) {
        errors.push({ file, path: `${at}.actions[${i}]`, message: `unknown action "${ref}"` });
      }
    });
  }

  const templates: { file: string; path: string; text: string }[] = [];
  for (const { file, item } of settings) {
    for (const [key, text] of Object.entries(item.texts)) {
      templates.push({ file, path: `settings.texts.${key}`, text });
    }
  }
  for (const { file, index, item } of actions) {
    templates.push({ file, path: `actions[${index}].text`, text: item.text });
  }
  for (const { file, index, item } of events) {
    templates.push({ file, path: `events[${index}].text`, text: item.text });
    item.options.forEach((option, i) => {
      templates.push({ file, path: `events[${index}].options[${i}].text`, text: option.text });
      templates.push({ file, path: `events[${index}].options[${i}].result`, text: option.result });
    });
  }
  for (const t of templates) {
    const problem = checkTemplate(t.text);
    if (problem) errors.push({ file: t.file, path: t.path, message: problem });
  }

  const onlySettings = settings[0];
  const onlyNames = names[0];
  if (errors.length > 0 || !onlySettings || !onlyNames) return { ok: false, errors };
  return {
    ok: true,
    content: {
      settings: onlySettings.item,
      names: onlyNames.item,
      actions: actions.map((a) => a.item),
      events: events.map((e) => e.item),
    },
  };
}
