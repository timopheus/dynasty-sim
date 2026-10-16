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
 * Gives a trait and removes the opposite one (D-032). A trait already held is
 * ignored, and so is a second education: there is one for life.
 * Returns the trait if the character changed, else null.
 */
export function grantTrait(content: Content, c: Character, id: string): TraitDef | null {
  const def = findTrait(content, id);
  if (!def) throw new Error(`Unknown trait "${id}"`);
  if (hasTrait(c, id)) return null;
  if (def.category === 'education' && heldEducation(content, c)) return null;
  if (def.opposite) c.traits = c.traits.filter((t) => t !== def.opposite);
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
  if (educations > 1) problems.push(`${c.id} has ${educations} educations`);
  return problems;
}
