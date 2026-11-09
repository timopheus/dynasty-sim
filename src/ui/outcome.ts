import type { Outcome } from './outcome-model';
import { el } from './dom';
import { entryView } from './entry';
import { entryNode, partNodes } from './page';
import { modalFrame } from './modal';
import type { Control } from './access';
import { choiceNode } from './choice';
import './outcome.css';
import { tr } from './i18n';

/** The window after a choice with a stake (D-440): what was written that day, what changed, then "Continue". */
export function outcomeWindow(o: Outcome, heroId: string, heads: ReadonlySet<string>, cont: Control, onContinue: () => void): HTMLElement {
  const body: (Node | string)[] = [];
  if (o.died) {
    body.push(el('p', { className: 'died' }, tr('{name} has died.', { name: o.died.name }), o.died.heir ? ` ${tr('{heir} now leads the house.', { heir: o.died.heir })}` : ` ${tr('The house has no one left to lead it.')}`));
  }
  if (o.aftermath?.length) body.push(el('p', { className: 'aftermath' }, ...partNodes(el, o.aftermath)));
  if (o.lines.length) body.push(el('ul', { className: 'chronicle' }, ...o.lines.map((e) => entryNode(entryView(e, heroId, heads), e.day))));
  if (o.changes.length) {
    body.push(el('ul', { className: 'changes' }, ...o.changes.map((c) => el('li', {},
      el('span', { className: 'change-label' }, `${tr(c.label)}: `), c.from && c.to ? `${c.from} → ${c.to}` : c.to || c.from))));
  }
  if (body.length === 0) body.push(el('p', {}, tr('It is done.')));
  body.push(el('div', { className: 'choices' }, choiceNode(cont, onContinue)));
  return modalFrame({ title: o.died ? tr('The end of a life') : tr('What came of it'), pinned: true, kind: 'outcome' }, ...body);
}
