import { afterEach, describe, expect, it, vi } from 'vitest';
import { allChronicle, allCharacters, anyCharacter, archiveProblems } from '../src/core/archive/archive';
import { archivePhase, HOT_YEARS } from '../src/core/archive/phases';
import { chronicleMarkdown, journalMarkdown } from '../src/core/chronicle/markdown';
import type { ChronicleEntry } from '../src/core/chronicle/log';
import { newGame } from '../src/core/game';
import { findCharacter } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { checkInvariants } from '../src/core/invariants';
import { computeMetrics } from '../src/core/metrics';
import { personPage } from '../src/core/pages/person';
import { runSim } from '../src/core/sim';
import type { Character, Ctx } from '../src/core/state';
import { fromYmd } from '../src/core/time/calendar';
import { realContent } from './fixtures/content';

const content = realContent();
// Without families (4.5): `setup` skips 21 years at once, and the kin of the start would grow up without occupations.
const noFamilies = { ...content, family: null };

afterEach(() => {
  vi.restoreAllMocks();
});

/** A game on 1 January 1721 with people made for the test; the archive phase has not looked at 1721 yet. */
function setup() {
  const state = newGame(11, noFamilies);
  const ctx: Ctx = { state, content };
  state.day = fromYmd(1721, 1, 1);
  state.archiveYear = 1720;
  const person = (deathYear: number | null, spec: { father?: string } = {}): Character => {
    const c = createCharacter(ctx, { surname: 'Test', age: deathYear === null ? { min: 5, max: 5 } : { min: 60, max: 60 }, ...spec });
    if (deathYear !== null) {
      c.deathDay = fromYmd(deathYear, 6, 1);
      c.deathCause = 'old_age';
    }
    return c;
  };
  const line = (year: number, subject: Character, link?: Character): ChronicleEntry => ({
    day: fromYmd(year, 3, 1),
    subject: subject.id,
    kind: 'test',
    level: 'journal',
    parts: link ? ['Met ', { id: link.id, name: link.givenName }, '.'] : ['A line.'],
  });
  return { state, ctx, person, line };
}

