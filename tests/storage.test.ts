import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { newGame } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { applyRecorded, newJournal, type Journal } from '../src/core/save/journal';
import { SAVE_VERSION } from '../src/core/save/save';
import type { GameState } from '../src/core/state';
import { fromYmd, START_YEAR } from '../src/core/time/calendar';
import { waitDay } from '../src/ui/clock-model';
import { OLD_SAVE_KEY, dropOldSave, clearGame, loadGame, saveGame, startGame, type AsyncStore, type Saved, type StoreName, type StoreOp } from '../src/ui/storage';
import { fixtureContent, realContent } from './fixtures/content';

type Data = Record<StoreName, Map<string | number, string>>;

const named = (name: string) => Object.assign(new Error(name), { name });

/**
 * A fake asynchronous IndexedDB: a transaction applies to a copy and lands only if every op went through; `add` of a
 * key already there fails it with a ConstraintError, as IndexedDB does. `failAfter` fails the next transaction after
 * that many ops (a full disk mid-write).
 */
function fakeStore(): AsyncStore & { data: Data; failAfter: number | null; log: StoreOp[][] } {
  const empty = (): Data => ({ save: new Map(), chunks: new Map(), commands: new Map() });
  const store = {
    data: empty(),
    failAfter: null as number | null,
    log: [] as StoreOp[][],
    async run(ops: readonly StoreOp[]) {
      await Promise.resolve();
      store.log.push([...ops]);
      const copy: Data = { save: new Map(store.data.save), chunks: new Map(store.data.chunks), commands: new Map(store.data.commands) };
      ops.forEach((op, i) => {
        if (store.failAfter !== null && i >= store.failAfter) {
          store.failAfter = null;
          throw named('QuotaExceededError');
        }
        if (op.kind === 'clear') copy[op.store].clear();
        else if (op.kind === 'expect') {
          if (copy[op.store].get(op.key) !== op.value) throw named('ConstraintError');
        } else if (op.kind === 'add' && copy[op.store].has(op.key)) throw named('ConstraintError');
        else copy[op.store].set(op.key, op.value);
      });
      store.data = copy;
    },
    async readAll() {
      await Promise.resolve();
      const sorted = (name: StoreName) => [...store.data[name].entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => ({ key, value }));
      return { save: sorted('save'), chunks: sorted('chunks'), commands: sorted('commands') };
    },
  };
  return store;
}

/** A game of the random bot for `years`, every command in the journal, saved after each (as main.ts does). */
async function play(store: AsyncStore, content: Content, seed: number, years: number): Promise<{ state: GameState; journal: Journal; saved: Saved }> {
  const state = newGame(seed, content);
  const journal = newJournal(seed, 'v1');
  const { outcome, saved } = await startGame(store, state, journal, 'v1', `game${seed}`);
  expect(outcome).toEqual({ ok: true });
  const bot = seedRng(seed, 1);
  const end = fromYmd(START_YEAR + years, 1, 1);
  while (state.day < end) {
    applyRecorded(journal, state, content, botCommand(state, content, bot));
    expect(await saveGame(store, state, journal, saved, 'v1')).toEqual({ ok: true });
  }
  return { state, journal, saved };
}

