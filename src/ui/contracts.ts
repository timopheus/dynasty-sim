import { daysWord } from '../core/pages/place';
import { markPerson } from './context-menu';
import { levelDots, type BoardView, type OfferRow } from './contracts-model';
import { el } from './dom';
import { modalFrame } from './modal';
import './contracts.css';

export interface BoardProps {
  view: BoardView;
  onSelect: (id: string) => void;
  onTake: (id: string) => void;
  onTravel: (actionId: string, target: string) => void;
  onClose: () => void;
}

function rowNode(row: OfferRow, selected: boolean, onSelect: (id: string) => void): HTMLElement {
  const node = el('button', { className: selected ? 'board-offer selected' : 'board-offer', type: 'button', role: 'option' },
    el('span', { className: 'board-offer-title' }, row.title),
    el('span', { className: 'board-offer-level', title: `Level ${row.level} of 3` }, levelDots(row.level)),
    el('span', { className: 'board-offer-pay' }, `${row.pay} cr.`),
    el('span', { className: 'note' }, `${row.where} · risk ${row.risk}`));
  node.setAttribute('aria-selected', String(selected));
  node.setAttribute('data-offer', row.id);
  node.setAttribute('data-focus', `offer-${row.id}`);
  node.onclick = () => onSelect(row.id);
  return node;
}

/**
 * The board of work (CK.4), a window over the free map: the offers by place on the left, the one chosen on the right with
 * "Take the work". Up and Down move along the offers, Enter takes the one chosen, Escape closes (D-448).
 */
export function boardWindow(props: BoardProps): HTMLElement {
  const { view } = props;
  const ids = view.places.flatMap((p) => p.offers.map((o) => o.id));
  const selected = view.selected?.id ?? null;
  const list = el('div', { className: 'board-list', role: 'listbox', ariaLabel: 'Offers on the boards within reach' });
  for (const place of view.places) {
    list.append(el('section', { className: 'board-place' },
      el('h3', {}, place.name, el('span', { className: 'note' }, place.here ? ' · here' : ` · ${daysWord(place.days)}`)),
      ...place.offers.map((o) => rowNode(o, o.id === selected, props.onSelect))));
  }
  list.onkeydown = (e) => {
    const at = selected === null ? -1 : ids.indexOf(selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = ids[Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next !== undefined) props.onSelect(next);
    } else if (e.key === 'Enter' && view.selected?.take.enabled) {
      e.preventDefault();
      props.onTake(view.selected.id);
    }
  };

  const parts: (Node | string)[] = [];
  if (view.current) parts.push(el('p', { className: 'board-current' }, `Your work now: ${view.current}.`));
  if (view.empty) {
    parts.push(el('p', { className: 'board-empty' }, view.empty));
  } else {
    const d = view.selected;
    const side = el('div', { className: 'board-details', ariaLive: 'polite' });
    if (d) {
      const employer = markPerson(el('span', { className: 'person' }, d.employer.name), d.employer.id);
      const rows: [string, (Node | string)[]][] = [
        ['Employer', [employer, d.employer.occupation ? `, ${d.employer.occupation.toLowerCase()}` : '']],
        ['Where', [d.board]],
        ['Work', [d.work]],
        ['Pay', [`${d.pay} crowns`]],
        ['Risk', [d.risk]],
        ['If it goes well', [d.success.join('; ')]],
        ['If it fails', [d.failure.join('; ')]],
      ];
      const take = el('button', { className: d.take.enabled ? 'choice' : 'choice grey', type: 'button' }, 'Take the work');
      take.setAttribute('data-focus', 'board-take');
      if (d.take.enabled) take.onclick = () => props.onTake(d.id);
      else take.setAttribute('aria-disabled', 'true');
      const actions = el('div', { className: 'board-actions' }, take);
      if (!d.take.enabled) actions.append(el('span', { className: 'reason' }, d.take.reason));
      const travel = d.travel;
      if (travel) {
        const go = el('button', { className: 'choice', type: 'button' }, travel.label);
        go.setAttribute('data-focus', 'board-travel');
        go.onclick = () => props.onTravel(travel.actionId, travel.target);
        actions.append(go);
      }
      side.append(
        el('h3', {}, d.title, el('span', { className: 'board-offer-level', title: `Level ${d.level} of 3` }, ` ${levelDots(d.level)}`)),
        el('dl', { className: 'board-facts' }, ...rows.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, ...value)])),
        el('p', { className: 'note' }, d.until),
        actions,
      );
    }
    parts.push(el('div', { className: 'board-body' }, list, side));
  }
  parts.push(el('p', { className: 'note board-keys' }, 'Up and Down choose · Enter takes the work · Esc closes · J opens the board'));
  return modalFrame({ title: 'Work board', pinned: false, onClose: props.onClose, kind: 'board' }, ...parts);
}
