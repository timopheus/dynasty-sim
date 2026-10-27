import type { ActionButton, Panel } from './actions-model';
import { daysWord } from '../core/pages/place';
import { el } from './dom';
import './actions-panel.css';

export interface ActionsProps {
  panel: Panel;
  /** `target`: the record id of the place, for an action that goes somewhere (S.9). */
  onStart: (id: string, target?: string) => void;
}

/** The menu of directions is open or folded as the player left it: the clock draws the screen anew every day. */
let travelOpen = false;

function buttonNode(b: ActionButton, onStart: ActionsProps['onStart']): HTMLElement {
  const node = el('button', { className: b.grey ? 'action grey' : 'action', type: 'button' },
    el('span', { className: 'action-name' }, b.name),
    ...(b.info.length > 0 ? [el('span', { className: 'note' }, b.info.join(' · '))] : []),
    ...(b.grey ? [el('span', { className: 'reason' }, b.reason)] : []));
  if (b.grey) node.setAttribute('aria-disabled', 'true');
  else node.onclick = () => onStart(b.id);
  node.setAttribute('data-action', b.id);
  // the clock redraws the screen every day: this is how the focus finds its button again (keepView)
  node.setAttribute('data-focus', `action-${b.id}`);
  // the button says all there is (D-448): the name, the days, the price, the reason; so no tip repeats it (D-465)
  return node;
}

/**
 * An action that goes somewhere is a folding list of directions (S.9): "Travel to X" with the days of the way, the
 * nearest first. Under way, the place the hero is going to is grey and the others turn him (D-462).
 */
function directionsNode(b: ActionButton, onStart: ActionsProps['onStart']): HTMLElement {
  const details = el('details', { className: 'directions', open: travelOpen });
  details.addEventListener('toggle', () => { travelOpen = details.open; });
  const underWay = (b.destinations ?? []).some((d) => d.going);
  details.append(el('summary', { className: 'action-name', tabIndex: 0 }, b.name, ...(b.info.length > 0 ? [el('span', { className: 'note' }, ` ${b.info.join(' · ')}`)] : [])));
  for (const d of b.destinations ?? []) {
    const label = underWay ? `Turn toward ${d.name}` : `Travel to ${d.name}`;
    const node = el('button', { className: d.going ? 'action grey' : 'action', type: 'button' },
      el('span', { className: 'action-name' }, label),
      el('span', { className: d.going ? 'reason' : 'note' }, d.going ? 'you are going there' : daysWord(d.days)));
    if (d.going) node.setAttribute('aria-disabled', 'true');
    else node.onclick = () => onStart(b.id, d.to);
    node.setAttribute('data-action', b.id);
    node.setAttribute('data-target', d.to);
    node.setAttribute('data-focus', `action-${b.id}-${d.to}`);
    details.append(node);
  }
  return details;
}

/** The right panel (D-443): the actions of the hero by category; the information of an action is inside its button. */
export function actionsPanel(props: ActionsProps): HTMLElement {
  const aside = el('aside', { className: 'actions-panel', ariaLabel: 'Your actions' });
  if (props.panel.note) aside.append(el('p', { className: 'meta panel-note' }, props.panel.note));
  for (const shelf of props.panel.shelves) {
    aside.append(el('section', { className: 'shelf' }, el('h2', {}, shelf.title),
      ...shelf.buttons.map((b) => (b.destinations ? directionsNode(b, props.onStart) : buttonNode(b, props.onStart)))));
  }
  return aside;
}
