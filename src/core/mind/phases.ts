import { grantTrait } from '../character/holding';
import { log } from '../chronicle/log';
import { getPlayer } from '../helpers';
import type { DayPhase, NewGameHook, SuccessionHook } from '../state';
import { toYmd } from '../time/calendar';

/** New game (S.9a): the founder starts from the base of happiness. Without `mind` in the content, nothing. */
export const mindOnNewGame: NewGameHook = ({ state, content }) => {
  if (content.mind) state.mind.happiness = content.mind.happiness.base;
};

/**
 * A new head (D-461): happiness is the hero's alone, so the heir starts from the base, whatever the deceased felt. A
 * hook of SUCCESSION_HOOKS: this file never imports lifecycle.ts.
 */
export const mindOnSuccession: SuccessionHook = ({ state, content }) => {
  if (content.mind) state.mind.happiness = content.mind.happiness.base;
};

/**
 * The day phase of happiness (D-457, S.10, after the economy). On the first day of each month happiness falls with
 * poverty; at the bottom of the range (`mind.breakdown`) the hero breaks: a trait, a line in the chronicle and a rise to
 * `reset`; otherwise a month moves it one part of the distance toward the base (`mind.pull`, at least a point). Never stops time by
 * itself. A day another phase cut short skips its month once: the pull is slow, so a month late changes nothing.
 */
export const mindPhase: DayPhase = {
  id: 'mind',
  run(ctx) {
    const { state, content } = ctx;
    const mind = content.mind;
    const h = state.mind.happiness;
    if (!mind || h === null) return false;
    const monthStart = toYmd(state.day).day === 1;
    const hero = getPlayer(state);
    let now = h;
    if (monthStart && hero.money <= mind.poverty.money_max) now += mind.poverty.monthly;
    now = Math.min(mind.happiness.max, Math.max(mind.happiness.min, now));
    if (now <= mind.breakdown.at_most) {
      grantTrait(content, hero, mind.breakdown.trait);
      log(ctx, { subject: hero, kind: 'breakdown', level: 'chronicle', template: mind.breakdown.text });
      now = mind.breakdown.reset;
    } else if (monthStart) {
      const distance = mind.happiness.base - now;
      now += Math.sign(distance) * Math.max(1, Math.ceil(Math.abs(distance) / mind.pull.den));
    }
    state.mind.happiness = now;
    return false;
  },
};
