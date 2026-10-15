import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Top-level content key `population` (occupations, size of the hero's circle), at most once; filled by 2.5. */
export const PopulationContentSchema = z.strictObject({});

export const checkWorld: CrossCheck = () => [];
