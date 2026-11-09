import type { Content } from '../core/content/schema';
import type { Forms } from '../core/lang/content';
import type { Case } from '../core/text/forms';
import { toYmd } from '../core/time/calendar';
import { RU } from './i18n-ru';

/**
 * The language of the interface (RU.1, D-476). Texts of the interface are written in English in the code and wrapped in
 * `tr()`; the Russian ones are in `i18n-ru.ts`, keyed by the English text (a test checks every key). The texts of the
 * game come translated with the content (`lang/ru/`). The choice is kept in the browser.
 */
export type Lang = 'en' | 'ru';

let lang: Lang = 'en';

const STORE_KEY = 'dynasty-sim-lang';

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    // storage may be closed (a private window): the choice holds for this visit
  }
}

/** The language kept in the browser, else Russian for a Russian browser, else English. */
export function savedLang(): Lang {
  try {
    const kept = localStorage.getItem(STORE_KEY);
    if (kept === 'en' || kept === 'ru') return kept;
  } catch {
    // no storage: fall through to the browser
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** A text of the interface in the language chosen; `{name}` in it are filled from `vars`. */
export function tr(text: string, vars: Record<string, string | number> = {}): string {
  const template = lang === 'ru' ? (RU[text] ?? text) : text;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole: string, key: string) => (Object.hasOwn(vars, key) ? String(vars[key]) : whole));
}

/** Russian plural: the form for 1 (21, 31…), for 2–4 (22–24…), for 5–20 and 0. */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a >= 11 && a <= 14) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** "3 days" / "3 дня". */
export function daysText(n: number): string {
  return lang === 'ru' ? `${n} ${ruPlural(n, 'день', 'дня', 'дней')}` : `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "3–7 days" / "3–7 дней" (the form goes by the larger number). */
export function daysRangeText(min: number, max: number): string {
  return lang === 'ru' ? `${min}–${max} ${ruPlural(max, 'день', 'дня', 'дней')}` : `${min}–${max} days`;
}

/** "15 crowns" / "15 крон". */
export function crownsText(n: number): string {
  return lang === 'ru' ? `${n} ${ruPlural(n, 'крона', 'кроны', 'крон')}` : `${n} ${n === 1 ? 'crown' : 'crowns'}`;
}

/** "N offers" / "N предложений". */
export function offersText(n: number): string {
  return lang === 'ru' ? `${n} ${ruPlural(n, 'предложение', 'предложения', 'предложений')}` : `${n} ${n === 1 ? 'offer' : 'offers'}`;
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "1 January 1700" / "1 января 1700". */
export function dateText(day: number): string {
  const { year, month, day: d } = toYmd(day);
  return lang === 'ru' ? `${d} ${MONTHS_RU[month - 1] ?? ''} ${year}` : `${d} ${MONTHS_EN[month - 1] ?? ''} ${year}`;
}

/** The name of a month alone: "January" / "Январь". */
export function monthText(month: number): string {
  return (lang === 'ru' ? MONTHS_RU_NOM : MONTHS_EN)[month - 1] ?? '';
}

/** Forms of names of the Russian content, by the English name and by the Russian nominative. */
let names: Map<string, { forms?: Forms; m?: Forms; f?: Forms }> = new Map();
let femaleGiven: Set<string> = new Set();

/** The names of people and places of the language of `content` (its `declensions`), for `localName`. */
export function useNames(content: Content): void {
  names = new Map();
  for (const d of content.declensions) {
    const entry = { ...(d.forms ? { forms: d.forms } : {}), ...(d.m ? { m: d.m } : {}), ...(d.f ? { f: d.f } : {}) };
    names.set(d.en, entry);
    const nom = d.forms?.nom ?? d.m?.nom;
    if (nom) names.set(nom, entry);
  }
  femaleGiven = new Set(content.names.given.female);
}

/**
 * A name in the language chosen and in a case (RU.1): a place by its forms; a person "Given Surname" word by word, the
 * surname by the sex the given name says. English, or a name the language does not know, stays as it is.
 */
export function localName(name: string, kase: Case = 'nom'): string {
  if (lang !== 'ru') return name;
  const whole = names.get(name);
  if (whole?.forms) return whole.forms[kase];
  const space = name.indexOf(' ');
  if (space < 0) return whole?.m?.[kase] ?? name;
  const given = name.slice(0, space);
  const surname = name.slice(space + 1);
  const female = femaleGiven.has(given);
  const g = names.get(given)?.forms?.[kase] ?? given;
  const s = names.get(surname);
  const sur = (female ? s?.f : s?.m)?.[kase] ?? surname;
  return `${g} ${sur}`;
}
