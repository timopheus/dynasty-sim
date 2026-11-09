import { UNTRANSLATED_KEYS, walkTexts } from './content';

/**
 * The content in the language it carries (RU.1, D-476): a copy with every text replaced by its translation (`translations`,
 * by the English text); ids, numbers and the names of people stay. Without a language the content is returned as it is.
 * The loader calls it once the English content has passed its checks, so the checks see the English texts.
 */
export function translateContent<T extends Record<string, unknown>>(content: T, fileSchema: { shape: Record<string, unknown> }): T {
  const translations = content.translations as { en: string; text: string }[] | undefined;
  if (!content.language || !translations || translations.length === 0) return content;
  const map = new Map(translations.map((t) => [t.en, t.text]));
  // the content is plain data read from YAML: a JSON copy is a full one
  const out = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(out)) {
    if ((UNTRANSLATED_KEYS as readonly string[]).includes(key) || value === null || value === undefined) continue;
    const schema = fileSchema.shape[key];
    if (!schema) continue;
    walkTexts(schema, value, (text, set) => {
      const to = map.get(text);
      if (to !== undefined) set(to);
    });
  }
  return out as T;
}
