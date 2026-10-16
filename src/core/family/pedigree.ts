import type { Sex } from '../character/content';
import { createCharacter } from '../hooks';
import { chancePer, int, pick, seedRng } from '../rng';
import type { Character, Ctx } from '../state';
import { ageYears } from '../time/calendar';
import { ageRow, type FamilyContent } from './content';
import { ensureOccupation } from './household';
import { recordMarriage } from './marriage';

/**
 * The pedigree of a person (D-313, D-235): when a person first joins the circle (and the founder at a new game), the
 * living kin are made once — a spouse, children, parents, brothers and sisters, by the chances of `family.pedigree` —
 * as real people far from the hero. Dead ancestors are never made (unknown, `null`). Everything is drawn from the
 * person's own stream `seedRng(seed, pedigreeStream(id))`: the world stream is not touched, and the same seed and id
 * give the same family. Names do not change at marriage, so parents and siblings share the person's surname, a spouse
 * has their own, children have the father's (D-313).
 */

/** Stream of the pedigree of a person: a hash of the id, so no two people share one. */
export function pedigreeStream(id: string): number {
  let h = 0x811c9dc5;
  for (const ch of `kin:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Pedigrees only (D-313): the latest age of a wife at the wedding, and of a mother at a birth. */
const MAX_WEDDING_AGE = 30;
const LAST_BIRTH_AGE = 45;

/** A day `years` full years before today; marriages of the past start there. */
function yearsAgo(ctx: Ctx, years: number): number {
  return ctx.state.day - years * 365 - int(ctx.state.rng, 0, 364);
}

/** A relative far from the hero, of a set sex and age; adults get an occupation. Their own kin count as known. */
function relative(ctx: Ctx, sex: Sex, age: number, surname: string, parents: { father?: string; mother?: string } = {}): Character {
  const { state, content } = ctx;
  const c = createCharacter(ctx, { surname, age: { min: age, max: age }, ...parents });
  if (c.sex !== sex) {
    c.sex = sex;
    c.givenName = pick(state.rng, content.names.given[sex]);
  }
  c.kinKnown = true;
  if (age >= content.settings.adultAge) ensureOccupation(ctx, c);
  return c;
}

function alive(ctx: Ctx, family: FamilyContent, age: number): boolean {
  return chancePer(ctx.state.rng, ageRow(family.pedigree.alive, age), 10000);
}

function build(ctx: Ctx, family: FamilyContent, person: Character): void {
  const { state, content } = ctx;
  const r = state.rng;
  const p = family.pedigree;
  const adult = content.settings.adultAge;
  const age = ageYears(person.birthDay, state.day);
  const other: Sex = person.sex === 'male' ? 'female' : 'male';

  // Spouse and children
  if (age >= adult && chancePer(r, ageRow(p.married, age), 10000)) {
    const gap = int(r, p.spouseGap.min, p.spouseGap.max);
    const spouseAge = Math.max(adult, person.sex === 'male' ? age - gap : age + gap);
    const wifeAge = person.sex === 'female' ? age : spouseAge;
    // The wife's age at the wedding; the husband is older (spouseGap), so of age too.
    const wedAge = int(r, adult, Math.max(adult, Math.min(wifeAge, MAX_WEDDING_AGE)));
    const spouse = alive(ctx, family, spouseAge) ? relative(ctx, other, spouseAge, pick(r, content.names.surnames)) : null;
    if (spouse) recordMarriage(ctx, person, spouse, yearsAgo(ctx, wifeAge - wedAge));
    const husband = person.sex === 'male' ? person : spouse;
    const wife = person.sex === 'female' ? person : spouse;
    const fertile = Math.max(0, Math.min(wifeAge, LAST_BIRTH_AGE) - wedAge);
    const born = Math.floor((int(r, p.childrenPer10Years.min, p.childrenPer10Years.max) * fertile) / 10);
    for (let i = 0; i < born; i++) {
      const childAge = wifeAge - int(r, wedAge, wedAge + fertile);
      if (childAge < 0 || !alive(ctx, family, childAge)) continue;
      const sex: Sex = chancePer(r, 1, 2) ? 'male' : 'female';
      const parents = { ...(husband ? { father: husband.id } : {}), ...(wife ? { mother: wife.id } : {}) };
      relative(ctx, sex, childAge, husband ? husband.surname : person.surname, parents);
    }
  }

  // Parents, then brothers and sisters (linked by the parents, so only when one is alive)
  const fatherAge = age + int(r, p.parentGap.min, p.parentGap.max);
  const motherAge = age + int(r, p.parentGap.min, p.parentGap.max);
  const father = alive(ctx, family, fatherAge) ? relative(ctx, 'male', fatherAge, person.surname) : null;
  const mother = alive(ctx, family, motherAge) ? relative(ctx, 'female', motherAge, pick(r, content.names.surnames)) : null;
  if (father) person.father = father.id;
  if (mother) person.mother = mother.id;
  if (father && mother) recordMarriage(ctx, father, mother, yearsAgo(ctx, age + 1));
  if (!father && !mother) return;
  const youngestParent = Math.min(father ? fatherAge : Infinity, mother ? motherAge : Infinity);
  const siblings = int(r, p.siblings.min, p.siblings.max);
  for (let i = 0; i < siblings; i++) {
    const siblingAge = Math.min(youngestParent - adult, Math.max(0, age + int(r, -p.siblingSpread, p.siblingSpread)));
    if (siblingAge < 0 || !alive(ctx, family, siblingAge)) continue;
    const sex: Sex = chancePer(r, 1, 2) ? 'male' : 'female';
    relative(ctx, sex, siblingAge, person.surname, { ...(father ? { father: father.id } : {}), ...(mother ? { mother: mother.id } : {}) });
  }
}

/**
 * Makes the living kin of the person, once (`kinKnown`). Spends nothing of the world stream: the state's generator
 * is put aside while the person's own stream draws, and put back after.
 */
export function makePedigree(ctx: Ctx, person: Character): void {
  const { state, content } = ctx;
  if (person.kinKnown) return;
  person.kinKnown = true;
  const family = content.family;
  if (!family) return;
  const world = state.rng;
  state.rng = seedRng(state.seed, pedigreeStream(person.id));
  try {
    build(ctx, family, person);
  } finally {
    state.rng = world;
  }
}
