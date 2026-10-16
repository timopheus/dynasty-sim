import { findTrait } from '../core/character/holding';
import { fameWord, stats, statWord } from '../core/character/stats';
import { STAT_IDS } from '../core/character/stat-ids';
import type { Content } from '../core/content/schema';
import { conditionsText } from '../core/health/course';
import { getPlayer } from '../core/helpers';
import type { GameState } from '../core/state';
import { ageYears } from '../core/time/calendar';

export interface HeroView {
  name: string;
  surname: string;
  sex: string;
  age: number;
  fame: string;
  /** Word for the player, the number only on hover (D-031, D-037). */
  stats: { id: string; label: string; word: string; value: number }[];
  education: string[];
  traits: string[];
  conditions: string;
  money: number;
}

/** What the hero screen shows. Pure, so it can be tested without a DOM. */
export function heroView(state: GameState, content: Content): HeroView {
  const hero = getPlayer(state);
  const values = stats({ state, content }, hero);
  const names = (category: 'education' | 'other') =>
    hero.traits.flatMap((id) => {
      const def = findTrait(content, id);
      if (!def || (def.category === 'education') !== (category === 'education')) return [];
      return [def.name];
    });
  return {
    name: `${hero.givenName} ${hero.surname}`,
    surname: hero.surname,
    sex: hero.sex,
    age: ageYears(hero.birthDay, state.day),
    fame: fameWord(content, hero),
    stats: STAT_IDS.map((id) => ({ id, label: id[0]?.toUpperCase() + id.slice(1), word: statWord(content, values[id]), value: values[id] })),
    education: names('education'),
    traits: names('other'),
    conditions: conditionsText(content, hero),
    money: hero.money,
  };
}
