import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = 'src/core';
const ALLOWED_PACKAGES = ['yaml', 'zod'];

/** Things that would make the core depend on a host or break determinism (D-003). */
const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (use src/core/rng.ts)'],
  [/\bDate\b/, 'Date (use src/core/calendar.ts)'],
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
