import type { Content } from '../content/schema';
import { isInt } from '../helpers';
import type { RelationsState } from './relations';
import type { Acquaintance, OpinionReason, Relation, Secret } from './types';

/**
 * Records of opinions, acquaintance, ended relations and secrets that go to the archive with their people (D-312).
 * A record goes only when every person it names goes; an active relation never goes. The archive phase asks
 * `relationsHeld` which of the leaving people a record that stays still names, keeps them hot and asks again.
 */
export interface RelationsArchive {
  opinionReasons: OpinionReason[];
  relations: Relation[];
  acquaintances: Acquaintance[];
  secrets: Secret[];
}

type Records = Pick<RelationsState, 'opinionReasons' | 'relations' | 'acquaintances' | 'secrets'>;

/** Every person a record names, and whether it may go to the archive at all. */
function recordsOf(part: Records): { people: string[]; movable: boolean }[] {
  return [
    ...part.opinionReasons.map((r) => ({ people: [r.holder, r.target], movable: true })),
    ...part.relations.map((r) => ({ people: [r.a, r.b], movable: r.end !== null })),
    ...part.acquaintances.map((a) => ({ people: [a.holder, a.other], movable: true })),
    ...part.secrets.map((s) => ({ people: [s.about, ...s.knownBy], movable: true })),
  ];
}

const goes = (people: readonly string[], leaving: ReadonlySet<string>) => people.every((id) => leaving.has(id));

/** Leaving people that a record staying hot still names: they must stay too. A pure query. */
export function relationsHeld(state: Records, leaving: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const { people, movable } of recordsOf(state)) {
    if (movable && goes(people, leaving)) continue;
    for (const id of people) if (leaving.has(id)) out.push(id);
  }
  return out;
}

/**
 * Takes out of the state the records whose people all leave (and that may go), in their order; the rest stay in
 * order. Call only after `relationsHeld` gives nothing, or a record left behind names someone who is gone.
 */
export function takeRelations(state: Records, leaving: ReadonlySet<string>): RelationsArchive {
  const split = <T>(list: T[], people: (x: T) => string[], movable: (x: T) => boolean = () => true) => {
    const gone: T[] = [];
    const kept: T[] = [];
    for (const x of list) (movable(x) && goes(people(x), leaving) ? gone : kept).push(x);
    return { gone, kept };
  };
  const opinions = split(state.opinionReasons, (r) => [r.holder, r.target]);
  const relations = split(state.relations, (r) => [r.a, r.b], (r) => r.end !== null);
  const acquaintances = split(state.acquaintances, (a) => [a.holder, a.other]);
  const secrets = split(state.secrets, (s) => [s.about, ...s.knownBy]);
  state.opinionReasons = opinions.kept;
  state.relations = relations.kept;
  state.acquaintances = acquaintances.kept;
  state.secrets = secrets.kept;
  return { opinionReasons: opinions.gone, relations: relations.gone, acquaintances: acquaintances.gone, secrets: secrets.gone };
}

export function relationsArchiveSize(part: RelationsArchive): number {
  return part.opinionReasons.length + part.relations.length + part.acquaintances.length + part.secrets.length;
}

/**
 * Problems of an archived part: every person it names is in `known` (the archive and the hot part), relations have
 * ended, reasons and kinds are in the content. A changed content shows up here (D-202).
 */
export function relationsArchiveProblems(part: RelationsArchive, known: (id: string) => boolean, content: Content): string[] {
  const problems: string[] = [];
  const reasons = new Set(content.opinions?.reasons.map((r) => r.id) ?? []);
  const kinds = new Set(content.opinions?.relations.map((k) => k.id) ?? []);
  for (const { people } of recordsOf(part)) {
    for (const id of people) if (!known(id)) problems.push(`archived record names unknown character ${id}`);
  }
  for (const r of part.opinionReasons) {
    if (!reasons.has(r.reason)) problems.push(`archived opinion ${r.holder} -> ${r.target}: unknown reason ${r.reason}`);
    if (!isInt(r.day) || !isInt(r.value)) problems.push(`archived opinion ${r.holder} -> ${r.target}: bad numbers`);
  }
  for (const r of part.relations) {
    if (!kinds.has(r.kind)) problems.push(`archived relation ${r.id}: unknown kind ${r.kind}`);
    if (r.end === null) problems.push(`archived relation ${r.id} has not ended`);
  }
  return problems;
}
