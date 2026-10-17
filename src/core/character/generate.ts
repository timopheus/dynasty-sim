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
 * A child born in the game (4.5): each stat is the mean of the parents' base stats with a random shift; body traits
 * pass by the chances of the trait itself (D-329, `inheritBodyTraits`), else the usual chance of one; character
 * traits, skills and education are random as for anyone (upbringing is D-018). The stat numbers are code.
 */
const STAT_SHIFT = { min: -2, max: 2 };

const OUT_OF = 10000;

/**
 * Body traits of the parents (D-329). A trait with `heritage` passes with the chance `one`, or `both` when both parents
 * hold it. A line (wit, health) passes one level: the higher parent level, or the one below it; when both parents
 * hold the same level, `up` may lift the child one level above. The child never exceeds the higher level + 1.
 */
export function inheritBodyTraits(ctx: Ctx, child: Character, father: Character, mother: Character): void {
  const r = ctx.state.rng;
  const { traits } = ctx.content;
  const held = (p: Character) => p.traits.flatMap((id) => traits.find((d) => d.id === id && d.category === 'body' && d.heritage) ?? []);
  const fromFather = held(father);
  const fromMother = held(mother);
  const clashes = (def: TraitDef): boolean =>
    child.traits.some((id) => {
      const line = traits.find((d) => d.id === id)?.line;
      return line !== undefined && def.line !== undefined && (line.against === def.line.id || line.id === def.line.against);
    });
  const roll = (def: TraitDef, p: number): void => {
    if (hasTrait(child, def.id) || (def.opposite && hasTrait(child, def.opposite)) || clashes(def)) return;
    if (chancePer(r, p, OUT_OF)) grantTrait(ctx.content, child, def.id);
  };
  const done = new Set<string>();
  for (const def of [...fromFather, ...fromMother]) {
    const heritage = def.heritage;
    if (!heritage) continue;
    const key = def.line ? `line:${def.line.id}` : def.id;
    if (done.has(key)) continue;
    done.add(key);
    if (!def.line) {
      roll(def, fromFather.includes(def) && fromMother.includes(def) ? heritage.both : heritage.one);
      continue;
    }
    const lineId = def.line.id;
    const of = (list: TraitDef[]) => list.filter((d) => d.line?.id === lineId).reduce<TraitDef | null>((top, d) => ((d.line?.level ?? 0) > (top?.line?.level ?? 0) ? d : top), null);
    const a = of(fromFather);
    const b = of(fromMother);
    const levelOf = (d: TraitDef | null) => d?.line?.level ?? 0;
    const hi = levelOf(a) >= levelOf(b) ? a : b;
    if (!hi?.heritage) continue;
    const both = a !== null && b !== null;
    const at = (level: number) => traits.find((d) => d.line?.id === lineId && d.line.level === level) ?? null;
    const up = both && levelOf(a) === levelOf(b) ? at(levelOf(hi) + 1) : null;
    if (up && hi.heritage.up > 0 && chancePer(r, hi.heritage.up, OUT_OF)) {
      roll(up, OUT_OF);
      continue;
    }
    const before = child.traits.length;
    roll(hi, both ? hi.heritage.both : hi.heritage.one);
    const lower = at(levelOf(hi) - 1);
    if (child.traits.length === before && lower?.heritage) roll(lower, lower.heritage.one);
  }
}

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
  inheritBodyTraits(ctx, child, father, mother);
  if (!child.traits.some((t) => ctx.content.traits.some((d) => d.id === t && d.category === 'body')) && chancePer(r, ...BODY_TRAIT_CHANCE)) pickTrait(ctx, child, 'body');
}
