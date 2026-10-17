import { anyCharacter } from '../archive/archive';
import { int, seedRng, type RngState } from '../rng';
import type { GameState } from '../state';

/**
 * Genes of the face (4.10, D-300, D-301). A person's genes are a pure function of the seed of the game, their id and
 * the genes of their parents: nothing is stored in the state, nothing is drawn from the world stream. Each gene is a
 * whole number 0..255; the face turns it into a variant of a detail or a small shift (face.ts).
 */
export const GENE_MAX = 255;

/** Every gene of the face, in a fixed order (a person's stream is read in this order, so adding at the end keeps old faces). */
export const GENE_IDS = [
  'head.v', 'head.w', 'head.h',
  'eyes.v', 'eyes.dx', 'eyes.dy',
  'brows.v', 'brows.dx', 'brows.dy',
  'nose.v', 'nose.dx', 'nose.dy',
  'mouth.v', 'mouth.dx', 'mouth.dy',
  'ears.v', 'ears.dx', 'ears.dy',
  'hair.v', 'hair.dx', 'hair.dy', 'hair.bald', 'hair.grey',
  'beard.v', 'beard.dx', 'beard.dy', 'beard.on',
  'wrinkles.v', 'wrinkles.dx', 'wrinkles.dy',
  'scar.v', 'scar.dx', 'scar.dy', 'scar2.v', 'scar2.dx', 'scar2.dy',
  'bandage.v', 'bandage.dx', 'bandage.dy',
  'headwear.v', 'headwear.dx', 'headwear.dy',
  'jewel.v', 'jewel.dx', 'jewel.dy',
  'patch.side',
  'head.dx', 'head.dy',
] as const;

export type GeneId = (typeof GENE_IDS)[number];
export type Genes = Readonly<Record<GeneId, number>>;

/** Stream of a person's own generator: a hash of the id, apart from the streams of other modules. */
export function looksStream(id: string): number {
  let h = 0x811c9dc5;
  for (const ch of `looks:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Small mutation of a gene inherited from the parents, in 1 case of 6. */
const MUTATION_CHANCE = 6;
const MUTATION_SPREAD = 24;

function clamp(n: number): number {
  return Math.max(0, Math.min(GENE_MAX, n));
}

function randomGenes(r: RngState): Record<GeneId, number> {
  const genes = {} as Record<GeneId, number>;
  for (const id of GENE_IDS) genes[id] = int(r, 0, GENE_MAX);
  return genes;
}

function mixGenes(r: RngState, a: Genes, b: Genes): Record<GeneId, number> {
  const genes = {} as Record<GeneId, number>;
  for (const id of GENE_IDS) {
    const how = int(r, 0, 2);
    let v = how === 0 ? a[id] : how === 1 ? b[id] : Math.floor((a[id] + b[id]) / 2);
    if (int(r, 1, MUTATION_CHANCE) === 1) v = clamp(v + int(r, -MUTATION_SPREAD, MUTATION_SPREAD));
    genes[id] = v;
  }
  return genes;
}

/**
 * Caches live outside the state (never saved): per game state object, the genes by id. Kin is set at birth and never
 * changes, so an entry never goes stale; a loaded save is a new object with a new cache.
 */
const caches = new WeakMap<GameState, Map<string, Genes>>();

/**
 * Genes of a person. A founder, or one whose parents are unknown, gets random genes of their own stream. A child mixes
 * the genes of both parents (each gene from one of them or the average, now and then a small mutation) with a stream
 * of the child. A single known parent is mixed with an unknown one, who has genes of a stream made from the child's id.
 * Parents are read in the archive too: a grandparent may already be there.
 */
export function genesOf(state: GameState, id: string): Genes {
  let cache = caches.get(state);
  if (!cache) caches.set(state, (cache = new Map()));
  const known = cache.get(id);
  if (known) return known;
  const person = anyCharacter(state, id);
  const r = seedRng(state.seed, looksStream(id));
  let genes: Record<GeneId, number>;
  const father = person?.father ?? null;
  const mother = person?.mother ?? null;
  if (father === null && mother === null) genes = randomGenes(r);
  else {
    const side = (parent: string | null, which: string): Genes =>
      parent !== null ? genesOf(state, parent) : randomGenes(seedRng(state.seed, looksStream(`${id}:${which}`)));
    genes = mixGenes(r, side(father, 'father'), side(mother, 'mother'));
  }
  cache.set(id, genes);
  return genes;
}

/** Sum of the differences of all genes: the less, the more alike (4.10 test, the measure of kinship of faces). */
export function geneDistance(a: Genes, b: Genes): number {
  let sum = 0;
  for (const id of GENE_IDS) sum += Math.abs(a[id] - b[id]);
  return sum;
}
