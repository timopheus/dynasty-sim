import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Top-level content key `backstory`: stages, number of scenes and the neutral base of the founder (3.11). Empty in 3.1. */
export const BackstoryContentSchema = z.strictObject({});

export type BackstoryContent = z.infer<typeof BackstoryContentSchema>;

export const checkBackstory: CrossCheck = () => [];
