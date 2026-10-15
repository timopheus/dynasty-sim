import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Top-level content key `time` (seasons and their texts), at most once; filled by 2.2. */
export const TimeContentSchema = z.strictObject({});

export const checkTime: CrossCheck = () => [];
