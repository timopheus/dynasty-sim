import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { findCharacter } from '../helpers';
import { int, seedRng } from '../rng';
import type { Ctx, Scope } from '../state';
import { parseTemplate, type TemplateNode } from '../text/template';
import { partsText, type TextPart } from '../text/text';

const MAX_DEPTH = 16;

/**
 * The name of a new heirloom from a template (D-382): `{name}`, `{he}`… of the main participant, `{role}` and
 * `{role.he}`… of the roles, `{role?…}`, and `<symbol>` of the general grammar. Not `renderTemplate`: that imports the
 * grammar and the conditions, which reach effects.ts, and this file feeds it (import cycle). So only the wordings
 * without `when` are used, and the choice comes from a stream of its own (`seq` of the thing), never the world's.
 */
export function heirloomName(ctx: Ctx, template: string, scope: Scope, seq: number): string {
  const { state, content } = ctx;
  const values: Record<string, TextPart> = {};
  const main = scope.protagonist === undefined ? null : findCharacter(state, scope.protagonist);
  if (main) Object.assign(values, placeholderValues(main, state.day));
  for (const role of Object.keys(scope)) {
    const c = findCharacter(state, scope[role] as string);
    if (!c) continue;
    values[role] = fullName(c);
    for (const [key, value] of Object.entries(placeholderValues(c, state.day))) if (key !== 'name') values[`${role}.${key}`] = value;
  }
  const rng = seedRng(state.seed, 0x4e41 + seq);
  const expand = (nodes: readonly TemplateNode[], depth: number): string => {
    let out = '';
    for (const node of nodes) {
      if (node.t === 'text') out += node.s;
      else if (node.t === 'ph') out += partsText([values[node.name] ?? '']);
      else if (node.t === 'opt') out += scope[node.role] === undefined ? '' : expand(node.nodes, depth);
      else {
        const grammar = content.grammar ?? {};
        const wordings = (Object.hasOwn(grammar, node.name) ? grammar[node.name] : undefined)?.filter((w) => typeof w === 'string' || !('when' in w && w.when)) ?? [];
        if (depth >= MAX_DEPTH || wordings.length === 0) throw new Error(`Grammar symbol <${node.name}> has no plain wording or is too deep`);
        const w = wordings[int(rng, 0, wordings.length - 1)];
        const text = typeof w === 'string' ? w : (w?.text ?? '');
        const parsed = parseTemplate(text);
        if (!parsed.ok) throw new Error(`Wording "${text}" of <${node.name}>: ${parsed.error}`);
        const inner = expand(parsed.nodes, depth + 1);
        out += node.cap ? inner.charAt(0).toUpperCase() + inner.slice(1) : inner;
      }
    }
    return out;
  };
  const parsed = parseTemplate(template);
  if (!parsed.ok) throw new Error(`"${template}": ${parsed.error}`);
  return expand(parsed.nodes, 0);
}
