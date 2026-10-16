import { chancePer, int, weightedPick } from '../rng';
import type { Character, Ctx } from '../state';
import type { TraitDef } from './content';
import { BASE_STAT_MAX, STAT_IDS, type Stats } from './stat-ids';
import { grantTrait, hasTrait } from './holding';

/**
 * Random stats and traits for a new character: a stub until the backstory of
 * the first hero (D-038, D-055) and upbringing of heirs (D-018). The numbers
 * are code, not content, because that stage replaces them wholesale.
 */
const BASE_STAT = { min: 4, max: 10 };
const CHARACTER_TRAITS = { min: 2, max: 3 };
/** Chance n out of d. */
const BODY_TRAIT_CHANCE = [1, 5] as const;
const SKILL_CHANCE = [1, 4] as const;
const EDUCATION_CHANCE = [3, 5] as const;

function candidates(ctx: Ctx, c: Character, category: TraitDef['category']): TraitDef[] {
  return ctx.content.traits.filter(
    (t) => t.category === category && t.weight > 0 && !hasTrait(c, t.id) && !(t.opposite && hasTrait(c, t.opposite)),
  );
}

function pickTrait(ctx: Ctx, c: Character, category: TraitDef['category']): void {
  const options = candidates(ctx, c, category);
  if (options.length === 0) return;
  grantTrait(ctx.content, c, weightedPick(ctx.state.rng, options, (t) => t.weight).id);
}

export function generateStatsAndTraits(ctx: Ctx, c: Character): void {
  const r = ctx.state.rng;
  c.baseStats = Object.fromEntries(STAT_IDS.map((id) => [id, int(r, BASE_STAT.min, BASE_STAT.max)])) as Stats;
  c.traits = [];
  const n = int(r, CHARACTER_TRAITS.min, CHARACTER_TRAITS.max);
  for (let i = 0; i < n; i++) pickTrait(ctx, c, 'character');
  if (chancePer(r, ...BODY_TRAIT_CHANCE)) pickTrait(ctx, c, 'body');
  if (chancePer(r, ...SKILL_CHANCE)) pickTrait(ctx, c, 'skill');
  if (chancePer(r, ...EDUCATION_CHANCE)) pickTrait(ctx, c, 'education');
}

/**
 * A child born in the game (4.5): each stat is the mean of the parents' base stats with a random shift; a body trait
 * of a parent passes with a chance, else the usual chance of one; character traits, skills and education are random
 * as for anyone (upbringing is D-018). The numbers are code, like the stub above.
 */
const STAT_SHIFT = { min: -2, max: 2 };
/** Chance n out of d that a body trait of one parent passes to the child. */
const INHERIT_BODY_CHANCE = [1, 3] as const;

export function inheritStatsAndTraits(ctx: Ctx, child: Character, father: Character, mother: Character): void {
  const r = ctx.state.rng;
  child.baseStats = Object.fromEntries(
    STAT_IDS.map((id) => {
      const mean = Math.floor((father.baseStats[id] + mother.baseStats[id] + int(r, 0, 1)) / 2);
      return [id, Math.min(BASE_STAT_MAX, Math.max(0, mean + int(r, STAT_SHIFT.min, STAT_SHIFT.max)))];
    }),
  ) as Stats;
  child.traits = [];
  const n = int(r, CHARACTER_TRAITS.min, CHARACTER_TRAITS.max);
  for (let i = 0; i < n; i++) pickTrait(ctx, child, 'character');
  const bodyTraits = (p: Character) => p.traits.filter((t) => ctx.content.traits.some((d) => d.id === t && d.category === 'body' && d.weight > 0));
  for (const trait of [...bodyTraits(father), ...bodyTraits(mother)]) {
    const def = ctx.content.traits.find((d) => d.id === trait);
    if (hasTrait(child, trait) || (def?.opposite && hasTrait(child, def.opposite))) continue;
    if (chancePer(r, ...INHERIT_BODY_CHANCE)) grantTrait(ctx.content, child, trait);
  }
  if (!child.traits.some((t) => ctx.content.traits.some((d) => d.id === t && d.category === 'body')) && chancePer(r, ...BODY_TRAIT_CHANCE)) pickTrait(ctx, child, 'body');
}
