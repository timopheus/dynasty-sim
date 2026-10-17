import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { PLACEHOLDERS } from '../character/text';
import { checkEventTemplate } from '../text/check';

/**
 * Optional top-level key `heirlooms` (4.9, D-238, D-380). Lists are arrays and are walked in file order (D-161):
 * - `max`: the most things the house holds at once; a new one is not made over the limit;
 * - `kinds`: the kinds of thing (a sword, a ring, a bill of exchange);
 * - `bequestReason`: optional opinion reason the new head holds towards the one a will left a thing instead of them;
 * - `texts`: lines of the chronicle (`{heirloom}` the thing, `{kind}` its kind, plus the placeholders of a person):
 *   `created`, `given` (`{to}`), `sold`, `lost`, `inherited` and `bequeathed` (`{deceased}`);
 * - `reasons`: texts of the unmet conditions `has_heirloom` (`{kind}`) and `heirloom_count_min` (`{n}`).
 */
export const HeirloomsContentSchema = z.strictObject({
  max: Int.min(1),
  kinds: z.array(z.strictObject({ id: Id, name: Text })).min(1),
  bequestReason: Id.optional(),
  texts: z.strictObject({ created: Text, given: Text, sold: Text, lost: Text, inherited: Text, bequeathed: Text }),
  reasons: z.strictObject({ has: Text, count_min: Text }),
});

export type HeirloomsContent = z.infer<typeof HeirloomsContentSchema>;

const TEXT_VARS: Record<keyof HeirloomsContent['texts'], string[]> = {
  created: ['heirloom', 'kind'],
  given: ['heirloom', 'kind', 'to'],
  sold: ['heirloom', 'kind'],
  lost: ['heirloom', 'kind'],
  inherited: ['heirloom', 'kind', 'deceased'],
  bequeathed: ['heirloom', 'kind', 'deceased'],
};

export const checkHeirlooms: CrossCheck = ({ heirlooms, events, actions, opinions, traits, grammar }) => {
  const errors: ContentError[] = [];
  const kindIds = new Set(heirlooms.flatMap((h) => h.item.kinds.map((k) => k.id)));
  const reasonIds = new Set(opinions.flatMap((o) => o.item.reasons.map((r) => r.id)));
  const reputation = new Set(traits.filter((t) => t.item.category === 'reputation').map((t) => t.item.id));
  for (const { file, item } of heirlooms) {
    const err = (path: string, message: string) => errors.push({ file, path: `heirlooms.${path}`, message });
    const seen = new Set<string>();
    item.kinds.forEach((k, i) => {
      if (seen.has(k.id)) err(`kinds[${i}].id`, `duplicate kind "${k.id}"`);
      seen.add(k.id);
    });
    if (item.bequestReason !== undefined && !reasonIds.has(item.bequestReason)) err('bequestReason', `unknown opinion reason "${item.bequestReason}"`);
    for (const key of Object.keys(TEXT_VARS) as (keyof typeof TEXT_VARS)[]) {
      const problem = checkReason(item.texts[key], [...PLACEHOLDERS, ...TEXT_VARS[key]]);
      if (problem) err(`texts.${key}`, problem);
    }
    for (const [key, vars] of [['has', ['kind']], ['count_min', ['n']]] as const) {
      const problem = checkReason(item.reasons[key], vars);
      if (problem) err(`reasons.${key}`, problem);
    }
  }
  // The keys of events and actions: their kinds, reasons and traits, and the content they run on.
  const users: { file: string; base: string; item: unknown; roles: string[]; symbols: string[] }[] = [];
  const general = Object.assign({}, ...grammar.map((g) => g.item)) as Record<string, unknown>;
  for (const e of events) {
    const own = e.item as { roles?: Record<string, unknown> };
    users.push({ file: e.file, base: `events[${e.index}]`, item: e.item, roles: Object.keys(own.roles ?? {}), symbols: Object.keys(general) });
  }
  for (const a of actions) users.push({ file: a.file, base: `actions[${a.index}]`, item: a.item, roles: [], symbols: Object.keys(general) });
  for (const { file, base, item, roles, symbols } of users) {
    const need = (path: string) => {
      if (heirlooms.length === 0) errors.push({ file, path, message: 'a heirloom key needs the top-level key "heirlooms"' });
      return heirlooms.length > 0;
    };
    const kind = (id: unknown, path: string) => {
      if (need(path) && typeof id === 'string' && !kindIds.has(id)) errors.push({ file, path, message: `unknown heirloom kind "${id}"` });
    };
    walkKeys(item, base, ['has_heirloom'], kind);
    walkKeys(item, base, ['heirloom_count_min'], (_v, path) => need(path));
    walkKeys(item, base, ['heirloom_create'], (v, path) => {
      const create = v as { kind?: unknown; name?: unknown };
      kind(create.kind, `${path}.kind`);
      if (typeof create.name === 'string') {
        const problem = checkEventTemplate(create.name, { roles, symbols });
        if (problem) errors.push({ file, path: `${path}.name`, message: problem });
      }
    });
    walkKeys(item, base, ['heirloom_give', 'heirloom_lose'], (v, path) => kind((v as { kind?: unknown }).kind, `${path}.kind`));
    walkKeys(item, base, ['heirloom_sell'], (v, path) => {
      const sell = v as { kind?: unknown; reason?: unknown; trait?: unknown };
      kind(sell.kind, `${path}.kind`);
      if (typeof sell.reason === 'string' && !reasonIds.has(sell.reason)) errors.push({ file, path: `${path}.reason`, message: `unknown opinion reason "${sell.reason}"` });
      if (typeof sell.trait === 'string' && !reputation.has(sell.trait)) errors.push({ file, path: `${path}.trait`, message: `unknown reputation trait "${sell.trait}"` });
    });
  }
  return errors;
};
