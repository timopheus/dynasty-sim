import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Optional top-level key `heirlooms`: empty until 4.9 fills it (4.1 wires the key, D-310). */
export const HeirloomsContentSchema = z.strictObject({});

export type HeirloomsContent = z.infer<typeof HeirloomsContentSchema>;

export const checkHeirlooms: CrossCheck = () => [];
