import type { Content } from '../content/schema';
import type { Case } from '../text/forms';
import type { Forms } from './content';
import { RU_CORE } from './phrases-ru';

/**
 * Words the core makes itself, not read from the content (RU.1, D-476): the outcomes in the tip of an option, the rows
 * of pages and tables. Written in English, as the content is; in a content that carries Russian they come from
 * `phrases-ru.ts`, keyed by the English text (a test checks every key). `{name}` in them are filled from `vars`.
 */
export function phrase(content: Content, text: string, vars: Record<string, string | number> = {}): string {
  const template = content.language?.id === 'ru' ? (RU_CORE[text] ?? text) : text;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole: string, key: string) => (Object.hasOwn(vars, key) ? String(vars[key]) : whole));
}

/** Russian plural: the form for 1 (21…), for 2–4 (22–24…), for 5–20 and 0. */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a >= 11 && a <= 14) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** "3 days" / "3 дня" in the language of the content. */
export function daysPhrase(content: Content, n: number): string {
  return content.language?.id === 'ru' ? `${n} ${ruPlural(n, 'день', 'дня', 'дней')}` : `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "15 crowns" / "15 крон" in the language of the content. */
export function crownsPhrase(content: Content, n: number): string {
  return content.language?.id === 'ru' ? `${n} ${ruPlural(n, 'крона', 'кроны', 'крон')}` : `${n} ${n === 1 ? 'crown' : 'crowns'}`;
}

interface NameEntry {
  forms?: Forms;
  m?: Forms;
  f?: Forms;
}

const NAMES = new WeakMap<Content, { names: Map<string, NameEntry>; female: Set<string> }>();

function nameTable(content: Content): { names: Map<string, NameEntry>; female: Set<string> } {
  const known = NAMES.get(content);
  if (known) return known;
  const names = new Map<string, NameEntry>();
  for (const d of content.declensions) {
    const entry: NameEntry = { ...(d.forms ? { forms: d.forms } : {}), ...(d.m ? { m: d.m } : {}), ...(d.f ? { f: d.f } : {}) };
    names.set(d.en, entry);
    const nom = d.forms?.nom ?? d.m?.nom;
    if (nom) names.set(nom, entry);
  }
  const table = { names, female: new Set(content.names.given.female) };
  NAMES.set(content, table);
  return table;
}

/**
 * A name in the language of the content and in a case (RU.1): a place by its forms (by the English name or the Russian
 * one); a person "Given Surname" word by word, the surname by the sex the given name says. A content without forms, or
 * a name it does not know, gives the name as it is.
 */
export function localName(content: Content, name: string, kase: Case = 'nom'): string {
  if (content.declensions.length === 0) return name;
  const { names, female } = nameTable(content);
  const whole = names.get(name);
  if (whole?.forms) return whole.forms[kase];
  const space = name.indexOf(' ');
  if (space < 0) return whole?.m?.[kase] ?? name;
  const given = name.slice(0, space);
  const surname = name.slice(space + 1);
  const g = names.get(given)?.forms?.[kase] ?? given;
  const s = names.get(surname);
  const sur = (female.has(given) ? s?.f : s?.m)?.[kase] ?? surname;
  return `${g} ${sur}`;
}
