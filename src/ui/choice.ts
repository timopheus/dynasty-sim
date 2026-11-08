import type { Control } from './access';
import { applyAttrs, el } from './dom';
import type { Tip } from './tips';
import { withTip } from './tooltip';

/** Small signs on a variant (D-463, as in CK3); plain symbols until the art bible gives icons (D-465). */
export interface ChoiceIcons {
  check: boolean;
  cost: boolean;
  trait: boolean;
}

const ICONS: { key: keyof ChoiceIcons; sign: string; word: string }[] = [
  { key: 'check', sign: '⚂', word: 'a chance' },
  { key: 'trait', sign: '✦', word: 'your nature' },
  { key: 'cost', sign: '◎', word: 'costs' },
];

/**
 * A choice as one button (D-448, D-463): its name with the key and small signs to the right (a die when there is a
 * check, a trait when it goes by or against the hero's nature, a coin when it costs); chance, outcomes, price and risk
 * are in the tip. A grey choice keeps its reason as text for a screen reader and in the tip.
 */
export function choiceNode(c: Control, onPick: (() => void) | null, extras: { icons?: ChoiceIcons; tip?: Tip | null } = {}): HTMLElement {
  const head = el('span', { className: 'choice-head' }, el('span', { className: 'choice-name' }, c.text));
  const signs = ICONS.filter((i) => extras.icons?.[i.key]);
  if (signs.length) {
    head.append(el('span', { className: 'choice-icons' }, ...signs.map((i) => {
      const sign = el('span', { className: `sign sign-${i.key}`, role: 'img' }, i.sign);
      sign.setAttribute('aria-label', i.word);
      return sign;
    })));
  }
  const button = el('button', { className: onPick ? 'choice' : 'choice grey', type: 'button' }, head);
  if (c.note) button.append(el('span', { className: 'note sr-only', id: c.noteId }, c.note));
  if (!onPick) button.append(el('span', { className: 'reason sr-only', id: c.reasonId }, c.reason));
  applyAttrs(button, c.attrs);
  if (onPick) button.onclick = onPick;
  // the clock redraws the window every day: this is how the focus finds its button again (keepView)
  button.setAttribute('data-focus', `choice-${c.noteId.replace(/-note$/, '')}`);
  withTip(button, extras.tip);
  return el('div', { className: onPick ? 'option' : 'unavailable' }, button);
}
