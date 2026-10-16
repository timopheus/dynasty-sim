/**
 * Parser of event texts (D-162, D-163). Pure: no imports of assembly files, so content checks may use it.
 *
 * Syntax: `{name}` `{role}` `{role.he}` — placeholders; `{role?text}` — text kept only if the role is filled (may
 * hold placeholders, symbols and nested `{…}`); `<symbol>` and `<Symbol>` (capital first letter) — a wording of the
 * grammar symbol, with a capital first letter for `<Symbol>`.
 */
export type TemplateNode =
  | { t: 'text'; s: string }
  | { t: 'ph'; name: string }
  | { t: 'sym'; name: string; cap: boolean }
  | { t: 'opt'; role: string; nodes: TemplateNode[] };

export type ParsedTemplate = { ok: true; nodes: TemplateNode[] } | { ok: false; error: string };

const OPTIONAL_HEAD_RE = /^([a-z][a-z0-9_]*)\?/;
const SYMBOL_RE = /^<([A-Za-z][A-Za-z0-9_]*)>/;
const UNBALANCED_BRACES = 'unbalanced { or }';
const UNBALANCED_ANGLES = 'unbalanced < or > (a grammar symbol is <name>)';

const cache = new Map<string, ParsedTemplate>();

export function parseTemplate(template: string): ParsedTemplate {
  const known = cache.get(template);
  if (known) return known;
  let at = 0;
  let error: string | null = null;
  const fail = (message: string): never[] => {
    error ??= message;
    return [];
  };

  /** Reads nodes up to the end of the string, or up to the `}` that closes an optional segment. */
  const nodes = (nested: boolean): TemplateNode[] => {
    const out: TemplateNode[] = [];
    let text = '';
    const flush = () => {
      if (text !== '') out.push({ t: 'text', s: text });
      text = '';
    };
    while (at < template.length && error === null) {
      const ch = template[at] as string;
      if (ch === '}') {
        if (nested) {
          flush();
          at++;
          return out;
        }
        return fail(UNBALANCED_BRACES);
      }
      if (ch === '{') {
        flush();
        at++;
        const head = OPTIONAL_HEAD_RE.exec(template.slice(at));
        if (head) {
          at += head[0].length;
          const inner = nodes(true);
          if (error === null && template[at - 1] !== '}') return fail(UNBALANCED_BRACES);
          out.push({ t: 'opt', role: head[1] as string, nodes: inner });
        } else {
          const end = template.indexOf('}', at);
          const name = end < 0 ? '' : template.slice(at, end);
          if (end < 0 || name.includes('{')) return fail(UNBALANCED_BRACES);
          out.push({ t: 'ph', name });
          at = end + 1;
        }
        continue;
      }
      if (ch === '<') {
        const sym = SYMBOL_RE.exec(template.slice(at));
        if (!sym) return fail(UNBALANCED_ANGLES);
        flush();
        const raw = sym[1] as string;
        const first = raw.charAt(0);
        out.push({ t: 'sym', name: first.toLowerCase() + raw.slice(1), cap: first !== first.toLowerCase() });
        at += sym[0].length;
        continue;
      }
      if (ch === '>') return fail(UNBALANCED_ANGLES);
      text += ch;
      at++;
    }
    if (nested && error === null) return fail(UNBALANCED_BRACES);
    flush();
    return out;
  };

  const result = nodes(false);
  const parsed: ParsedTemplate = error === null ? { ok: true, nodes: result } : { ok: false, error };
  cache.set(template, parsed);
  return parsed;
}

/** Visits every node, entering optional segments. */
export function walkTemplate(nodes: readonly TemplateNode[], visit: (node: TemplateNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.t === 'opt') walkTemplate(node.nodes, visit);
  }
}
