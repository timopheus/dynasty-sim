import { fameWord } from '../core/character/stats';
import { monthlyBalance } from '../core/economy/balance';
import type { Content } from '../core/content/schema';
import { getPlayer } from '../core/helpers';
import { houseOf, renownWord, statusName } from '../core/house/house';
import type { GameState } from '../core/state';
import { withNumber } from './access';
import { crownsText, tr } from './i18n';

/** One figure of the header: the value on top, what it is below. */
export interface Figure {
  value: string;
  label: string;
  /** Under the value, always visible (D-248): the monthly balance of the money, «+8 / month». */
  note?: string;
  /** What the note is made of, one line each, behind a button — never behind a hover. */
  breakdown?: string[];
}

/** «+8» or «−5» with the real minus sign. */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/** The shared figures of the header (D-438): money, fame, the renown and status of the house. Pure. */
export function headerFigures(state: GameState, content: Content): Figure[] {
  const hero = getPlayer(state);
  const house = houseOf(state, hero);
  const balance = content.economy ? monthlyBalance({ state, content }, hero) : null;
  const money: Figure = { value: crownsText(hero.money), label: tr('money') };
  if (balance) {
    money.note = tr('{sum} / month', { sum: signed(balance.total) });
    money.breakdown = balance.lines.map((l) => `${l.label} ${signed(l.amount)}`);
  }
  const figures: Figure[] = [
    money,
    { value: withNumber(fameWord(content, hero) || tr('Unknown'), hero.fame), label: tr('fame') },
  ];
  if (house) {
    figures.push(
      { value: withNumber(renownWord(content, house.renown) || tr('Unknown'), house.renown), label: tr('house renown') },
      { value: statusName(content, house.status) || tr('None'), label: tr('house status') },
    );
  }
  return figures;
}
