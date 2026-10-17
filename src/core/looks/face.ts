import { hasTrait } from '../character/holding';
import { houseOf, statusRank } from '../house/house';
import { eraOf } from '../era/era';
import { stageOf } from '../health/course';
import { ageYears } from '../time/calendar';
import type { Character, Ctx } from '../state';
import { GENE_MAX, genesOf, type GeneId, type Genes } from './genes';

/**
 * The face as data, without a picture (4.10, D-300, D-301). `src/ui` draws it; the core only says which variant of each
 * detail the person has, how far it is shifted, and what age, health, traits, fame, wealth, house and era add on top.
 * A pure query: no randomness is drawn and the state is not changed.
 */

/** Number of variants of each detail; at least three each (D-301). */
export const VARIANTS = {
  head: 4,
  eyes: 5,
  brows: 4,
  nose: 5,
  mouth: 4,
  ears: 3,
  hair: 6,
  beard: 4,
  wrinkles: 3,
  scars: 4,
  bandages: 3,
  headwear: 3,
  jewel: 3,
} as const;

/** A detail of the face: a variant `0..of-1`, and a shift of its place in pixels of the sprite grid (-1..1). */
export interface Part {
  variant: number;
  dx: number;
  dy: number;
}

export type AgeStage = 'child' | 'young' | 'adult' | 'mature' | 'old';

export interface Accessory extends Part {
  slot: 'head' | 'ear';
}

export interface FaceSpec {
  sex: 'male' | 'female';
  /** Full years on the day the face is shown: the death day for the dead. */
  age: number;
  stage: AgeStage;
  dead: boolean;
  /** Mood of the event or outcome (D-177) for the living; `dead` for the dead. */
  expression: string;
  /** Width and height of the head in steps of -1..1 on top of its variant. */
  headWidth: number;
  headHeight: number;
  head: Part;
  eyes: Part;
  brows: Part;
  nose: Part;
  mouth: Part;
  ears: Part;
  /** Null: bald. */
  hair: Part | null;
  /** 0 dark, 1 flecked, 2 grey, 3 white. */
  grey: number;
  /** Null: shaved or beardless. */
  beard: Part | null;
  /** Null: none; level 1..3 deepens with age and illness. */
  wrinkles: (Part & { level: number }) | null;
  scars: Part[];
  bandages: Part[];
  /** Side of the eye hidden by a patch for a one-eyed person; null otherwise. */
  eyepatch: 'left' | 'right' | null;
  accessories: Accessory[];
  /** 0 healthy, 1 ailing (a disease, frailty), 2 gravely ill (a severe stage). */
  illness: number;
  /** Handsome +1, plain -1. */
  beauty: number;
  /** Brows set low (-1) or open (+1) by temper; 0 none. */
  temper: number;
  /** 0 poor, 1 plain, 2 well-off, 3 grand: from wealth, fame and the status of the house. */
  attire: number;
  /** Id of the era (D-239) on the day shown; null while the content has no eras. */
  era: string | null;
}

const WELL_OFF_MONEY = 300;
const RICH_MONEY = 1500;

function v(genes: Genes, id: GeneId, n: number): number {
  return Math.min(n - 1, Math.floor((genes[id] * n) / (GENE_MAX + 1)));
}

function shift(genes: Genes, id: GeneId): number {
  return v(genes, id, 3) - 1;
}

function part(genes: Genes, name: 'head' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'ears' | 'hair' | 'beard' | 'wrinkles', n: number): Part {
  return { variant: v(genes, `${name}.v`, n), dx: shift(genes, `${name}.dx`), dy: shift(genes, `${name}.dy`) };
}

function ageStage(age: number): AgeStage {
  if (age < 14) return 'child';
  if (age < 30) return 'young';
  if (age < 45) return 'adult';
  if (age < 60) return 'mature';
  return 'old';
}

const WOUND_CONDITIONS = ['severe_wound', 'old_wound'];

