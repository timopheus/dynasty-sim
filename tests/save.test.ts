import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { play as step, newGame } from '../src/core/game';
import { decodeCompact, encodeCompact } from '../src/core/save/compact';
import { SAVE_VERSION, deserialize, jsonProblems, readSave, readSaveParts, saveParts, savedContentVersion, serialize } from '../src/core/save/save';
import { contentVersion } from '../src/core/save/content-version';
import { applyRecorded, newJournal, readJournal, replay } from '../src/core/save/journal';
import { runSim } from '../src/core/sim';
import type { Content } from '../src/core/content/schema';
import { seedRng } from '../src/core/rng';
import { fromYmd, START_YEAR } from '../src/core/time/calendar';
import { BASE_FILES, fixtureContent, fixtureNarrator, realContent } from './fixtures/content';

describe('saves', () => {
  it('continues identically after a JSON save and load mid-game', () => {
    const content = fixtureNarrator({ eventChancePer10k: 5000, minDaysBetweenEvents: 2 });
    const original = newGame(99, content);
    step(original, content, { type: 'start', actionId: 'rest' });
    expect(original.status).toBe('awaiting_choice');
    const loaded = deserialize(serialize(original), content);
    expect(loaded).toEqual(original);

    const play = (s: typeof original) => {
      for (let i = 0; i < 50; i++) {
        step(s, content, s.status === 'awaiting_choice' ? { type: 'choose', option: 1 } : { type: 'start', actionId: 'rest' });
      }
    };
    play(original);
    play(loaded);
    expect(serialize(loaded)).toBe(serialize(original));
  });

  it('refuses a broken save', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(() => deserialize(serialize(state).replace(`"version":${SAVE_VERSION}`, '"version":999'), content)).toThrow(/version/);
    expect(() => deserialize(serialize({ ...state, playerId: 'c404' }), content)).toThrow(/player/);
  });

  it('refuses to save a state that is not plain JSON', () => {
    const state = newGame(1, fixtureContent());
    expect(jsonProblems(state)).toEqual([]);
    expect(jsonProblems({ a: [1, undefined] })).toEqual(['state.a[1] is undefined']);
    expect(jsonProblems({ a: new Map() })).toEqual(['state.a is not a plain object']);
    expect(jsonProblems({ a: NaN })).toEqual(['state.a is NaN']);
    expect(() => serialize({ ...state, day: Infinity })).toThrow(/plain JSON/);
  });

  // Guard for every module (2.1): whatever a module keeps in the state must survive a save.
  it('gives the same state after a save and load after every command of a 20-year run', () => {
    const content = realContent();
    const seed = 3;
    const endDay = fromYmd(START_YEAR + 20, 1, 1);
    const straight = newGame(seed, content);
    let reloaded = deserialize(serialize(newGame(seed, content)), content);
    const botA = seedRng(seed, 1);
    const botB = seedRng(seed, 1);
    let steps = 0;
    while (straight.day < endDay) {
      step(straight, content, botCommand(straight, content, botA));
      step(reloaded, content, botCommand(reloaded, content, botB));
      reloaded = deserialize(serialize(reloaded), content);
      expect(reloaded).toEqual(straight);
      steps += 1;
    }
    expect(steps).toBeGreaterThan(100);
    // From the eleventh year on the archive phase makes a chunk a year (D-312): they survive too.
    expect(straight.archive.length).toBeGreaterThan(5);
    // ~3 s alone, more under the load of the whole suite: the default 5 s is too tight.
  }, 30_000);

  it('readSave refuses another version before looking at the rest, and never throws', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(readSave(serialize(state), content)).toEqual({ ok: true, state });
    const old = readSave(JSON.stringify({ version: SAVE_VERSION - 1, anything: 'else' }), content);
    expect(old).toMatchObject({ ok: false, reason: 'old_version' });
    expect(readSave(JSON.stringify({ ...state, version: SAVE_VERSION + 1 }), content)).toMatchObject({ ok: false, reason: 'old_version' });
    // A save of the format before 3.14: the state itself, uncompacted.
    expect(readSave(JSON.stringify({ ...state, version: 8 }), content)).toMatchObject({ ok: false, reason: 'old_version' });
    expect(readSave(JSON.stringify({ no: 'version' }), content)).toMatchObject({ ok: false, reason: 'old_version' });
    const junks = [
      '',
      '{',
      'null',
      '[]',
      '42',
      JSON.stringify({ version: SAVE_VERSION }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [], state: [0] }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [['a']], state: [0, 1, 2] }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [['__proto__']], state: [0, {}] }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [['a', 'a']], state: [0, 1, 2] }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [], state: { day: 1 } }),
      JSON.stringify({ version: SAVE_VERSION, shapes: [], state: ['#', 1] }),
    ];
    for (const junk of junks) {
      expect(readSave(junk, content)).toMatchObject({ ok: false, reason: 'corrupt' });
    }
    expect(readSave(serialize({ ...state, playerId: 'c404' }), content)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('writes objects by a table of shapes and reads back exactly the same data', () => {
    const value = {
      b: 1,
      a: [{ id: 'c1', name: 'Anne' }, ' and ', { id: 'c2', name: 'Bob' }],
      nums: [3, -1, 0],
      marks: ['#', 'x'],
      nested: [[1, 2], [], [{}], [null, true]],
      empty: {},
      '10': { z: null, y: [{ y: 1, z: 2 }] },
    };
    const { shapes, data } = encodeCompact(value);
    expect(shapes).toContainEqual(['id', 'name']);
    const back = decodeCompact(JSON.parse(JSON.stringify(shapes)), JSON.parse(JSON.stringify(data)));
    expect(back).toEqual(value);
    expect(JSON.stringify(back)).toBe(JSON.stringify(value));
  });

  it('keeps the key order of the state, so a reloaded state saves to the same text', () => {
    const content = realContent();
    const state = newGame(5, content);
    const loaded = deserialize(serialize(state), content);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(state));
    expect(serialize(state).length).toBeLessThan(JSON.stringify(state).length);
  });
});

