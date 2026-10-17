import { allChronicle } from '../archive/archive';
import type { ChronicleEntry } from '../chronicle/log';
import type { EntityPage } from '../pages/entity';
import type { Ctx } from '../state';
import { toYmd } from '../time/calendar';
import type { TextPart } from '../text/text';
import { heirloomById, kindName } from './heirloom';

/** Lines of the chronicle the page shows, as on every page of an entity (pages/entity.ts). */
const CHRONICLE_LIMIT = 30;

/** Same rule as `entityChronicle`, kept here: a page function cannot import pages/entity.ts, which imports it (import cycle). */
function heirloomChronicle(ctx: Ctx, id: string): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const all = allChronicle(ctx.state);
  for (let i = all.length - 1; i >= 0 && out.length < CHRONICLE_LIMIT; i--) {
    const e = all[i] as ChronicleEntry;
    if (e.level === 'chronicle' && (e.subject === id || e.parts.some((p) => typeof p !== 'string' && p.id === id))) out.push(e);
  }
  return out.reverse();
}

/**
 * The page of an heirloom `i…` (D-311, D-380): its kind and state, how it came, the owners by years, how it was lost or
 * sold. A lost or sold thing keeps its page.
 */
export function heirloomPage(ctx: Ctx, id: string): EntityPage | null {
  const { state, content } = ctx;
  const h = heirloomById(state, id);
  if (!h) return null;
  const year = (day: number) => String(toYmd(day).year);
  const facts: EntityPage['facts'] = [];
  const kind = kindName(content, h.kind);
  facts.push({ label: 'Kind', parts: [kind] });
  const status = h.status === 'held' ? 'Held' : h.status === 'sold' ? `Sold in ${year(h.ended ?? h.made)}` : `Lost in ${year(h.ended ?? h.made)}`;
  facts.push({ label: 'State', parts: [status] });
  facts.push({ label: 'Came', parts: [h.origin === '' ? year(h.made) : `${year(h.made)}: ${h.origin}`] });
  for (const o of h.owners) {
    const parts: TextPart[] = [{ id: o.id, name: o.name }];
    facts.push({ label: `${year(o.from)}–${o.to === null ? '' : year(o.to)}`, parts });
  }
  return { id, kind: 'heirloom', title: h.name, subtitle: kind, facts, chronicle: heirloomChronicle(ctx, id) };
}
