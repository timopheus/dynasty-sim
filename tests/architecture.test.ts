import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = 'src/core';
const ALLOWED_PACKAGES = ['yaml', 'zod'];

/** Things that would make the core depend on a host or break determinism (D-003). */
const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (use src/core/rng.ts)'],
  [/\bDate\b/, 'Date (use src/core/time/calendar.ts)'],
  [/\bperformance\b/, 'performance'],
  [/\bMath\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, 'transcendental Math functions (results can differ between engines)'],
  [/\bwindow\b|\bdocument\b|\blocalStorage\b|\bfetch\(/, 'browser APIs'],
  [/\bprocess\b|\brequire\(|\bBuffer\b/, 'Node APIs'],
];

function coreFiles(): string[] {
  return readdirSync(CORE, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(CORE, f));
}

/** Runtime imports of every core file (type-only imports left out), as normalised paths with `.ts`. */
function runtimeGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of coreFiles()) {
    const deps: string[] = [];
    for (const [, clause, spec] of readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)([^;]*?)from\s+['"](\.[^'"]+)['"]/gm)) {
      const names = /^\s*\{([^}]*)\}\s*$/.exec(clause ?? '')?.[1];
      const typesOnly = names !== undefined && names.split(',').map((n) => n.trim()).filter(Boolean).every((n) => n.startsWith('type '));
      if (!typesOnly && spec) deps.push(`${posix.join(posix.dirname(file.split('\\').join('/')), spec)}.ts`);
    }
    graph.set(file.split('\\').join('/'), deps);
  }
  return graph;
}

describe('core architecture', () => {
  it('imports only relative core modules and allowed packages', () => {
    for (const file of coreFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const [, spec] of source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
        if (!spec) continue;
        if (spec.startsWith('.')) {
          const target = posix.normalize(posix.join(posix.dirname(file.split('\\').join('/')), spec));
          expect(target.startsWith(`${CORE}/`), `${file} imports ${spec} outside src/core`).toBe(true);
        } else {
          expect(ALLOWED_PACKAGES, `${file} imports package ${spec}`).toContain(spec);
        }
      }
    }
  });

  // state.ts pulls in every module's initial part; a runtime import of it from a module is a cycle.
  it('imports runtime code from state.ts only in game.ts', () => {
    for (const file of coreFiles()) {
      if (file === join(CORE, 'game.ts') || file === join(CORE, 'state.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const [statement] of source.matchAll(/import\s[^;]*?from\s+['"][./]+state['"];/g)) {
        expect(statement.startsWith('import type'), `${file}: ${statement}`).toBe(true);
      }
    }
  });

  // A runtime cycle loads one file half-initialised: tsx throws, a bundle silently drops values.
  it('has no runtime import cycles', () => {
    const graph = runtimeGraph();
    const done = new Set<string>();
    const visit = (file: string, path: string[]) => {
      if (path.includes(file)) expect.fail(`import cycle: ${[...path.slice(path.indexOf(file)), file].join(' -> ')}`);
      if (done.has(file)) return;
      for (const dep of graph.get(file) ?? []) visit(dep, [...path, file]);
      done.add(file);
    };
    for (const file of graph.keys()) visit(file, []);
  });

  // The archive is history for the player (pages, markdown, metrics, the summary, the save), never input of a rule
  // (D-312): moving data into it must not change the run. Rules are everything the day loop, commands, hooks,
  // effects, conditions, roles, the narrator, invariants and HOT_REFS reach.
  it('keeps the archive out of reach of the rules of the simulation', () => {
    const graph = runtimeGraph();
    const access = `${CORE}/archive/archive.ts`;
    expect(graph.has(access), 'the archive access file exists').toBe(true);
    for (const reader of ['pages/person.ts', 'chronicle/markdown.ts', 'metrics/metrics.ts']) {
      expect(graph.get(`${CORE}/${reader}`), `${reader} reads history through archive/`).toContain(access);
    }
    const assembly = ['game.ts', 'lifecycle.ts', 'hooks.ts', 'effects.ts', 'condition-keys.ts', 'invariants.ts', 'refs.ts', 'modifiers.ts'];
    const roots = [
      ...assembly.map((f) => `${CORE}/${f}`),
      ...[...graph.keys()].filter((f) => /\/(phases|effects|conditions)\.ts$/.test(f) || /\/(roles|narrator|events)\//.test(f)),
    ];
    expect(roots.length).toBeGreaterThan(assembly.length);
    for (const root of roots) {
      const seen = new Set<string>();
      const stack: string[][] = [[root]];
      while (stack.length > 0) {
        const path = stack.pop() as string[];
        const file = path.at(-1) as string;
        if (seen.has(file)) continue;
        seen.add(file);
        if (file === access) expect.fail(`a rule reads the archive: ${path.join(' -> ')}`);
        for (const dep of graph.get(file) ?? []) stack.push([...path, dep]);
      }
    }
  });

  it('does not use host APIs or non-deterministic sources', () => {
    for (const file of coreFiles()) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const [pattern, what] of BANNED) {
        expect(pattern.test(code), `${file} uses ${what}`).toBe(false);
      }
    }
  });
});
