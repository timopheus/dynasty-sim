import { fameWord } from '../core/character/stats';
import type { Content } from '../core/content/schema';
import { getPlayer } from '../core/helpers';
import { houseOf, renownWord, statusName } from '../core/house/house';
import type { GameState } from '../core/state';
import { withNumber } from './access';

/** One figure of the header: the value on top, what it is below. */
export interface Figure {
  value: string;
  label: string;
}

/** The shared figures of the header (D-438): money, fame, the renown and status of the house. Pure. */
export function headerFigures(state: GameState, content: Content): Figure[] {
  const hero = getPlayer(state);
  const house = houseOf(state, hero);
  const figures: Figure[] = [
    { value: `${hero.money} crowns`, label: 'money' },
    { value: withNumber(fameWord(content, hero) || 'Unknown', hero.fame), label: 'fame' },
  ];
  if (house) {
    figures.push(
      { value: withNumber(renownWord(content, house.renown) || 'Unknown', house.renown), label: 'house renown' },
      { value: statusName(content, house.status) || 'None', label: 'house status' },
    );
  }
  return figures;
}
