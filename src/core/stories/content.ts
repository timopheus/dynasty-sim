import type { CrossCheck } from '../content/schema';

/**
 * Stories have no content key of their own: this check looks at `schedule` and `story` in events (3.8).
 * Empty in 3.1.
 */
export const checkStories: CrossCheck = () => [];
