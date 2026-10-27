import type { ActionButton, Panel } from './actions-model';
import { el } from './dom';
import './actions-panel.css';

export interface ActionsProps {
  panel: Panel;
  onStart: (id: string) => void;
}

function buttonNode(b: ActionButton, onStart: (id: string) => void): HTMLElement {
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

/** The right panel (D-443): the actions of the hero by category; the information of an action is inside its button. */
export function actionsPanel(props: ActionsProps): HTMLElement {
  const aside = el('aside', { className: 'actions-panel', ariaLabel: 'Your actions' });
  if (props.panel.note) aside.append(el('p', { className: 'meta panel-note' }, props.panel.note));
  for (const shelf of props.panel.shelves) {
    aside.append(el('section', { className: 'shelf' }, el('h2', {}, shelf.title), ...shelf.buttons.map((b) => buttonNode(b, props.onStart))));
  }
  return aside;
}
