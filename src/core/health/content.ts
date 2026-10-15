import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Range } from '../content/types';

/** Top-level content key `health`, defined exactly once. */
export const HealthContentSchema = z.strictObject({
  startHealth: Range.refine((r) => r.max <= 100, { message: 'health is 0..100' }),
});

export type HealthContent = z.infer<typeof HealthContentSchema>;

export const checkHealth: CrossCheck = () => [];
