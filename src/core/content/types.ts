import { z } from 'zod';

/** Building blocks shared by the content schemas of all modules. */
export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case: a-z, 0-9, _');
export const Int = z.int();
export const Text = z.string().trim().min(1);

export const Range = z
  .strictObject({ min: Int.min(0), max: Int.min(0) })
  .refine((r) => r.max >= r.min, { message: 'max must be >= min' });

export const DayRange = z
  .strictObject({ min: Int.min(1), max: Int.min(1) })
  .refine((r) => r.max >= r.min, { message: 'max must be >= min' });

/** Where an item came from: used by cross-checks to point at the right file and path. */
export interface Located<T> {
  file: string;
  index: number;
  item: T;
}

export interface ContentError {
  file: string;
  path: string;
  message: string;
}

/**
 * A multiplier as an integer fraction (D-161): a whole number `3` or a string `"1/2"`, never zero.
 * Integers only, so weights stay exact on every engine.
 */
export const Factor = z.union([
  Int.min(1),
  z
    .string()
    .regex(/^[1-9][0-9]*\/[1-9][0-9]*$/, 'a factor is a positive integer or a fraction "n/d" of positive integers'),
]);

export type FactorValue = z.infer<typeof Factor>;

/** Numerator and denominator of a factor: `3` is 3/1, `"1/2"` is 1/2. */
export function factorParts(factor: FactorValue): { num: number; den: number } {
  if (typeof factor === 'number') return { num: factor, den: 1 };
  const [num, den] = factor.split('/').map(Number);
  return { num: num ?? 1, den: den ?? 1 };
}
