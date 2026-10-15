import { kill } from '../lifecycle';
import { chancePer } from '../rng';
import type { DayPhase } from '../state';
import { detailedCharacters } from '../world/world';
import { DAILY_DEATH_DENOMINATOR, dailyDeathChance, deathCause } from './mortality';

/** Daily health changes of detailed characters; filled by 2.9. */
export const healthPhase: DayPhase = { id: 'health', run: () => false };

/** Death roll for every detailed character. The player's death stops the day for succession. */
export const deathPhase: DayPhase = {
  id: 'death',
  run(ctx) {
    const { state } = ctx;
    let playerDied = false;
    for (const c of detailedCharacters(state)) {
      if (chancePer(state.rng, dailyDeathChance(ctx, c), DAILY_DEATH_DENOMINATOR)) {
        if (c.id === state.playerId) playerDied = true;
        kill(ctx, c, deathCause(c));
      }
    }
    return playerDied;
  },
};
