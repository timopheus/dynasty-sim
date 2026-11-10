import { BOARD_ID, WILL_ID, type ActionButton, type Panel } from './actions-model';
import { el } from './dom';
import { withTip } from './tooltip';
import './actions-panel.css';
import { daysText, localName, tr } from './i18n';

export interface ActionsProps {
  panel: Panel;
  /** `target`: the record id of the place, for an action that goes somewhere (S.9). */
  onStart: (id: string, target?: string) => void;
}

/** The menu of directions is open or folded as the player left it: the clock draws the screen anew every day. */
let travelOpen = false;

/** A button of an action, as on the panel; also on the page of a place. */
export function buttonNode(b: ActionButton, onStart: ActionsProps['onStart'], target?: string): HTMLElement {
  const node = el('button', { className: b.grey ? 'action grey' : 'action', type: 'button' },
    el('span', { className: 'action-name' }, b.name),
    ...(b.info.length > 0 ? [el('span', { className: 'note' }, b.info.join(' · '))] : []),
    ...(b.grey ? [el('span', { className: 'reason' }, b.reason)] : []));
  if (b.grey) node.setAttribute('aria-disabled', 'true');
  else node.onclick = () => (target === undefined ? onStart(b.id) : onStart(b.id, target));
  node.setAttribute('data-action', b.id);
  if (target !== undefined) node.setAttribute('data-target', target);
  // the clock redraws the screen every day: this is how the focus finds its button again (keepView)
  node.setAttribute('data-focus', `action-${b.id}`);
  // the tip of CK3's kind (D-477): the name, what it takes and brings, the reasons it cannot be done now with a cross, what a click does
  return withTip(node, {
    title: b.name,
    text: b.info.join('\n'),
    ...(b.grey && b.reason ? { conds: b.reason.split('; ').map((text) => ({ ok: false, text })) } : {}),
    ...(b.grey ? {} : { mouse: [{ button: 'left' as const, text: b.id === BOARD_ID || b.id === WILL_ID ? tr('Open the window') : tr('Start') }] }),
  });
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
  const list = el('div', { className: 'directions-list' });
  for (const d of b.destinations ?? []) {
    const label = underWay ? tr('Turn toward {place}', { place: localName(d.name, 'dat') }) : tr('Travel to {place}', { place: localName(d.name, 'acc') });
    const node = el('button', { className: d.going ? 'action grey' : 'action', type: 'button' },
      el('span', { className: 'action-name' }, label),
      el('span', { className: d.going ? 'reason' : 'note' }, d.going ? tr('you are going there') : daysText(d.days)));
    if (d.going) node.setAttribute('aria-disabled', 'true');
    else node.onclick = () => { travelOpen = false; onStart(b.id, d.to); };
    node.setAttribute('data-action', b.id);
    node.setAttribute('data-target', d.to);
    node.setAttribute('data-focus', `action-${b.id}-${d.to}`);
    list.append(node);
  }
  details.append(list);
  return details;
}

/** The right panel (D-443): the actions of the hero by category; the information of an action is inside its button. */
export function actionsPanel(props: ActionsProps): HTMLElement {
  const aside = el('aside', { className: 'actions-panel', ariaLabel: tr('Your actions') });
  if (props.panel.note) aside.append(el('p', { className: 'meta panel-note' }, props.panel.note));
  for (const shelf of props.panel.shelves) {
    aside.append(el('section', { className: 'shelf' }, el('h2', {}, shelf.title),
      ...shelf.buttons.map((b) => (b.destinations ? directionsNode(b, props.onStart) : buttonNode(b, props.onStart)))));
  }
  return aside;
}
