import { z } from 'zod';
import type { CrossCheck } from '../content/schema';

/** Top-level content key `opinions` (reasons, decay, trait influence), at most once; filled by 2.4. */
export const OpinionsContentSchema = z.strictObject({});

/** Checks across modules, e.g. trait ids referenced from opinions (2.4). */
export const checkRelations: CrossCheck = () => [];