describe('archive phase (D-312, D-335)', () => {
  it('moves old lines, the long dead nobody hot names and their records; keeps parents, the named and the recent', () => {
    const { state, ctx, person, line } = setup();
    const hero = findCharacter(state, state.playerId) as Character;
    const old = person(1705);
    const oldFriend = person(1704);
    const recent = person(1715);
    const grandfather = person(1700);
    const father = person(1702, { father: grandfather.id });
    const child = person(null, { father: father.id });
    state.household.push(child.id);
    const namedHot = person(1700);
    const namedOld = person(1700);
    const heroKnew = person(1703);
    const oldLine = line(1705, old, namedOld);
    const hotLine = line(1715, recent, namedHot);
    state.chronicle = [oldLine, ...state.chronicle.filter((e) => e.day < fromYmd(1711, 1, 1)), hotLine].sort((a, b) => a.day - b.day);
    const reason = content.opinions?.reasons[0]?.id as string;
    const kind = content.opinions?.relations[0]?.id as string;
    const record = (holder: Character, target: Character) => ({ reason, holder: holder.id, target: target.id, day: fromYmd(1700, 1, 1), value: 10, end: null });
    state.opinionReasons.push(record(old, oldFriend), record(old, recent), record(heroKnew, hero));
    state.relations.push({ id: 'r9000', kind, a: old.id, b: oldFriend.id, start: 0, end: fromYmd(1704, 6, 1), endReason: 'death' });
    const nextId = state.nextId;
    const rng = [...state.rng];
    const hotLines = state.chronicle.filter((e) => e.day >= fromYmd(1721 - HOT_YEARS, 1, 1));
    const whole = allChronicle(state).length;
    expect(checkInvariants(state, content)).toEqual([]);

    expect(archivePhase.run(ctx)).toBe(false);

    expect(state.archive).toHaveLength(1);
    const chunk = state.archive[0];
    expect(chunk?.day).toBe(state.day);
    expect(chunk?.characters.map((c) => c.id)).toEqual([old.id, oldFriend.id, namedOld.id]);
    expect(chunk?.chronicle).toContain(oldLine);
    expect(chunk?.chronicle.every((e) => e.day < fromYmd(1711, 1, 1))).toBe(true);
    expect(state.chronicle).toEqual(hotLines);
    expect(allChronicle(state)).toHaveLength(whole);
    // Records go when everyone in them is dead and one of them leaves; a living person keeps the record and the dead one.
    expect(chunk?.relations.opinionReasons.map((r) => [r.holder, r.target])).toEqual([[old.id, oldFriend.id], [old.id, recent.id]]);
    expect(chunk?.relations.relations.map((r) => r.id)).toEqual(['r9000']);
    expect(state.opinionReasons.map((r) => r.holder)).toContain(heroKnew.id);
    for (const kept of [recent, grandfather, father, child, namedHot, heroKnew]) expect(findCharacter(state, kept.id)).toBe(kept);
    for (const gone of [old, oldFriend, namedOld]) {
      expect(findCharacter(state, gone.id)).toBeNull();
      expect(anyCharacter(state, gone.id)).toBe(gone);
    }
    expect(allCharacters(state)).toHaveLength(state.characters.length + 3);
    // No ids, no randomness: the run goes on the same.
    expect(state.nextId).toBe(nextId);
    expect(state.rng).toEqual(rng);
    expect(checkInvariants(state, content)).toEqual([]);
    expect(archiveProblems(state, content)).toEqual([]);

    // Pages read archived relations too: the ended tie of two of the long dead still shows (for someone the hero knows).
    state.acquaintances.push({ holder: hero.id, other: old.id, level: 'known', since: state.day, closeSince: null });
    const page = personPage(ctx, old.id);
    expect([...(page?.allies ?? []), ...(page?.rivals ?? [])].map((l) => l.person.id)).toEqual([oldFriend.id]);
    state.acquaintances.pop();

    // Once a year.
    expect(archivePhase.run(ctx)).toBe(false);
    expect(state.archive).toHaveLength(1);
    state.day = fromYmd(1722, 1, 1);
    archivePhase.run(ctx);
    expect(state.archiveYear).toBe(1722);
  });

  it('makes no chunk when nothing is old enough', () => {
    const { state, ctx } = setup();
    state.day = fromYmd(1705, 1, 1);
    state.archiveYear = null;
    archivePhase.run(ctx);
    expect(state.archive).toEqual([]);
    expect(state.archiveYear).toBe(1705);
  });

  it('does not change the story: a run with the archive and one without write the same chronicle (D-312)', () => {
    const a = runSim(content, { seed: 5, years: 40 });
    expect(a.violations).toEqual([]);
    expect(a.state.archive.length).toBeGreaterThan(20);
    vi.spyOn(archivePhase, 'run').mockReturnValue(false);
    const b = runSim(content, { seed: 5, years: 40 });
    expect(b.state.archive).toEqual([]);
    expect(chronicleMarkdown(a.state)).toBe(chronicleMarkdown(b.state));
    expect(journalMarkdown(a.state)).toBe(journalMarkdown(b.state));
    expect(a.state.rng).toEqual(b.state.rng);
    expect(a.state.nextId).toBe(b.state.nextId);
    expect(a.state.characters.length).toBeLessThan(b.state.characters.length);
    const sizes = { saveBytes: 0, hotBytes: 0, archiveBytes: 0 };
    expect({ ...computeMetrics(a.state), ...sizes }).toEqual({ ...computeMetrics(b.state), ...sizes });
    expect(computeMetrics(a.state).hotBytes).toBeLessThan(computeMetrics(b.state).hotBytes);
  }, 60_000);

  it('finds a broken archive: an id twice, the living in a chunk, lines out of order, unknown links', () => {
    const { state } = runSim(content, { seed: 8, years: 25 });
    expect(archiveProblems(state, content)).toEqual([]);
    const chunk = state.archive[0];
    if (!chunk) throw new Error('no chunk');
    const hero = state.characters[0] as Character;
    chunk.characters.push(hero);
    expect(archiveProblems(state, content).join('\n')).toMatch(/twice/);
    expect(archiveProblems(state, content).join('\n')).toMatch(/not long dead/);
    chunk.characters.pop();
    const first = chunk.chronicle[0] as ChronicleEntry;
    chunk.chronicle.push({ ...first, day: first.day - 1 });
    expect(archiveProblems(state, content).join('\n')).toMatch(/out of order/);
    chunk.chronicle.pop();
    chunk.chronicle.push({ ...first, subject: 'c999999' });
    expect(archiveProblems(state, content).join('\n')).toMatch(/unknown character c999999/);
    chunk.chronicle.pop();
    // A link to a house or an heirloom is checked by its kind in the hot state (D-425).
    const house = state.houses[0];
    if (!house) throw new Error('no house');
    const last = chunk.chronicle.at(-1) as ChronicleEntry;
    chunk.chronicle.push({ ...last, parts: [{ id: house.id, name: 'House' }] });
    expect(archiveProblems(state, content)).toEqual([]);
    chunk.chronicle.pop();
    chunk.chronicle.push({ ...last, parts: [{ id: 'h999999', name: 'House' }] });
    expect(archiveProblems(state, content).join('\n')).toMatch(/unknown entity h999999/);
    chunk.chronicle.pop();
    expect(archiveProblems(state, content)).toEqual([]);
  }, 30_000);
});
