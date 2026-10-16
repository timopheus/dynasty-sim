import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Optional top-level key `eras`: empty until 4.11 fills it (4.1 wires the key, D-310). */
export const ErasContentSchema = z.strictObject({});

export type ErasContent = z.infer<typeof ErasContentSchema>;

export const checkEras: CrossCheck = () => [];
