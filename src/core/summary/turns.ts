import { allChronicle, allRelations } from '../archive/archive';
import type { ChronicleEntry } from '../chronicle/log';
import type { GameState } from '../state';
import { SUMMARY_RULES } from './rules';
import type { Snapshot } from './summary';

/** What changed in the year after a ▸ choice. */
export type TurnCause =
  | { kind: 'money'; from: number; to: number }
  | { kind: 'fame'; from: number; to: number }
  | { kind: 'renown'; from: number; to: number }
  | { kind: 'status'; from: string | null; to: string | null }
  | { kind: 'trait'; text: string }
  | { kind: 'relation'; relation: string; started: boolean };

/** A choice that turned the fortune of the house (D-246). */
export interface Turn {
  /** The ▸ line of the chronicle. */
  entry: ChronicleEntry;
  /** Head at the time of the choice. */
  head: string;
  causes: TurnCause[];
  /** Weight of the causes, whole number: the turns with the highest score are listed. */
  score: number;
}

const WEIGHT = { trait: 3, relation: 3, status: 5, fame: 4, renown: 2 } as const;

/** The money shift that counts: a share of what they had, but of at least `turnMoneyMin` as the base. */
function moneyShift(from: number, to: number): number {
  const d = Math.abs(to - from);
  const { turnMoneyMin, turnMoneyPercent } = SUMMARY_RULES;
  if (d >= turnMoneyMin) return Math.min(10, 4 * Math.floor(d / turnMoneyMin));
  return d * 100 >= turnMoneyPercent * Math.max(Math.abs(from), turnMoneyMin) ? 2 : 0;
}

/**
 * The readings that frame a choice made on `day`: the last one at or before it, and the first one a full window
 * after it. Null when the window is not over yet. A snapshot is yearly, so the span is a year and a bit (D-396).
 */
function frame(snapshots: readonly Snapshot[], day: number): { before: Snapshot; after: Snapshot } | null {
  let before: Snapshot | null = null;
  for (const s of snapshots) {
    if (s[0] <= day) before = s;
    else break;
  }
  const after = snapshots.find((s) => s[0] >= day + SUMMARY_RULES.turnDays);
  return before && after ? { before, after } : null;
}

/**
 * Turns of the house: ▸ choices after which, within a year, the head's money, fame or the house's renown or status
 * shifted past the thresholds, a trait was gained, or a tie began or ended (D-317). A pure function of the chronicle,
 * the snapshots and the records of ties. The numbers read the yearly snapshots, so of several choices that fall
 * between the same two readings only the first gets them; traits, ties and status are dated exactly. Best first, at
 * most `turnsMax`, then in the order of the days. `readings` may carry a last reading of the present moment.
 */
export function findTurns(state: GameState, readings: readonly Snapshot[] = state.snapshots): Turn[] {
  const chronicle = allChronicle(state);
  const relations = allRelations(state);
  const numbered = new Set<number>();
  const turns: Turn[] = [];
  for (const e of chronicle) {
    if (!e.mark) continue;
    const end = e.day + SUMMARY_RULES.turnDays;
    if (end > state.day) continue;
    const causes: TurnCause[] = [];
    let score = 0;
    const span = frame(readings, e.day);
    if (span && !numbered.has(span.before[0])) {
      const { before, after } = span;
      numbered.add(before[0]);
      if (before[1] === after[1]) {
        const m = moneyShift(before[2], after[2]);
        if (m > 0) {
          causes.push({ kind: 'money', from: before[2], to: after[2] });
          score += m;
        }
        const steps = Math.abs(after[3] - before[3]);
        if (steps >= SUMMARY_RULES.turnFameSteps) {
          causes.push({ kind: 'fame', from: before[3], to: after[3] });
          score += WEIGHT.fame * steps;
        }
      }
      const renown = Math.abs(after[4] - before[4]);
      if (renown >= SUMMARY_RULES.turnRenown) {
        causes.push({ kind: 'renown', from: before[4], to: after[4] });
        score += WEIGHT.renown * Math.min(5, Math.floor(renown / SUMMARY_RULES.turnRenown));
      }
    }
    for (const x of chronicle) {
      if (x.day < e.day) continue;
      if (x.day > end) break;
      if (x.subject !== e.subject || x === e) continue;
      if (x.kind === 'trait_change') {
        causes.push({ kind: 'trait', text: x.parts.map((p) => (typeof p === 'string' ? p : p.name)).join('') });
        score += WEIGHT.trait;
      } else if (x.kind === 'house_status') {
        const was = [...readings].reverse().find((s) => s[0] < x.day);
        const now = readings.find((s) => s[0] >= x.day);
        if (!was || !now || was[5] === now[5]) continue;
        causes.push({ kind: 'status', from: was[5], to: now[5] });
        score += WEIGHT.status;
      }
    }
    for (const r of relations) {
      if (r.a !== e.subject && r.b !== e.subject) continue;
      if (r.start >= e.day && r.start <= end) {
        causes.push({ kind: 'relation', relation: r.kind, started: true });
        score += WEIGHT.relation;
      } else if (r.end !== null && r.end >= e.day && r.end <= end && r.endReason !== 'death') {
        causes.push({ kind: 'relation', relation: r.kind, started: false });
        score += WEIGHT.relation;
      }
    }
    if (causes.length > 0) turns.push({ entry: e, head: e.subject, causes, score });
  }
  const best = [...turns].sort((a, b) => b.score - a.score || a.entry.day - b.entry.day).slice(0, SUMMARY_RULES.turnsMax);
  return best.sort((a, b) => a.entry.day - b.entry.day);
}
