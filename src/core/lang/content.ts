import { z } from 'zod';
import type { ContentSources, CrossCheck } from '../content/schema';
import { Id, Text, type ContentError } from '../content/types';
import { CASES, placeholderBases } from '../text/forms';

/**
 * The second language of the game (RU.1, D-476). English is the source: the content is written in English, and a
 * language translates its texts by the English text itself (as gettext does). The keys come only from `lang/<id>/`:
 * - `language`: the id and the name of the language (`ru`, "Русский");
 * - `translations`: `{en, text}` — the text of the language for an English text of the content, a list merged from all
 *   files; the text may use the forms of the language: `{~он|она}`, `{role~он|она}`, `{role:gen}` (`text/forms.ts`);
 * - `declensions`: the forms of a proper name in the six cases (`nom gen dat acc ins prep`), for a man and a woman where
 *   they differ (a surname), keyed by the English name; the screen shows the names of people and places by them.
 */
const FormsSchema = z.strictObject(Object.fromEntries(CASES.map((c) => [c, Text])) as Record<(typeof CASES)[number], typeof Text>);

export const LanguageSchema = z.strictObject({ id: Id, name: Text });

export const TranslationSchema = z.strictObject({ en: Text, text: Text });

export const DeclensionSchema = z
  .strictObject({ en: Text, forms: FormsSchema.optional(), m: FormsSchema.optional(), f: FormsSchema.optional() })
  .refine((d) => (d.forms !== undefined) !== (d.m !== undefined || d.f !== undefined), 'a name has forms, or the forms of a man and a woman');

export type LanguageDef = z.infer<typeof LanguageSchema>;
export type TranslationDef = z.infer<typeof TranslationSchema>;
export type DeclensionDef = z.infer<typeof DeclensionSchema>;
export type Forms = z.infer<typeof FormsSchema>;

/** Keys of the content that are not translated: the language itself. */
export const UNTRANSLATED_KEYS = ['language', 'translations', 'declensions'] as const;

/** Fields of a key that hold the names of people: they are declined on screen (`declensions`), not translated. */
const NAME_FIELDS: Record<string, readonly string[]> = { names: ['given', 'surnames'] };

/** A zod schema as its internals show it: what kind it is and what it wraps. */
interface Def {
  type: string;
  innerType?: unknown;
  shape?: Record<string, unknown>;
  element?: unknown;
  valueType?: unknown;
  options?: unknown[];
  getter?: () => unknown;
  in?: unknown;
  checks?: { _zod: { def: { check: string; format?: string } } }[];
}

function defOf(schema: unknown): Def {
  return (schema as { _zod: { def: Def } })._zod.def;
}

/** A string of the content is a text, not an id or a factor: a string schema with no pattern. */
function isTextSchema(schema: unknown): boolean {
  const def = defOf(schema);
  return def.type === 'string' && !(def.checks ?? []).some((c) => c._zod.def.check === 'string_format' && c._zod.def.format === 'regex');
}

/**
 * Calls `visit` for every text of `value` that `schema` declares a text (a string schema with no pattern): ids, enums,
 * numbers and factors are left out. Follows objects, arrays, records, unions, optional and lazy schemas.
 */
export function walkTexts(schema: unknown, value: unknown, visit: (text: string, set: (to: string) => void) => void): void {
  const def = defOf(schema);
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
    case 'catch':
    case 'nonoptional':
      if (value !== undefined && value !== null) walkTexts(def.innerType, value, visit);
      return;
    case 'lazy':
      walkTexts(def.getter?.(), value, visit);
      return;
    case 'pipe':
      walkTexts(def.in, value, visit);
      return;
    case 'object':
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(def.shape ?? {})) {
          const v = (value as Record<string, unknown>)[key];
          if (typeof v === 'string') {
            if (isTextSchema(unwrap(inner)) || unionAllowsText(inner)) visit(v, (to) => ((value as Record<string, unknown>)[key] = to));
          } else if (v !== undefined) walkTexts(inner, v, visit);
        }
      }
      return;
    case 'array':
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          if (typeof v === 'string') {
            if (isTextSchema(unwrap(def.element)) || unionAllowsText(def.element)) visit(v, (to) => (value[i] = to));
          } else walkTexts(def.element, v, visit);
        });
      }
      return;
    case 'record':
      if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === 'string') {
            if (isTextSchema(unwrap(def.valueType))) visit(v, (to) => ((value as Record<string, unknown>)[key] = to));
          } else walkTexts(def.valueType, v, visit);
        }
      }
      return;
    case 'union':
      // an object value goes to the object options; a string value is handled by the parent
      for (const option of def.options ?? []) {
        const inner = defOf(unwrap(option));
        if (value && typeof value === 'object' && (inner.type === 'object' || inner.type === 'array' || inner.type === 'record')) walkTexts(option, value, visit);
      }
      return;
    default:
      return;
  }
}

function unwrap(schema: unknown): unknown {
  let s = schema;
  for (let i = 0; i < 8; i++) {
    const def = defOf(s);
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default' || def.type === 'readonly' || def.type === 'catch' || def.type === 'nonoptional') s = def.innerType;
    else if (def.type === 'lazy') s = def.getter?.();
    else if (def.type === 'pipe') s = def.in;
    else return s;
  }
  return s;
}

function unionAllowsText(schema: unknown): boolean {
  const def = defOf(unwrap(schema));
  return def.type === 'union' && (def.options ?? []).some((o) => isTextSchema(unwrap(o)));
}

/**
 * Calls `visit` for every text of the value of a top-level key of a content file (or of one item of it, when the key is a
 * list and `item` is set): the keys of the language and the names of people are left out.
 */