describe('autosave in IndexedDB (D-234)', () => {
  const content = realContent();

  it('has nothing at first, then continues the game: the hot part, every chunk and the whole journal', async () => {
    const store = fakeStore();
    expect(await loadGame(store, content, 'v1')).toEqual({ kind: 'none' });
    const { state, journal, saved } = await play(store, content, 4, 14);
    expect(state.archive.length).toBeGreaterThan(0);
    expect(saved).toEqual({ game: 'game4', chunks: state.archive.length, commands: journal.commands.length });
    expect(await loadGame(store, content, 'v1')).toEqual({ kind: 'loaded', state, journal, saved });
    // A chunk and a command are written once; the hot part every time.
    for (const ops of store.log.slice(1)) {
      expect(ops[0]).toMatchObject({ kind: 'expect', store: 'save', key: 'game', value: 'game4' });
      expect(ops[1]).toMatchObject({ kind: 'put', store: 'save', key: 'hot' });
      expect(ops.filter((op) => op.kind === 'add' && op.store === 'commands')).toHaveLength(1);
    }
    const chunkWrites = store.log.flat().filter((op) => op.kind === 'add' && op.store === 'chunks');
    expect(chunkWrites.map((op) => (op as { key: number }).key)).toEqual(state.archive.map((_, i) => i));
    await clearGame(store);
    expect(await loadGame(store, content, 'v1')).toEqual({ kind: 'none' });
  }, 30_000);

  it('keeps a wait the clock glued days to after it was saved (S.8): the journal loads as it is played', async () => {
    const store = fakeStore();
    const { state, journal, saved } = await play(store, content, 8, 1);
    while (state.status !== 'awaiting_action') applyRecorded(journal, state, content, botCommand(state, content, seedRng(8, 2)));
    applyRecorded(journal, state, content, { type: 'start', actionId: 'live' });
    for (let i = 0; i < 3 && state.status === 'running'; i++) waitDay(journal, state, content);
    expect(await saveGame(store, state, journal, saved, 'v1')).toEqual({ ok: true });
    for (let i = 0; i < 3 && state.status === 'running'; i++) waitDay(journal, state, content);
    expect(await saveGame(store, state, journal, saved, 'v1')).toEqual({ ok: true });
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'loaded', journal: { commands: journal.commands } });
  }, 30_000);

  it('writes a whole transaction or nothing: a failed write keeps the previous save and what is counted as saved', async () => {
    const store = fakeStore();
    const { state, journal, saved } = await play(store, content, 6, 11);
    const before = structuredClone(store.data);
    const savedBefore = { ...saved };
    const bot = seedRng(99, 1);
    applyRecorded(journal, state, content, botCommand(state, content, bot));
    store.failAfter = 1;
    expect(await saveGame(store, state, journal, saved, 'v1')).toMatchObject({ ok: false, reason: 'quota' });
    expect(store.data).toEqual(before);
    expect(saved).toEqual(savedBefore);
    // The next write carries the command left over.
    expect(await saveGame(store, state, journal, saved, 'v1')).toEqual({ ok: true });
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'loaded', journal: { commands: journal.commands } });
  }, 30_000);

  it('refuses a second write of a chunk or a command: a second tab cannot overwrite the first', async () => {
    const store = fakeStore();
    await play(store, content, 2, 11);
    const a = await loadGame(store, content, 'v1');
    const b = await loadGame(store, content, 'v1');
    if (a.kind !== 'loaded' || b.kind !== 'loaded') throw new Error('not loaded');
    applyRecorded(a.journal, a.state, content, botCommand(a.state, content, seedRng(1, 1)));
    expect(await saveGame(store, a.state, a.journal, a.saved, 'v1')).toEqual({ ok: true });
    const afterA = structuredClone(store.data);
    applyRecorded(b.journal, b.state, content, botCommand(b.state, content, seedRng(2, 1)));
    expect(await saveGame(store, b.state, b.journal, b.saved, 'v1')).toMatchObject({ ok: false, reason: 'conflict' });
    expect(store.data).toEqual(afterA);
    // A chunk written again by hand is refused the same way.
    await expect(store.run([{ kind: 'add', store: 'chunks', key: 0, value: 'x' }])).rejects.toMatchObject({ name: 'ConstraintError' });
  }, 30_000);

  it('a tab still playing a replaced game never writes into the new one (D-339)', async () => {
    const store = fakeStore();
    await play(store, content, 2, 11);
    const b = await loadGame(store, content, 'v1');
    if (b.kind !== 'loaded') throw new Error('not loaded');
    expect(b.state.archive.length).toBeGreaterThan(0);
    // Another tab begins a new game: numbers of chunks and commands start again from 0.
    const fresh = newGame(5, content);
    expect((await startGame(store, fresh, newJournal(5, 'v1'), 'v1', 'new')).outcome).toEqual({ ok: true });
    const afterNew = structuredClone(store.data);
    applyRecorded(b.journal, b.state, content, botCommand(b.state, content, seedRng(2, 1)));
    expect(await saveGame(store, b.state, b.journal, b.saved, 'v1')).toMatchObject({ ok: false, reason: 'conflict' });
    expect(store.data).toEqual(afterNew);
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'loaded', state: fresh, journal: { seed: 5 } });
  }, 30_000);

  it('refuses chunks or commands with a gap in their numbers', async () => {
    const store = fakeStore();
    await play(store, content, 3, 11);
    const last = store.data.chunks.size - 1;
    store.data.chunks.set(last + 5, store.data.chunks.get(last) as string);
    store.data.chunks.delete(last);
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'discarded', reason: 'corrupt', message: /in a row/ });
  }, 30_000);

  it('discards a save of another format, a broken one, and one that no longer fits the content, offering the journal', async () => {
    const store = fakeStore();
    const state = newGame(1, content);
    await startGame(store, state, newJournal(1, 'v1'), 'v1', 'g');
    expect(state.characters.some((c) => c.traits.length > 0)).toBe(true);
    // Traits gone from the content: on another content version that is a changed content (D-202), on the same a broken save.
    const gone: Content = { ...content, traits: [] };
    expect(await loadGame(store, gone, 'v2')).toMatchObject({ kind: 'discarded', reason: 'content_changed', journal: { seed: 1, content: 'v1', commands: [] } });
    expect(await loadGame(store, gone, 'v1')).toMatchObject({ kind: 'discarded', reason: 'corrupt' });
    // A changed content that the save still fits loads without a word (D-202).
    expect(await loadGame(store, content, 'v2')).toMatchObject({ kind: 'loaded' });
    store.data.save.set('hot', '{oops');
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'discarded', reason: 'corrupt', journal: { seed: 1 } });
    store.data.save.set('hot', JSON.stringify({ version: SAVE_VERSION - 1 }));
    expect(await loadGame(store, content, 'v1')).toMatchObject({ kind: 'discarded', reason: 'old_version' });
  });

  it('copes with missing or throwing storage', async () => {
    const state = newGame(3, fixtureContent());
    const journal = newJournal(3, '');
    const saved = { game: 'g', chunks: 0, commands: 0 };
    expect(await saveGame(null, state, journal, saved, '')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await loadGame(null, fixtureContent(), '')).toEqual({ kind: 'none' });
    const broken: AsyncStore = { run: () => Promise.reject(new Error('denied')), readAll: () => Promise.reject(new Error('denied')) };
    expect(await saveGame(broken, state, journal, saved, '')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect((await startGame(broken, state, journal, '', 'g')).outcome).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await loadGame(broken, fixtureContent(), '')).toMatchObject({ kind: 'discarded', reason: 'unreadable' });
    await expect(clearGame(broken)).resolves.toBeUndefined();
  });

  it('removes the old localStorage cell and survives a storage that throws', () => {
    const data = new Map([[OLD_SAVE_KEY, '{}'], ['other', 'x']]);
    dropOldSave({ removeItem: (k) => void data.delete(k) });
    expect([...data.keys()]).toEqual(['other']);
    expect(() => dropOldSave({ removeItem: () => { throw new Error('denied'); } })).not.toThrow();
    expect(() => dropOldSave(null)).not.toThrow();
  });
});
