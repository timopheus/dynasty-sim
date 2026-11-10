import { hrefOf } from './address';
import { markPerson } from './context-menu';
import { levelDots, type BoardView, type OfferRow } from './contracts-model';
import { el } from './dom';
import { modalFrame } from './modal';
import './contracts.css';
import { crownsText, daysText, tr } from './i18n';

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
    el('span', { className: 'board-offer-level', ariaHidden: 'true' }, levelDots(row.level)),
    el('span', { className: 'board-offer-pay' }, crownsText(row.pay)),
    el('span', { className: 'note' }, `${row.where} · ${row.employer} · ${tr('level {n}', { n: row.level })} · ${tr('risk {risk}', { risk: row.risk })}`));
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
  const list = el('div', { className: 'board-list', role: 'listbox', ariaLabel: tr('Offers on the boards within reach') });
  for (const place of view.places) {
    list.append(el('section', { className: 'board-place' },
      el('h3', {}, place.name, el('span', { className: 'note' }, place.here ? ` · ${tr('here')}` : ` · ${daysText(place.days)}`)),
      ...place.offers.map((o) => rowNode(o, o.id === selected, props.onSelect))));
  }
  const parts: (Node | string)[] = [];
  if (view.current) parts.push(el('p', { className: 'board-current' }, tr('Your work now: {work}.', { work: view.current })));
  if (view.empty) {
    parts.push(el('p', { className: 'board-empty' }, view.empty));
  } else {
    const d = view.selected;
    const side = el('div', { className: 'board-details', ariaLive: 'polite' });
    if (d) {
      const employer = markPerson(el('a', { href: hrefOf(d.employer.id) }, d.employer.name), d.employer.id);
      const rows: [string, (Node | string)[]][] = [
        [tr('Employer'), [employer, d.employer.occupation ? `, ${d.employer.occupation.toLowerCase()}` : '']],
        [tr('Where'), [d.board]],
        [tr('Work'), [d.work]],
        [tr('Pay'), [crownsText(d.pay)]],
        [tr('Risk'), [d.risk]],
        [tr('If it goes well'), [d.success.join('; ')]],
        [tr('If it fails'), [d.failure.join('; ')]],
      ];
      const take = el('button', { className: d.take.enabled ? 'choice' : 'choice grey', type: 'button' }, tr('Take the work'));
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
      // the facts scroll on a small screen; the buttons stay at the bottom of the window
      side.append(el('div', { className: 'board-details-scroll' },
        el('h3', {}, d.title, el('span', { className: 'board-level-word' }, ` · ${tr('level {n} of 3', { n: d.level })} `), el('span', { className: 'board-offer-level', ariaHidden: 'true' }, levelDots(d.level))),
        el('dl', { className: 'board-facts' }, ...rows.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, ...value)])),
        el('p', { className: 'note' }, d.until)),
        actions,
      );
    }
    parts.push(el('div', { className: 'board-body' }, list, side));
  }
  const frame = modalFrame({ title: tr(tr('Work board')), pinned: false, onClose: props.onClose, kind: 'board' }, ...parts);
  // Up and Down move along the offers wherever the focus is in the window; Enter on an offer or the heading takes it (D-448)
  frame.onkeydown = (e) => {
    const at = selected === null ? -1 : ids.indexOf(selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = ids[Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next !== undefined) props.onSelect(next);
      return;
    }
    const on = e.target instanceof HTMLElement && (e.target.classList.contains('board-offer') || e.target.classList.contains('modal-title'));
    if (e.key === 'Enter' && on && view.selected?.take.enabled) {
      e.preventDefault();
      props.onTake(view.selected.id);
    }
  };
  return frame;
}
