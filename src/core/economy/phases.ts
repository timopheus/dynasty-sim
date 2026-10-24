import { log } from '../chronicle/log';
import { findCharacter } from '../helpers';
import type { DayPhase } from '../state';
import { toYmd } from '../time/calendar';
import { monthlyBalance } from './balance';

/**
 * The day phase of the economy (S.7, D-326): on the first day it sees of a new month, the hero gets the balance of each month
 * passed since the last one (`monthlyBalance`; a day another phase ended is never seen by this one). The first day it ever runs only notes the month. Money may go below zero here and
 * only here (the price conditions allow no debt, D-441); the first time it does in a year the chronicle gets a line.
 * The payment itself is never passed to `log` as a sum: the monthly income would fill the chronicle (D-130). It
 * returns false: the economy never stops time by itself. No randomness.
 */
export const economyPhase: DayPhase = {
  id: 'economy',
  run(ctx) {
    const { state, content } = ctx;
    const economy = content.economy;
    if (!economy) return false;
    const { year, month } = toYmd(state.day);
    const key = year * 12 + month - 1;
    const last = state.economy.month;
    if (last === key) return false;
    state.economy.month = key;
    const hero = findCharacter(state, state.playerId);
    if (last === null || !hero || hero.deathDay !== null) return false;
    // Catching up: a day on which another phase ended the run is never seen by this one, so every month passed since
    // the last one counts, not only the one that begins today (D-053).
    const { total } = monthlyBalance(ctx, hero);
    for (let k = last + 1; k <= key; k++) {
      state.economy.balance = total;
      const before = hero.money;
      hero.money += total;
      const paidYear = Math.floor(k / 12);
      if (before >= 0 && hero.money < 0 && state.economy.debtYear !== paidYear) {
        state.economy.debtYear = paidYear;
        log(ctx, { subject: hero, kind: 'economy', level: 'chronicle', template: economy.texts.debt });
      }
    }
    return false;
  },
};
