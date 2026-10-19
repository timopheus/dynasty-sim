import type { ChronicleEntry } from '../core/chronicle/log';
import { el } from './dom';
import { entryView } from './entry';
import { entryNode } from './page';

/** How many lines the strip shows: what happened lately, always in sight (pillar 5: the chronicle is the result). */
export const LATELY_LIMIT = 6;

/** The latest lines of the chronicle under the "where I am" block, newest first; the whole chronicle is a tab of the profile. */
export function latelyPanel(entries: readonly ChronicleEntry[], heroId: string, heads: ReadonlySet<string>): HTMLElement {
  const recent = entries.filter((e) => e.level === 'chronicle').slice(-LATELY_LIMIT).reverse();
  return el('section', { className: 'lately' },
    el('h2', {}, 'Lately'),
    recent.length
      ? el('ul', { className: 'chronicle' }, ...recent.map((e) => entryNode(entryView(e, heroId, heads), e.day)))
      : el('p', { className: 'meta' }, 'Nothing has happened yet.'));
}
