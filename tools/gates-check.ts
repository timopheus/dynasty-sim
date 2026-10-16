import type { Gate } from './metrics-gates';

export interface Summary {
  min: number;
  median: number;
  max: number;
}

export type Status = 'ok' | 'warn' | 'fail';

export interface GateResult {
  gate: Gate;
  summary: Summary | null;
  value: number | null;
  status: Status;
}

/** Compare each gate with the run summary. A missing metric breaks a `fail` gate (a renamed metric must not pass silently). */
export function checkGates(summary: Record<string, Summary>, gates: Gate[]): GateResult[] {
  return gates.map((gate) => {
    const s = summary[gate.metric] ?? null;
    const value = s === null ? null : s[gate.stat];
    const bad = (gate.min !== undefined || gate.max !== undefined) && (value === null || (gate.min !== undefined && value < gate.min) || (gate.max !== undefined && value > gate.max));
    const status: Status = !bad ? 'ok' : gate.mode === 'fail' ? 'fail' : 'warn';
    return { gate, summary: s, value, status };
  });
}

const ICON: Record<Status, string> = { ok: '✅', warn: '⚠️', fail: '❌' };

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function corridor(g: Gate): string {
  if (g.min === undefined && g.max === undefined) return '–';
  if (g.min === undefined) return `≤ ${num(g.max as number)}`;
  if (g.max === undefined) return `≥ ${num(g.min)}`;
  return `${num(g.min)}–${num(g.max)}`;
}

/** Markdown table for `$GITHUB_STEP_SUMMARY` and the terminal. */
export function gatesMarkdown(results: GateResult[], header: string): string {
  const rows = results.map(({ gate, summary, status }) => {
    const cells = summary === null ? ['–', '–', '–'] : [num(summary.min), num(summary.median), num(summary.max)];
    const mode = gate.mode === 'fail' ? 'fails' : 'report';
    return `| ${gate.label} (\`${gate.metric}\`) | ${cells.join(' | ')} | ${gate.stat} ${corridor(gate)} | ${mode} | ${gate.ref} | ${ICON[status]} |`;
  });
  return [
    `### ${header}`,
    '',
    '| metric | min | median | max | corridor | mode | ref | |',
    '|---|---:|---:|---:|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
