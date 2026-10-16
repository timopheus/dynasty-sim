import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Optional top-level key `house`: empty until 4.7 fills it (4.1 wires the key, D-310). */
export const HouseContentSchema = z.strictObject({});

export type HouseContent = z.infer<typeof HouseContentSchema>;

export const checkHouse: CrossCheck = () => [];