describe('hot part and archive in the save (D-312, D-336)', () => {
  const content = realContent();
  const { state } = runSim(content, { seed: 7, years: 30 });

  it('keeps the chunks apart from the hot part, and reads them back as one state', () => {
    expect(state.archive.length).toBeGreaterThan(10);
    const parts = saveParts(state, 'v1');
    expect(parts.chunks).toHaveLength(state.archive.length);
    expect(JSON.parse(parts.hot)).toMatchObject({ version: SAVE_VERSION, content: 'v1', archive: state.archive.length });
    // Nobody archived is in the hot part.
    for (const c of state.archive.flatMap((chunk) => chunk.characters)) expect(parts.hot).not.toContain(`"${c.id}"`);
    expect(readSaveParts(parts, content, 'v1')).toEqual({ ok: true, state });
    expect(readSave(serialize(state, 'v1'), content, 'v1')).toEqual({ ok: true, state });
    expect(savedContentVersion(parts.hot)).toBe('v1');
    expect(savedContentVersion(serialize(state, 'v1'))).toBe('v1');
  });

  it('refuses a chunk missing, out of place or of another format', () => {
    const parts = saveParts(state, 'v1');
    expect(readSaveParts({ ...parts, chunks: parts.chunks.slice(1) }, content)).toMatchObject({ ok: false, reason: 'corrupt' });
    const swapped = [parts.chunks[1] as string, parts.chunks[0] as string, ...parts.chunks.slice(2)];
    expect(readSaveParts({ ...parts, chunks: swapped }, content)).toMatchObject({ ok: false, reason: 'corrupt', message: /chunk 0/ });
    const old = parts.chunks.map((c, i) => (i === 3 ? c.replace(`"version":${SAVE_VERSION}`, '"version":1') : c));
    expect(readSaveParts({ ...parts, chunks: old }, content)).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(readSaveParts({ ...parts, hot: parts.hot.replace(`"version":${SAVE_VERSION}`, '"version":1') }, content)).toMatchObject({ ok: false, reason: 'old_version' });
    expect(readSaveParts({ hot: '{', chunks: [] }, content)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('a save that no longer fits a changed content is content_changed, on the same content corrupt (D-202)', () => {
    // An id gone from the content: a trait someone in the archive holds.
    const held = new Set(state.archive.flatMap((c) => c.characters.flatMap((p) => p.traits)));
    const trait = [...held][0] as string;
    const gone: Content = { ...content, traits: content.traits.filter((t) => t.id !== trait) };
    const json = serialize(state, 'v1');
    expect(readSave(json, gone, 'v2')).toMatchObject({ ok: false, reason: 'content_changed', message: new RegExp(trait) });
    expect(readSave(json, gone, 'v1')).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(readSave(json, gone)).toMatchObject({ ok: false, reason: 'corrupt' });
    // Another version of a content the save still fits: it loads.
    expect(readSave(json, content, 'v2')).toEqual({ ok: true, state });
  });
});

describe('content version and journal of commands (D-202, D-338)', () => {
  it('the content version is a pure hash of paths and texts', () => {
    const v = contentVersion(BASE_FILES);
    expect(v).toMatch(/^[0-9a-f]{16}$/);
    expect(contentVersion(BASE_FILES)).toBe(v);
    const [first, ...rest] = BASE_FILES;
    if (!first) throw new Error('no files');
    expect(contentVersion([{ ...first, text: first.text + ' ' }, ...rest])).not.toBe(v);
    expect(contentVersion([{ ...first, path: first.path + 'x' }, ...rest])).not.toBe(v);
    expect(contentVersion([{ path: 'ab', text: 'c' }])).not.toBe(contentVersion([{ path: 'a', text: 'bc' }]));
  });

  it('replays a recorded game into the same state', () => {
    const content = realContent();
    const state = newGame(12, content);
    const journal = newJournal(12, 'v1');
    const bot = seedRng(12, 1);
    while (state.day < fromYmd(START_YEAR + 25, 1, 1)) applyRecorded(journal, state, content, botCommand(state, content, bot));
    expect(state.archive.length).toBeGreaterThan(0);
    const read = readJournal(JSON.stringify(journal));
    if (!read.ok) throw new Error(read.message);
    expect(replay(content, read.journal)).toEqual(state);
  }, 30_000);

  it('a refused command is not recorded; a broken journal is refused with a reason', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    const journal = newJournal(1, '');
    expect(() => applyRecorded(journal, state, content, { type: 'start', actionId: 'no_such_action' })).toThrow();
    expect(journal.commands).toEqual([]);
    expect(() => replay(content, { ...journal, commands: [{ type: 'choose', option: 5 }] })).toThrow(/Command 1 \(choose\)/);
    expect(readJournal('{')).toMatchObject({ ok: false });
    expect(readJournal(JSON.stringify({ ...journal, journal: 99 }))).toMatchObject({ ok: false });
    expect(readJournal(JSON.stringify({ ...journal, commands: [{ type: 'fly' }] }))).toMatchObject({ ok: false, message: /Command 1/ });
  });
});
