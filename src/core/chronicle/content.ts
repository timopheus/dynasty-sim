import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Top-level content key `chronicle` (selection thresholds), at most once; filled by 2.6. */
export const ChronicleContentSchema = z.strictObject({});

export const checkChronicle: CrossCheck = () => [];
