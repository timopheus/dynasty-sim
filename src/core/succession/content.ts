import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Optional top-level key `succession`: empty until 4.6 fills it (4.1 wires the key, D-310). */
export const SuccessionContentSchema = z.strictObject({});

export type SuccessionContent = z.infer<typeof SuccessionContentSchema>;

export const checkSuccession: CrossCheck = () => [];
