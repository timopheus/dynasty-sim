import { placeholderValues } from '../character/text';
import { conditionReport } from '../condition-keys';
import { findCharacter } from '../helpers';
import { int, seedRng, type RngState } from '../rng';
import type { Character, Ctx, Scope } from '../state';
import { wordingText, wordingWhen, type GrammarDef } from './grammar';
import { parseTemplate, type TemplateNode } from './template';
import type { TextPart } from './text';

const MAX_DEPTH = 16;

/**
 * Stream of the random generator for the text with number `seq` (of the event) in place `slot` (such as
 * `option.0.result`): the same pair always reads the same, any other pair reads independently (D-200).
 */
export function textStream(seq: number, slot: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slot.length; i++) h = Math.imul(h ^ slot.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (seq >>> 0), 0x9e3779b1);
  return (h ^ (h >>> 15)) >>> 0;
}

function capitalize(parts: TextPart[]): TextPart[] {
  const first = parts[0];
  if (typeof first !== 'string' || first === '') return parts;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...parts.slice(1)];
}

/**
 * Text of an event with roles (D-162). `{name}`, `{he}`… are the subject of the line (the main participant,
 * `protagonist` of the scope); `{role}` is the name of a role as a reference, `{role.he}`, `{role.age}`… its
 * pronouns and age; `{role?…}` is kept if the role is filled; `<symbol>` and `<Symbol>` (D-163) are a wording of the
 * grammar: the general one (`grammar:`) with the own grammar `own` of the event over it. The wording is chosen by
 * a random stream of its own from `seq` (number of the event) and `slot` (place of the text), so the world stream
 * is not touched and the same text reads the same every time (D-200). Wordings with `when` that the main participant
 * does not meet are left out.
 *
 * Content schemas and checks must not import this one: they get a template check from text/check.ts, which imports
 * no assembly file (D-060).
 */
export function renderTemplate(ctx: Ctx, template: string, scope: Scope, seq: number, slot: string, own?: GrammarDef | null): TextPart[] {
  const { state, content } = ctx;
  const person = (role: string): Character => {
    const id = scope[role];
    const c = id === undefined ? null : findCharacter(state, id);
    if (!c) throw new Error(`Role "${role}" is not filled in "${template}"`);
    return c;
  };
  const values: Record<string, TextPart> = {};
  if (scope.protagonist !== undefined) Object.assign(values, placeholderValues(person('protagonist'), state.day));
  for (const role of Object.keys(scope)) {
    const c = findCharacter(state, scope[role] as string);
    if (!c) throw new Error(`Role "${role}" is not filled in "${template}"`);
    const mine = placeholderValues(c, state.day);
    values[role] = mine.name as TextPart;
    for (const [key, value] of Object.entries(mine)) if (key !== 'name') values[`${role}.${key}`] = value;
  }
  const grammar: GrammarDef = { ...content.grammar, ...own };
  let rng: RngState | null = null;

  const push = (parts: TextPart[], part: TextPart) => {
    const last = parts.at(-1);
    if (typeof part === 'string' && typeof last === 'string') parts[parts.length - 1] = last + part;
    else if (part !== '') parts.push(part);
  };

  const expand = (nodes: readonly TemplateNode[], depth: number): TextPart[] => {
    const parts: TextPart[] = [];
    for (const node of nodes) {
      if (node.t === 'text') push(parts, node.s);
      else if (node.t === 'ph') {
        const value = Object.hasOwn(values, node.name) ? values[node.name] : undefined;
        if (value === undefined) throw new Error(`No value for placeholder {${node.name}} in "${template}"`);
        push(parts, value);
      } else if (node.t === 'opt') {
        if (scope[node.role] !== undefined) for (const p of expand(node.nodes, depth)) push(parts, p);
      } else {
        if (depth >= MAX_DEPTH) throw new Error(`Grammar symbol <${node.name}> is too deep in "${template}" (a cycle?)`);
        const wordings = Object.hasOwn(grammar, node.name) ? grammar[node.name] : undefined;
        if (!wordings) throw new Error(`Undefined grammar symbol <${node.name}> in "${template}"`);
        const protagonist = person('protagonist');
        const fitting = wordings.filter((w) => {
          const when = wordingWhen(w);
          return when === null || conditionReport(ctx, protagonist, when, scope).met;
        });
        if (fitting.length === 0) throw new Error(`No wording of <${node.name}> fits in "${template}"`);
        rng ??= seedRng(state.seed, textStream(seq, slot));
        const text = wordingText(fitting[int(rng, 0, fitting.length - 1)] ?? '');
        const parsed = parseTemplate(text);
        if (!parsed.ok) throw new Error(`Wording "${text}" of <${node.name}>: ${parsed.error}`);
        const inner = expand(parsed.nodes, depth + 1);
        for (const p of node.cap ? capitalize(inner) : inner) push(parts, p);
      }
    }
    return parts;
  };

  const parsed = parseTemplate(template);
  if (!parsed.ok) throw new Error(`"${template}": ${parsed.error}`);
  return expand(parsed.nodes, 0);
}