export function walkKeyTexts(fileSchema: { shape: Record<string, unknown> }, key: string, value: unknown, visit: (text: string, set: (to: string) => void) => void, item = false): void {
  if ((UNTRANSLATED_KEYS as readonly string[]).includes(key) || value === null || value === undefined) return;
  const schema = fileSchema.shape[key];
  if (!schema) return;
  const element = item && defOf(unwrap(schema)).type === 'array' ? defOf(unwrap(schema)).element : schema;
  const names = NAME_FIELDS[key];
  if (!names || typeof value !== 'object' || Array.isArray(value)) {
    walkTexts(element, value, visit);
    return;
  }
  // the other fields of the key are texts: walk a view without the names, and keep what was set
  const rest = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([field]) => !names.includes(field)));
  walkTexts(element, rest, visit);
  Object.assign(value as Record<string, unknown>, rest);
}

/** Every text of every item of the content sources, with where it is: what the language must translate. */
export function contentTexts(sources: ContentSources, fileSchema: { shape: Record<string, unknown> }): { text: string; file: string; path: string }[] {
  const out: { text: string; file: string; path: string }[] = [];
  for (const [key, items] of Object.entries(sources) as [string, { file: string; index: number; item: unknown }[]][]) {
    const schema = fileSchema.shape[key];
    if (!schema) continue;
    const list = defOf(unwrap(schema)).type === 'array';
    for (const { file, index, item } of items) {
      walkKeyTexts(fileSchema, key, item, (text) => out.push({ text, file, path: list ? `${key}[${index}]` : key }), true);
    }
  }
  return out;
}

/**
 * The language is complete and well formed (RU.1, D-476): one language at most; every text of the content has its
 * translation, once; no translation of a text the content does not have; a translation names the same people as its
 * text (the pronouns `{he}`… give way to the forms `{~он|она}`); every case is one of the six; a name is declined once.
 */
export function makeCheckLanguage(fileSchema: { shape: Record<string, unknown> }): CrossCheck {
  return (sources) => {
    const errors: ContentError[] = [];
    if (sources.language.length === 0) {
      for (const { file, index } of sources.translations) errors.push({ file, path: `translations[${index}]`, message: 'translations need the top-level key "language"' });
      for (const { file, index } of sources.declensions) errors.push({ file, path: `declensions[${index}]`, message: 'declensions need the top-level key "language"' });
      return errors;
    }
    const texts = contentTexts(sources, fileSchema);
    const known = new Map<string, { file: string; path: string }>();
    for (const t of texts) if (!known.has(t.text)) known.set(t.text, t);
    const translated = new Map<string, string>();
    for (const { file, index, item } of sources.translations) {
      const path = `translations[${index}]`;
      if (translated.has(item.en)) errors.push({ file, path, message: `a second translation of "${item.en}"` });
      translated.set(item.en, item.text);
      if (!known.has(item.en)) errors.push({ file, path, message: `"${item.en}" is not a text of the content (stale translation?)` });
      const problem = comparePlaceholders(item.en, item.text);
      if (problem) errors.push({ file, path: `${path}.text`, message: problem });
    }
    for (const [text, where] of known) {
      if (!translated.has(text)) errors.push({ file: where.file, path: where.path, message: `no translation of "${text}"` });
    }
    const names = new Set<string>();
    for (const { file, index, item } of sources.declensions) {
      if (names.has(item.en)) errors.push({ file, path: `declensions[${index}]`, message: `"${item.en}" is declined twice` });
      names.add(item.en);
    }
    return errors;
  };
}

/** English pronouns: the language gives them as forms, so a translation may leave them out. */
const PRONOUNS = ['he', 'him', 'his', 'He', 'His'];

/**
 * A translation names the same people as its text: the same roles and placeholders, pronouns aside (they become forms);
 * a form names the subject or a role of the text; a case is one of the six. Null when fine.
 */
export function comparePlaceholders(en: string, text: string): string | null {
  const source = placeholderBases(en);
  const target = placeholderBases(text);
  if (source === null || target === null) return target === null ? 'unbalanced { or } in the translation' : null;
  const strip = (names: string[]) => [...new Set(names.filter((n) => !PRONOUNS.includes(n) && !PRONOUNS.some((p) => n.endsWith(`.${p}`))))].sort();
  const want = strip(source.names);
  const got = strip(target.names);
  const missing = want.filter((n) => !got.includes(n));
  // a role the text names only by a pronoun (`{patron.him}`) may be named in the translation (`{patron:acc}`)
  const byPronoun = new Set(source.names.filter((n) => PRONOUNS.some((p) => n.endsWith(`.${p}`))).map((n) => n.split('.')[0] ?? ''));
  const extra = got.filter((n) => !want.includes(n) && !byPronoun.has(n));
  if (missing.length > 0) return `the translation leaves out ${missing.map((n) => `{${n}}`).join(', ')}`;
  if (extra.length > 0) return `the translation names ${extra.map((n) => `{${n}}`).join(', ')}, which the text does not`;
  const roles = new Set(['', 'name', ...source.names.map((n) => n.split('.')[0] ?? '')]);
  for (const form of target.forms) if (!roles.has(form)) return `the form {${form}~…|…} names nobody of the text`;
  for (const c of target.cases) if (!(CASES as readonly string[]).includes(c)) return `unknown case ":${c}"; the cases are ${CASES.join(', ')}`;
  const syms = (list: string[]) => [...new Set(list)].sort().join(', ');
  if (syms(source.symbols) !== syms(target.symbols)) return `the translation must keep the grammar symbols <${syms(source.symbols)}> (has <${syms(target.symbols)}>)`;
  return null;
}

/** The sources of the keys of the language, for the type of the cross-check. */
export type LanguageSources = Pick<ContentSources, 'language' | 'translations' | 'declensions'>;
