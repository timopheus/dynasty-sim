import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Optional top-level key `family`: empty until 4.5 fills it (4.1 wires the key, D-310). */
export const FamilyContentSchema = z.strictObject({});

export type FamilyContent = z.infer<typeof FamilyContentSchema>;

export const checkFamily: CrossCheck = () => [];
