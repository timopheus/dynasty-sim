import { el } from './dom';
import type { NewsRow } from './news-model';
import './news.css';

/** The news above the clock (D-464): a few short words, the older the fainter. Nothing to press, nothing to dismiss. */
export function newsPanel(rows: readonly NewsRow[]): HTMLElement {
  const list = el('ul', { className: 'news-list' }, ...rows.map((r) => {
    const item = el('li', { className: `news-item age-${r.age}` }, r.text);
    return item;
  }));
  const panel = el('div', { className: rows.length ? 'news' : 'news empty', role: 'log', ariaLabel: 'News' }, list);
  return panel;
}
