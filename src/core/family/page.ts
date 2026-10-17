import { fullName } from '../character/character';
import { allCharacters, allMarriages, anyCharacter } from '../archive/archive';
import { findCharacter } from '../helpers';
import type { PageSection, PersonSection } from '../pages/person';
import type { Character, Ctx } from '../state';
import type { TextPart } from '../text/text';
import type { ProposeOrder } from './phases';
import { proposalOptions } from './proposals';

/**
 * Section "Family" of the page of a person (4.5): parents, spouses, children, the dead marked "(dead)"; and the
 * matches the player may propose from this page (D-313) as lines `Propose marriage` / `Propose a match`, whose parts
 * are the suitor and the target. The screen turns those lines into buttons (`proposalButton`). Strangers show only the
 * proposals: the player does not know their family. A pure query.
 */
export const PROPOSE_MARRIAGE = 'Propose marriage';
export const PROPOSE_MATCH = 'Propose a match';

function ref(c: Character): TextPart[] {
  return [{ id: c.id, name: fullName(c) }, ...(c.deathDay !== null ? [' (dead)'] : [])];
}

function list(people: readonly Character[]): TextPart[] {
  return people.flatMap((c, i) => [...(i > 0 ? [', '] : []), ...ref(c)]);
}

export const familySection: PersonSection = (ctx, c, level) => {
  const { state } = ctx;
  const lines: PageSection['lines'] = [];
  if (level !== 'stranger') {
    // The whole history: parents, spouses and children may be in the archive (D-312).
    for (const id of [c.father, c.mother]) {
      const p = id === null ? null : anyCharacter(state, id);
      if (p) lines.push({ label: p.sex === 'male' ? 'Father' : 'Mother', parts: ref(p) });
    }
    for (const m of allMarriages(state)) {
      if (m.a !== c.id && m.b !== c.id) continue;
      const spouse = anyCharacter(state, m.a === c.id ? m.b : m.a);
      if (!spouse) continue;
      const label = m.end === null ? (spouse.sex === 'male' ? 'Husband' : 'Wife') : spouse.sex === 'male' ? 'Late husband' : 'Late wife';
      lines.push({ label, parts: ref(spouse) });
    }
    // Eldest first: the order must not depend on which people the archive holds (allCharacters puts chunks first).
    const children = allCharacters(state)
      .filter((x) => x.father === c.id || x.mother === c.id)
      .sort((x, y) => x.birthDay - y.birthDay || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    if (children.length > 0) lines.push({ label: 'Children', parts: list(children) });
  }
  for (const o of proposalOptions(ctx, c.id)) {
    const suitor = findCharacter(state, o.suitor);
    const target = findCharacter(state, o.target);
    if (!suitor || !target) continue;
    const label = o.suitor === state.playerId ? PROPOSE_MARRIAGE : PROPOSE_MATCH;
    lines.push({ label, parts: [{ id: suitor.id, name: fullName(suitor) }, ' and ', { id: target.id, name: fullName(target) }] });
  }
  return lines.length > 0 ? { id: 'family', title: 'Family', lines } : null;
};

/**
 * A proposal line of the family section as a button: its text and the command order, or null for any other line.
 * The suitor is the first link of the line, the target the second.
 */
export function proposalButton(line: PageSection['lines'][number]): { text: string; order: ProposeOrder } | null {
  if (line.label !== PROPOSE_MARRIAGE && line.label !== PROPOSE_MATCH) return null;
  const [suitor, target] = line.parts.filter((p): p is { id: string; name: string } => typeof p !== 'string');
  if (!suitor || !target) return null;
  const text = line.label === PROPOSE_MARRIAGE ? `Propose marriage to ${target.name}` : `Propose a match: ${suitor.name} and ${target.name}`;
  return { text, order: { suitor: suitor.id, target: target.id } };
}

/** The family of a person for tests and tools: what the section shows before the proposals. */
export function familyLines(ctx: Ctx, c: Character): PageSection['lines'] {
  return (familySection(ctx, c, 'self')?.lines ?? []).filter((l) => proposalButton(l) === null);
}
