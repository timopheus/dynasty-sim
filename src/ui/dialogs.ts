import type { Command } from '../core/game';
import { el } from './dom';
import { modalFrame } from './modal';
import { willCommandOf, type PersonChoice, type WillForm } from './will';

/** A list of people to pick one from; the empty value leaves the term to the law. */
function willSelect(id: string, label: string, empty: string, people: PersonChoice[], value: string | null): { field: HTMLElement; input: HTMLSelectElement } {
  const input = document.createElement('select');
  input.id = id;
  input.append(el('option', { value: '' }, empty));
  for (const p of people) input.append(el('option', { value: p.id, selected: p.id === value }, p.label));
  return { field: el('p', {}, el('label', { htmlFor: id }, label), ' ', input), input };
}

/** The will window (D-314): heir and guardian, the price, "Go to the notary" and "Cancel". */
export function willWindow(form: WillForm, onCommand: (cmd: Command) => void, cancel: () => void): HTMLElement {
  const lawHeir = form.heirs[0];
  const heir = willSelect('will-heir', 'Main heir:', lawHeir ? `Leave it to the law (${lawHeir.label})` : 'Leave it to the law', form.heirs, form.current?.heir ?? null);
  const guardian = willSelect('will-guardian', 'Guardian of an heir under age:', 'Leave it to the law', form.guardians, form.current?.guardian ?? null);
  const status = form.current
    ? form.current.stale ? 'Your will is out of date: write a new one, or the law fills what it no longer says.' : 'You have a will. A new one replaces it.'
    : 'You have no will: the law decides who inherits.';
  const go = el('button', { className: 'choice', type: 'button' }, `Go to the notary (${form.cost} crowns, a few days)`);
  const parts: (Node | string)[] = [el('p', {}, status), heir.field, guardian.field];
  if (form.heirs.length === 0 && form.endsWithoutKin) parts.push(el('p', {}, 'You have no kin to name: without kin the house will end with you.'));
  if (form.reasons.length > 0) {
    go.className = 'choice grey';
    go.setAttribute('aria-disabled', 'true');
    parts.push(el('div', { className: 'unavailable' }, go, el('span', { className: 'reason' }, form.reasons.join('; '))));
  } else {
    go.onclick = () => onCommand(willCommandOf(heir.input.value, guardian.input.value));
    parts.push(el('div', { className: 'option' }, go));
  }
  parts.push(el('div', { className: 'modal-actions' }, el('button', { className: 'link', type: 'button', onclick: cancel }, 'Cancel')));
  return modalFrame({ title: 'Your will', pinned: false, onClose: cancel, kind: 'will' }, ...parts);
}

/** A question inside the page, in place of the browser's `confirm()`, which an embedded page may not show. */
export function confirmWindow(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): HTMLElement {
  return modalFrame({ title, pinned: false, onClose: onNo, kind: 'confirm' },
    el('p', {}, text),
    el('div', { className: 'modal-actions' },
      el('button', { className: 'choice', type: 'button', onclick: onYes, id: 'confirm-yes' }, yes),
      el('button', { className: 'choice', type: 'button', onclick: onNo, id: 'confirm-no' }, 'Cancel')));
}

