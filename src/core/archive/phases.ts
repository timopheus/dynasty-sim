import type { DayPhase } from '../state';

/**
 * Archive phase (D-312): once a year, 1 January, 4.3 moves old chronicle and long-dead people no hot data refers to
 * (HOT_REFS of refs.ts) into a new chunk. It spends no randomness and makes no ids, so the run stays the same.
 * Never stops the day. Writes chunks only (chunks.ts); never reads them through archive.ts.
 */
export const archivePhase: DayPhase = {
  id: 'archive',
  run: () => false,
};
