/**
 * Metric corridors checked by CI (D-203). Changing a corridor or a `mode` goes together with a DECISIONS record.
 * `fail` gates fail the run, `report` gates only show up in the table.
 */
export interface Gate {
  /** Key of the sim summary (`--json`), e.g. `saveBytes`, `heads.ageAtDeath.median`. */
  metric: string;
  label: string;
  /** Which of min / median / max over the runs is compared with the corridor. */
  stat: 'min' | 'median' | 'max';
  /** Inclusive corridor; a missing bound is open. Both missing: the metric is only shown. */
  min?: number;
  max?: number;
  mode: 'fail' | 'report';
  /** Decision the corridor comes from. */
  ref: string;
}

/** Seeds 1..count, the same as in the stage measurements. */
export const RUNS = { years: 300, seed: 1, count: 10 };

export const GATES: Gate[] = [
  { metric: 'violations', label: 'invariant violations (any seed)', stat: 'max', max: 0, mode: 'fail', ref: 'D-203' },
  // The hot part is rewritten after every command; the whole save (with the archive) only grows the archive (D-312, D-337).
  { metric: 'hotBytes', label: 'hot part of the save, bytes', stat: 'max', max: 300_000, mode: 'fail', ref: 'D-312, D-337' },
  { metric: 'saveBytes', label: 'whole save with the archive, bytes', stat: 'max', mode: 'report', ref: 'D-234, D-337' },
  // Fails since stage 3 closed with the median in the corridor (D-205).
  { metric: 'heads.chronicleLinesPerLife.median', label: 'chronicle lines per head life', stat: 'median', min: 25, max: 45, mode: 'fail', ref: 'D-019, D-065, D-205' },
  { metric: 'heads.ageAtDeath.median', label: 'head age at death', stat: 'median', min: 45, max: 55, mode: 'report', ref: 'D-059' },
  { metric: 'heads.count', label: 'heads of the house', stat: 'median', min: 8, max: 11, mode: 'report', ref: 'D-059' },
  { metric: 'eventsPerYear', label: 'events per year', stat: 'median', mode: 'report', ref: 'D-203' },
  { metric: 'elapsedMs', label: 'run time, ms', stat: 'max', max: 30_000, mode: 'report', ref: 'D-113, D-203' },
];
