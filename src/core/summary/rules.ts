/**
 * Thresholds of the summary of the house (D-317, D-396). Numbers of the game, not of the simulation: the summary only
 * reads the history, so they live here until the content gets a `summary` key (the assembly files are open between
 * waves only). Whole numbers.
 */
export const SUMMARY_RULES = {
  /** Days after a ▸ choice in which its consequences are looked for. */
  turnDays: 365,
  /** A shift of the head's money counts when it is at least this percent of what they had (never less than of `turnMoneyMin`)… */
  turnMoneyPercent: 50,
  /** …or when it is at least this much. */
  turnMoneyMin: 100,
  /** A shift of the head's fame step counts from this many steps. */
  turnFameSteps: 1,
  /** A shift of the house's renown counts from this much. */
  turnRenown: 3,
  /** Turns the summary lists at most (D-317: 5–10). */
  turnsMax: 10,
} as const;
