import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content/load';
import type { Content } from '../src/core/content/schema';
import { RU_CORE } from '../src/core/lang/phrases-ru';
import { comparePlaceholders } from '../src/core/lang/content';
import { localName } from '../src/core/lang/phrases';
import { setStrictForms } from '../src/core/text/forms';
import { runSim } from '../src/core/sim';
import { mapName, setLang, transliterate } from '../src/ui/i18n';
import { RU } from '../src/ui/i18n-ru';
import { readContentFiles } from '../tools/content-files';

const files = readContentFiles();
const en = loadContent(files);
const ru = loadContent([...files, ...readContentFiles('lang/ru')]);
if (!en.ok || !ru.ok) throw new Error('the content does not load');
const english: Content = en.content;
const russian: Content = ru.content;

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8'));
}

/** The literal first arguments of calls to `name` in the sources (quoted with ' or "). */
function keys(texts: string[], call: RegExp): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(call)) out.add((m[1] ?? m[2] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  return [...out];
}

describe('RU.1: Russian, the second language (D-476)', () => {
  it('every text of the interface has its Russian, with the same placeholders', () => {
    const used = keys(sources('src/ui'), /\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g);
    expect(used.length).toBeGreaterThan(150);
    const missing = used.filter((k) => !Object.hasOwn(RU, k));
    expect(missing).toEqual([]);
    for (const [k, v] of Object.entries(RU)) {
      const vars = (s: string) => [...s.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(',');
      expect(vars(v), `"${k}"`).toBe(vars(k));
    }
  });

  it('every word the core makes has its Russian, with the same placeholders', () => {
    const used = keys(sources('src/core'), /\bphrase\(\s*[a-zA-Z.]+,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g);
    expect(used.length).toBeGreaterThan(30);
    expect(used.filter((k) => !Object.hasOwn(RU_CORE, k))).toEqual([]);
    for (const [k, v] of Object.entries(RU_CORE)) {
      const vars = (s: string) => [...s.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(',');
      expect(vars(v), `"${k}"`).toBe(vars(k));
    }
  });

  it('the Russian content translates every text and declines the names of people and places', () => {
    expect(russian.language?.id).toBe('ru');
    expect(russian.events.length).toBe(english.events.length);
    expect(russian.events[0]?.text).not.toBe(english.events[0]?.text);
    // the names of people stay English (declined on screen); the words around them are translated
    expect(russian.names.given).toEqual(english.names.given);
    expect(russian.names.surnames).toEqual(english.names.surnames);
    expect(russian.names.stats.diplomacy).toBe('Дипломатия');
    expect(localName(russian, 'Thomas Holloway', 'gen')).toBe('Томаса Холлоуэя');
    expect(localName(russian, 'Anne Calder', 'dat')).toBe('Энн Колдер');
    expect(localName(russian, 'Остмер', 'prep')).toBe('Остмере');
    expect(localName(english, 'Thomas Holloway', 'gen')).toBe('Thomas Holloway');
    expect(comparePlaceholders('{name} met {friend}.', '{name} {~встретил|встретила} {friend:acc}.')).toBeNull();
    expect(comparePlaceholders('{name} met {friend}.', '{name} {~встретил|встретила} кого-то.')).toMatch(/leaves out/);
  });

  it('names the map in Russian: the seas by their words, the other names in Russian letters', () => {
    expect(transliterate('Garvasota')).toBe('Гарвасота');
    expect(transliterate('Herbach')).toBe('Хербах');
    expect(transliterate('Meschevsk')).toBe('Мешевск');
    expect(transliterate('Yardem Ok')).toBe('Ярдем Ок');
    try {
      setLang('ru');
      expect(mapName('Inner Sea (west)')).toBe('Внутреннее море (запад)');
      expect(mapName('Golgi')).toBe('Голги');
      setLang('en');
      expect(mapName('Golgi')).toBe('Golgi');
    } finally {
      setLang('en');
    }
  });

  it('the same seed gives the same game in both languages; only the words differ', () => {
    const a = runSim(english, { seed: 3, years: 30 });
    // strict: a line that names a person without the sex fails here instead of taking the first form
    setStrictForms(true);
    let b: typeof a;
    try {
      b = runSim(russian, { seed: 3, years: 30 });
    } finally {
      setStrictForms(false);
    }
    const world = (s: typeof a.state) => ({
      day: s.day,
      rng: s.rng,
      nextId: s.nextId,
      people: s.characters.map((c) => [c.id, c.givenName, c.surname, c.birthDay, c.deathDay, c.money, c.traits.join(',')]),
      chronicle: s.chronicle.map((e) => [e.day, e.subject, e.kind, e.level]),
      contracts: s.contracts,
      favors: s.favors,
    });
    expect(world(b.state)).toEqual(world(a.state));
    const text = b.state.chronicle.map((e) => e.parts.map((p) => (typeof p === 'string' ? p : p.name)).join('')).join('\n');
    expect(text).toMatch(/[а-яё]/i);
    expect(text).not.toMatch(/[{}]/);
  }, 60_000);
});