export function faceSpec(ctx: Ctx, c: Character, mood: string): FaceSpec {
  const { state, content } = ctx;
  const genes = genesOf(state, c.id);
  const dead = c.deathDay !== null;
  const day = c.deathDay ?? state.day;
  const age = Math.max(0, ageYears(c.birthDay, day));
  const stage = ageStage(age);
  const male = c.sex === 'male';

  let illness = 0;
  for (const hc of c.conditions) {
    const def = content.health.conditions.find((d) => d.id === hc.id);
    if (!def) continue;
    const severe = stageOf(content, hc).severe;
    if (severe) illness = 2;
    else if (def.kind !== 'wound') illness = Math.max(illness, 1);
  }

  const scars: Part[] = [];
  if (hasTrait(c, 'scarred') || c.conditions.some((hc) => WOUND_CONDITIONS.includes(hc.id))) {
    scars.push({ variant: v(genes, 'scar.v', VARIANTS.scars), dx: shift(genes, 'scar.dx'), dy: shift(genes, 'scar.dy') });
    // A second, different scar for someone both scarred and badly wounded.
    if (hasTrait(c, 'scarred') && c.conditions.some((hc) => WOUND_CONDITIONS.includes(hc.id))) {
      scars.push({ variant: v(genes, 'scar2.v', VARIANTS.scars), dx: shift(genes, 'scar2.dx'), dy: shift(genes, 'scar2.dy') });
    }
  }
  const bandages: Part[] = c.conditions.some((hc) => hc.id === 'light_wound' || hc.id === 'severe_wound')
    ? [{ variant: v(genes, 'bandage.v', VARIANTS.bandages), dx: shift(genes, 'bandage.dx'), dy: shift(genes, 'bandage.dy') }]
    : [];

  // Hair thins for some men with age and turns grey; the start of the grey is a gene.
  const bald = stage !== 'child' && stage !== 'young' && male && v(genes, 'hair.bald', 6) === 0 && age >= 40;
  const greyFrom = 40 + v(genes, 'hair.grey', 16);
  const grey = age < greyFrom ? 0 : age < greyFrom + 8 ? 1 : age < greyFrom + 18 ? 2 : 3;

  const wrinkleLevel = age >= 60 ? 3 : age >= 45 ? 2 : age >= 32 ? 1 : 0;
  const wrinkles = wrinkleLevel + (illness > 0 ? 1 : 0) > 0 ? { ...part(genes, 'wrinkles', VARIANTS.wrinkles), level: Math.min(3, wrinkleLevel + (illness > 0 ? 1 : 0)) } : null;

  const house = houseOf(state, c);
  const rank = house ? statusRank(content, house.status) : -1;
  let attire = c.money < 0 ? 0 : 1;
  if (c.money >= WELL_OFF_MONEY || rank >= 1) attire = 2;
  if (c.money >= RICH_MONEY || (rank >= 2 && c.fame >= 2) || (c.fame >= 3 && attire >= 2)) attire = 3;

  const accessories: Accessory[] = [];
  if (attire >= 2 && stage !== 'child') {
    accessories.push({ slot: 'head', variant: v(genes, 'headwear.v', VARIANTS.headwear), dx: shift(genes, 'headwear.dx'), dy: shift(genes, 'headwear.dy') });
  }
  if (attire >= 3 || (c.fame >= 2 && attire >= 2)) {
    accessories.push({ slot: 'ear', variant: v(genes, 'jewel.v', VARIANTS.jewel), dx: shift(genes, 'jewel.dx'), dy: shift(genes, 'jewel.dy') });
  }

  const temper = hasTrait(c, 'wrathful') || hasTrait(c, 'proud') ? -1 : hasTrait(c, 'humble') || hasTrait(c, 'calm') ? 1 : 0;

  return {
    sex: c.sex,
    age,
    stage,
    dead,
    expression: dead ? 'dead' : mood,
    headWidth: shift(genes, 'head.w'),
    headHeight: shift(genes, 'head.h'),
    head: part(genes, 'head', VARIANTS.head),
    eyes: part(genes, 'eyes', VARIANTS.eyes),
    brows: part(genes, 'brows', VARIANTS.brows),
    nose: part(genes, 'nose', VARIANTS.nose),
    mouth: part(genes, 'mouth', VARIANTS.mouth),
    ears: part(genes, 'ears', VARIANTS.ears),
    hair: bald ? null : part(genes, 'hair', VARIANTS.hair),
    grey,
    beard: male && age >= 16 && v(genes, 'beard.on', 3) > 0 ? part(genes, 'beard', VARIANTS.beard) : null,
    wrinkles,
    scars,
    bandages,
    eyepatch: hasTrait(c, 'one_eyed') ? (v(genes, 'patch.side', 2) === 0 ? 'left' : 'right') : null,
    accessories,
    illness,
    beauty: hasTrait(c, 'handsome') ? 1 : hasTrait(c, 'plain') ? -1 : 0,
    temper,
    attire,
    era: eraOf(ctx, day)?.id ?? null,
  };
}
