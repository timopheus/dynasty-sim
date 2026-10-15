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
