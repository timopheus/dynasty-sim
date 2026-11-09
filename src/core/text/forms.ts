import { parseTemplate, walkTemplate } from './template';
import type { TextPart } from './text';

/**
 * Forms of a language in templates (RU.1, D-476), beside the placeholders of D-162:
 * - `{~male|female}` — the form for the sex of the subject of the line (`{name}`); `{role~male|female}` — of a role;
 * - `{role:case}` — the name of a role (or `{name:case}` of the subject, `{place:case}` of a place) in a case: the screen
 *   shows it in that case by the declensions of the language (`nom gen dat acc ins prep`).
 * English texts need neither; a translation uses them where its grammar asks. Pure, imports no assembly file.
 */
export const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'] as const;
export type Case = (typeof CASES)[number];

/** The marker of the sex of a person among the values of a template: `~` for the subject, `role~` for a role. */
export const SEX_MARK = '~';

const FORM_RE = /^([a-z][a-z0-9_]*)?~([^|]*)\|(.*)$/s;
const CASE_RE = /^([a-z][a-z0-9_.]*):([a-z]+)$/;

/**
 * Strict forms: a form whose person the values do not give is an error, not the first form. Tests turn it on to find a
 * line that names a person without the sex (`personValues`); the game keeps it off, so such a line still reads.
 */
let strictForms = false;

export function setStrictForms(on: boolean): void {
  strictForms = on;
}

/** The value of a placeholder, a form or a case of a template; undefined when the values do not give it. */
export function resolvePlaceholder(name: string, values: Record<string, TextPart>): TextPart | undefined {
  const form = FORM_RE.exec(name);
  if (form) {
    const role = form[1] ?? '';
    const sex = role === '' || role === 'name' ? values[SEX_MARK] : values[`${role}${SEX_MARK}`];
    if (sex === undefined && strictForms) return undefined;
    return sex === 'f' ? (form[3] ?? '') : (form[2] ?? '');
  }
  const kase = CASE_RE.exec(name);
  if (kase) {
    const value = Object.hasOwn(values, kase[1] as string) ? values[kase[1] as string] : undefined;
    if (value === undefined) return undefined;
    // a case is kept on a reference: the screen declines the name; plain text stays as it is
    return typeof value === 'string' ? value : { ...value, case: kase[2] as Case };
  }
  return Object.hasOwn(values, name) ? values[name] : undefined;
}

/**
 * What a template names: the placeholders by their base names (`employer` for `{employer:gen}`, nothing for a form), the
 * roles of its forms (`''` for the subject), and the cases it asks for. Null when the braces do not balance.
 */
export function placeholderBases(template: string): { names: string[]; forms: string[]; cases: string[]; symbols: string[] } | null {
  const parsed = parseTemplate(template);
  if (!parsed.ok) return null;
  const names: string[] = [];
  const forms: string[] = [];
  const cases: string[] = [];
  const symbols: string[] = [];
  walkTemplate(parsed.nodes, (node) => {
    if (node.t === 'sym') symbols.push(node.name);
    if (node.t === 'opt') names.push(node.role);
    if (node.t !== 'ph') return;
    const form = FORM_RE.exec(node.name);
    if (form) {
      forms.push(form[1] === 'name' ? '' : (form[1] ?? ''));
      return;
    }
    const kase = CASE_RE.exec(node.name);
    if (kase) {
      names.push(kase[1] as string);
      cases.push(kase[2] as string);
      return;
    }
    names.push(node.name);
  });
  return { names, forms, cases, symbols };
}

/** The base name of a placeholder for the checks of English templates: `employer` for `{employer:gen}`, null for a form. */
export function placeholderBase(name: string): string | null {
  if (FORM_RE.test(name)) return null;
  const kase = CASE_RE.exec(name);
  return kase ? (kase[1] as string) : name;
}
