import { fameWord } from '../core/character/stats';
import { monthlyBalance } from '../core/economy/balance';
import type { Content } from '../core/content/schema';
import { getPlayer } from '../core/helpers';
import { houseOf, renownWord, statusName } from '../core/house/house';
import type { GameState } from '../core/state';
import { withNumber } from './access';
import { conceptName } from './concepts';
import { crownsText, tr } from './i18n';
import { HEADER_TIPS, signedRow, type Tip } from './tips';

/** One figure of the header: the value on top, what it is below. */
export interface Figure {
  value: string;
  label: string;
  /** Under the value, always visible (D-248): the monthly balance of the money, «+8 / month». */
  note?: string;
  /** What the note is made of, one line each, behind a button — never behind a hover. */
  breakdown?: string[];
  /** The tip of the figure (TT.1): a breakdown for the money, the dictionary's words for the rest. */
  tip?: Tip;
}

/** «+8» or «−5» with the real minus sign. */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/** The tip of a figure that has no breakdown: its name with the value as the title, then its words. */
function figureTip(label: 'fame' | 'house renown' | 'house status', value: string): Tip {
  const name = conceptName(label === 'fame' ? 'fame' : label === 'house renown' ? 'house-renown' : 'house-status');
  return { title: `${name}: ${value}`, text: tr(HEADER_TIPS[label] ?? '') };
}

/** The shared figures of the header (D-438): money, fame, the renown and status of the house. Pure. */
export function headerFigures(state: GameState, content: Content): Figure[] {
  const hero = getPlayer(state);
  const house = houseOf(state, hero);
  const balance = content.economy ? monthlyBalance({ state, content }, hero) : null;
  const money: Figure = { value: crownsText(hero.money), label: 'money' };
  if (balance) {
    money.note = tr('{sum} / month', { sum: signed(balance.total) });
    money.breakdown = balance.lines.map((l) => `${l.label} ${signed(l.amount)}`);
    const tone = balance.total > 0 ? 'good' : balance.total < 0 ? 'bad' : 'zero';
    money.tip = {
      title: `${tr('Money')}: ${money.value}`,
      text: tr(HEADER_TIPS.money ?? ''),
      rows: balance.lines.map((l) => signedRow(l.label, l.amount)),
      total: { label: tr('Per month'), value: signed(balance.total), tone },
    };
  }
  const figures: Figure[] = [
    money,
    { value: withNumber(fameWord(content, hero) || tr('Unknown'), hero.fame), label: 'fame' },
  ];
  const fame = figures[1];
  if (fame) fame.tip = figureTip('fame', fame.value);
  if (house) {
    figures.push(
      { value: withNumber(renownWord(content, house.renown) || tr('Unknown'), house.renown), label: 'house renown', tip: figureTip('house renown', withNumber(renownWord(content, house.renown) || tr('Unknown'), house.renown)) },
      { value: statusName(content, house.status) || tr('None'), label: 'house status', tip: figureTip('house status', statusName(content, house.status) || tr('None')) },
    );
  }
  return figures;
}
