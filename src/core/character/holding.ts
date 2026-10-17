import type { Content } from '../content/schema';
import type { Character } from '../state';
import type { TraitDef } from './content';

/** Traits held by a character, without the chronicle: character.ts and generate.ts use this, so it must not import the log. */
export function findTrait(content: Content, id: string): TraitDef | null {
  return content.traits.find((t) => t.id === id) ?? null;
}

export function hasTrait(c: Character, id: string): boolean {
  return c.traits.includes(id);
}

function heldEducation(content: Content, c: Character): TraitDef | null {
  for (const id of c.traits) {
    const def = findTrait(content, id);
    if (def?.category === 'education') return def;
  }
  return null;
}

/**
 * Gives a trait and removes the opposite one (D-032), the other levels of its line and the lines against it (D-329). A trait already held is
 * ignored, and so is a second education: there is one for life.
 * Returns the trait if the character changed, else null.
 */
export function grantTrait(content: Content, c: Character, id: string): TraitDef | null {
  const def = findTrait(content, id);
  if (!def) throw new Error(`Unknown trait "${id}"`);
  if (hasTrait(c, id)) return null;
  if (def.category === 'education' && heldEducation(content, c)) return null;
  if (def.opposite) c.traits = c.traits.filter((t) => t !== def.opposite);
  // A line holds one level, and a line `against` another drops it (4.20, D-329).
  const line = def.line;
  if (line) {
    c.traits = c.traits.filter((t) => {
      const other = findTrait(content, t)?.line;
      return !other || (other.id !== line.id && other.id !== line.against && other.against !== line.id);
    });
  }
  c.traits.push(id);
  return def;
}

/** Broken rules about the traits a character holds; used by the module invariants. */
export function checkTraitHolding(content: Content, c: Character): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  let educations = 0;
  for (const id of c.traits) {
    const def = findTrait(content, id);
    if (!def) {
      problems.push(`${c.id} has unknown trait ${id}`);
      continue;
    }
    if (seen.has(id)) problems.push(`${c.id} holds trait ${id} twice`);
    seen.add(id);
    if (def.opposite && c.traits.includes(def.opposite)) problems.push(`${c.id} holds ${id} and its opposite ${def.opposite}`);
    if (def.category === 'education') educations += 1;
  }
  const lines = c.traits.flatMap((id) => findTrait(content, id)?.line ?? []);
  for (const line of lines) {
    if (lines.filter((l) => l.id === line.id).length > 1) problems.push(`${c.id} holds two levels of line ${line.id}`);
    if (line.against && lines.some((l) => l.id === line.against)) problems.push(`${c.id} holds lines ${line.id} and ${line.against} together`);
  }
  if (educations > 1) problems.push(`${c.id} has ${educations} educations`);
  return problems;
}

/**
 * `base` scaled by the percent field of the traits of all given characters (D-329): integers only, so the product of
 * the percents is divided once at the end. A trait without the field leaves the value as it is.
 */
export function scaleByTraits(content: Content, base: number, who: readonly Character[], field: 'mortalityPct' | 'conceptionPct'): number {
  let num = 1;
  let den = 1;
  for (const c of who) {
    for (const id of c.traits) {
      const pct = findTrait(content, id)?.[field];
      if (pct === undefined) continue;
      num *= pct;
      den *= 100;
    }
  }
  return Math.floor((base * num) / den);
}
