/**
 * The second language of the game (RU.1, D-476).
 *   npx tsx tools/lang.ts skeleton [ru]   — writes lang/<id>/ files: every English text of every content file, with the
 *                                           translations already made kept, and the missing ones left empty;
 *   npx tsx tools/lang.ts check [ru] [file…] — loads the content with the language and prints what is wrong or missing
 *                                           (only for the given lang files, if any).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { loadContent } from '../src/core/content/load';
import { ContentFileSchema } from '../src/core/content/schema';
import { UNTRANSLATED_KEYS, walkTexts } from '../src/core/lang/content';
import { readContentFiles } from './content-files';

const [command = 'check', id = 'ru', ...only] = process.argv.slice(2);
const dir = `lang/${id}`;

function textsOf(text: string): string[] {
  const data = (parseDocument(text).toJS() ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if ((UNTRANSLATED_KEYS as readonly string[]).includes(key)) continue;
    const schema = (ContentFileSchema.shape as Record<string, unknown>)[key];
    if (schema) walkTexts(schema, value, (t) => out.push(t));
  }
  return [...new Set(out)];
}

function existing(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(dir)) return map;
  for (const f of readContentFiles(dir)) {
    const data = (parseDocument(f.text).toJS() ?? {}) as { translations?: { en: string; text: string | null }[] };
    for (const t of data.translations ?? []) if (t.text) map.set(t.en, t.text);
  }
  return map;
}

if (command === 'skeleton') {
  const done = existing();
  const seen = new Set<string>();
  for (const f of readContentFiles()) {
    const texts = textsOf(f.text).filter((t) => !seen.has(t));
    texts.forEach((t) => seen.add(t));
    if (texts.length === 0) continue;
    const out = `${dir}/${f.path.replace(/^content\//, '')}`;
    mkdirSync(dirname(out), { recursive: true });
    const header = `# Russian translation of ${f.path} (RU.1, D-476). Etalon: docs/reference/russian-style.md. Check: npx tsx tools/lang.ts check ru\n`;
    writeFileSync(out, header + stringify({ translations: texts.map((t) => ({ en: t, text: done.get(t) ?? null })) }, { lineWidth: 0 }));
    console.log(`${out}: ${texts.length} texts, ${texts.filter((t) => !done.has(t)).length} to translate`);
  }
} else {
  const files = [...readContentFiles(), ...readContentFiles(dir)];
  const result = loadContent(files);
  if (result.ok) {
    console.log(`Language ${id}: OK, ${result.content.translations.length} translations, ${result.content.declensions.length} declensions.`);
  } else {
    const errors = result.errors.filter((e) => only.length === 0 || only.some((o) => e.file.includes(o)));
    for (const e of errors) console.log(`${e.file}: ${e.path}: ${e.message}`);
    console.log(`${errors.length} problem(s)${only.length ? ` in ${only.join(', ')}` : ''}.`);
    process.exitCode = errors.length > 0 ? 1 : 0;
  }
}
