import { z } from 'zod';
import { conditionRoleRefs, WhenSchema } from '../condition-keys';
import type { CrossCheck } from '../content/schema';
import { Id, Text, type ContentError } from '../content/types';
import { checkEventTemplate } from './check';
import { parseTemplate, walkTemplate } from './template';

/** One wording of a grammar symbol: a text, or a text with conditions on the main participant and roles (3.4). */
export const WordingSchema = z.union([Text, z.strictObject({ text: Text, when: WhenSchema })]);

/**
 * Top-level content key `grammar` (`content/grammar.yaml`, D-046, D-163): symbol -> wordings. A text uses a symbol
 * as `<symbol>`, with a capital first letter as `<Symbol>`. Events may have their own `grammar` of the same form;
 * an own symbol replaces the general one of the same name for that event.
 */
export const GrammarSchema = z.record(Id, z.array(WordingSchema).min(1));

export type GrammarDef = z.infer<typeof GrammarSchema>;
export type WordingDef = z.infer<typeof WordingSchema>;

export function wordingText(w: WordingDef): string {
  return typeof w === 'string' ? w : w.text;
}

export function wordingWhen(w: WordingDef): z.infer<typeof WhenSchema> | null {
  return typeof w === 'string' ? null : w.when;
}

/** A problem with the place in the grammar where it was found: `<symbol>[<wording>]`. */
export interface GrammarProblem {
  path: string;
  message: string;
}

/** Symbols a text uses, in order of appearance (inside optional segments too); null if the text does not parse. */
export function symbolsOf(template: string): string[] {
  const parsed = parseTemplate(template);
  const out: string[] = [];
  if (parsed.ok) walkTemplate(parsed.nodes, (n) => n.t === 'sym' && out.push(n.name));
  return out;
}

/**
 * Problems of the grammar `own` of an event (or the general one) among the symbols `all` it can use: every wording
 * is a good text of an event with these roles, a `when` names only these roles, a symbol has a wording without
 * `when` (so some wording always fits), and no symbol reaches itself through other symbols.
 */
export function grammarProblems(own: GrammarDef, all: GrammarDef, roles: readonly string[]): GrammarProblem[] {
  const problems: GrammarProblem[] = [];
  const symbols = Object.keys(all);
  const known = new Set(['hero', 'protagonist', ...roles]);
  for (const [name, wordings] of Object.entries(own)) {
    if (!wordings.some((w) => wordingWhen(w) === null)) {
      problems.push({ path: name, message: `symbol <${name}> needs a wording without "when", which fits when no other does` });
    }
    wordings.forEach((w, i) => {
      const at = `${name}[${i}]`;
      const problem = checkEventTemplate(wordingText(w), { roles, symbols });
      if (problem) problems.push({ path: at, message: problem });
      const when = wordingWhen(w);
      for (const role of when ? conditionRoleRefs(when) : []) {
        if (!known.has(role)) problems.push({ path: `${at}.when`, message: `unknown role "${role}"` });
      }
    });
  }
  const done = new Set<string>();
  const visit = (name: string, trail: string[]): void => {
    const at = trail.indexOf(name);
    if (at >= 0) {
      problems.push({ path: name, message: `cycle in the grammar: ${[...trail.slice(at), name].map((s) => `<${s}>`).join(' -> ')}` });
      return;
    }
    if (done.has(name) || !all[name]) return;
    for (const w of all[name]) for (const next of symbolsOf(wordingText(w))) visit(next, [...trail, name]);
    done.add(name);
  };
  for (const name of Object.keys(own)) visit(name, []);
  return problems;
}

/** Shape of an event as far as texts go: the check of grammar reads the own grammar the event schema (3.2) adds. */
interface EventTexts {
  roles?: Record<string, { optional?: boolean | undefined }> | undefined;
  grammar?: GrammarDef | undefined;
  text: string;
  options: { text: string; result: string }[];
}

/**
 * Cross-check of the grammar: the general one (`grammar:` key), the own grammar of events, and the symbols that the
 * texts of events use. Texts with other mistakes are left to the check of events.
 */
export const checkGrammar: CrossCheck = (sources) => {
  const errors: ContentError[] = [];
  const general: GrammarDef = Object.assign({}, ...sources.grammar.map((g) => g.item));
  for (const { file, item } of sources.grammar) {
    for (const p of grammarProblems(item, general, [])) errors.push({ file, path: `grammar.${p.path}`, message: p.message });
  }
  sources.events.forEach(({ file, index, item }) => {
    const event = item as EventTexts;
    const roleNames = Object.keys(event.roles ?? {});
    const optional = roleNames.filter((r) => event.roles?.[r]?.optional);
    const all: GrammarDef = { ...general, ...event.grammar };
    const at = `events[${index}]`;
    for (const p of grammarProblems(event.grammar ?? {}, all, roleNames)) {
      errors.push({ file, path: `${at}.grammar.${p.path}`, message: p.message });
    }
    const texts: [string, string][] = [[`${at}.text`, event.text]];
    event.options.forEach((o, i) => texts.push([`${at}.options[${i}].text`, o.text], [`${at}.options[${i}].result`, o.result]));
    for (const [path, text] of texts) {
      if (checkEventTemplate(text, { roles: roleNames })) continue;
      const problem = checkEventTemplate(text, { roles: roleNames, optional, symbols: Object.keys(all) });
      if (problem) errors.push({ file, path, message: problem });
    }
  });
  return errors;
};
