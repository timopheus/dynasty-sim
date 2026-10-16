import type { FamilyState, Marriage } from './family';

/**
 * Marriage records that go to the archive (D-312, D-335; the same rule as the records of relations): a record goes
 * when both spouses are dead and at least one of them goes to the archive now. A marriage with a living spouse stays
 * (familyRefs keeps both spouses hot): the rules and the hero's family read it. A record of the dead is history; it may
 * name someone who stays hot for a while — the archive is read together with the hot part (`allMarriages`).
 */

function goes(m: Marriage, leaving: ReadonlySet<string>, dead: (id: string) => boolean): boolean {
  return dead(m.a) && dead(m.b) && (leaving.has(m.a) || leaving.has(m.b));
}

/** Takes the records that go out of the state, in their order; the rest stay in order. */
export function takeMarriages(state: Pick<FamilyState, 'marriages'>, leaving: ReadonlySet<string>, dead: (id: string) => boolean): Marriage[] {
  const gone: Marriage[] = [];
  const kept: Marriage[] = [];
  for (const m of state.marriages) (goes(m, leaving, dead) ? gone : kept).push(m);
  if (gone.length > 0) state.marriages = kept;
  return gone;
}

/** Leaving people that a record staying hot still names (none, if the rule above and familyRefs agree). */
export function marriagesHeld(state: Pick<FamilyState, 'marriages'>, leaving: ReadonlySet<string>, dead: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const m of state.marriages) {
    if (goes(m, leaving, dead)) continue;
    for (const id of [m.a, m.b]) if (leaving.has(id)) out.push(id);
  }
  return out;
}

/** Problems of archived marriage records: ended, and naming people known somewhere. */
export function marriagesArchiveProblems(marriages: readonly Marriage[], known: (id: string) => boolean): string[] {
  const problems: string[] = [];
  for (const m of marriages) {
    if (m.end === null) problems.push(`marriage ${m.a} - ${m.b} is archived but lasts`);
    for (const id of [m.a, m.b]) if (!known(id)) problems.push(`marriage ${m.a} - ${m.b} names unknown character ${id}`);
  }
  return problems;
}
