import type { Content } from '../core/content/schema';
import { localName as coreLocalName } from '../core/lang/phrases';
import type { Case } from '../core/text/forms';
import { toYmd } from '../core/time/calendar';
import { RU, RU_MAP_NAMES } from './i18n-ru';

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

/** The name of a month alone: "January" / "Январь"; inside a phrase the Russian one is small: "январь". */
export function monthText(month: number, inPhrase = false): string {
  const name = (lang === 'ru' ? MONTHS_RU_NOM : MONTHS_EN)[month - 1] ?? '';
  return lang === 'ru' && inPhrase ? name.toLowerCase() : name;
}

/** The content of the Russian language, whose forms of names `localName` uses. */
let russian: Content | null = null;

/** The names of people and places of the language of `content` (its `declensions`), for `localName`. */
export function useNames(content: Content): void {
  russian = content;
}

/** A name in the language chosen and in a case (RU.1), by the forms of the language (`core/lang/phrases.ts`). */
export function localName(name: string, kase: Case = 'nom'): string {
  return lang === 'ru' && russian ? coreLocalName(russian, name, kase) : name;
}

/** Two or three Latin letters read as one Russian sound; the longest first. */
const DIGRAPHS: [string, string][] = [
  ['shch', 'щ'], ['sch', 'ш'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['tz', 'ц'], ['th', 'т'], ['ph', 'ф'],
  ['ck', 'к'], ['qu', 'кв'], ['gh', 'г'], ['ee', 'и'], ['oo', 'у'], ['ou', 'у'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'], ['ye', 'е'],
  ['sz', 'с'], ['cs', 'ч'], ['zs', 'ж'],
];

const LETTERS: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р',
  s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', z: 'з',
};

/** A name of the map in Russian letters, by sound: "Garvasota" — "Гарвасота". For names the language does not decline. */
export function transliterate(name: string): string {
  return name.replace(/[A-Za-z]+/g, (word) => {
    // a German -ach at the end is "ах": Herbach — Хербах
    const lower = word.toLowerCase().replace(/ach$/, 'akh');
    let out = '';
    for (let i = 0; i < lower.length; ) {
      const pair = DIGRAPHS.find(([from]) => lower.startsWith(from, i));
      if (pair) {
        out += pair[1];
        i += pair[0].length;
        continue;
      }
      const ch = lower[i] ?? '';
      const next = lower[i + 1] ?? '';
      if (ch === 'c') out += 'eiy'.includes(next) && next !== '' ? 'с' : 'к';
      else if (ch === 'e') out += i === 0 ? 'э' : 'е';
      else if (ch === 'y') out += i > 0 && 'аеиоуэяюё'.includes(out.at(-1) ?? '') ? 'й' : 'и';
      else out += LETTERS[ch] ?? ch;
      i++;
    }
    return word[0] === word[0]?.toUpperCase() ? (out[0] ?? '').toUpperCase() + out.slice(1) : out;
  });
}

/**
 * A name drawn on the map in the language chosen (RU.1): a sea or a land by its Russian name, a name the language
 * declines by its form, any other name of the map in Russian letters.
 */
export function mapName(name: string): string {
  if (lang !== 'ru') return name;
  let drawn = MAP_NAMES.get(name);
  if (drawn === undefined) {
    const declined = RU_MAP_NAMES[name] ?? localName(name);
    drawn = declined !== name || !/[A-Za-z]/.test(name) ? declined : transliterate(name);
    MAP_NAMES.set(name, drawn);
  }
  return drawn;
}

/** The Russian names of the map once made: the map draws them every frame. */
const MAP_NAMES = new Map<string, string>();
