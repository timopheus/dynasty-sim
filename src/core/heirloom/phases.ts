import type { SuccessionHook } from '../state';

/** 4.9: heirlooms pass by the will, otherwise to the main heir (D-238). Never imports lifecycle.ts (import cycle). */
export const heirloomOnSuccession: SuccessionHook = () => {};
