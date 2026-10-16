import { availableActions } from './actions/actions';
import type { ActionDef } from './actions/content';
import { getPlayer } from './helpers';
import { BOT_CHARACTERS, isBotCharacter, scoreOf, type BotCharacter } from './bots/characters';
import { actionFeatures, optionFeatures } from './bots/features';
import type { Content } from './content/schema';
import { pendingEventDef } from './events/events';
import { sceneOf, type OptionDef } from './events/content';
import { eventView } from './events/view';
import type { Command } from './game';
import { pick, type RngState } from './rng';
import type { GameState } from './state';

export { BOT_CHARACTERS, isBotCharacter, type BotCharacter };

/** The best of the items by score; ties go to the bot's own generator. Nothing but the bot's generator is consumed. */
function bestOf<T>(rng: RngState, items: readonly T[], score: (item: T) => number): T {
  let best: T[] = [];
  let top = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > top) {
      top = s;
      best = [item];
    } else if (s === top) best.push(item);
  }
  return pick(rng, best);
}

/**
 * Player for headless runs (D-247, D-319). It has its own generator so its choices do not shift the world's random
 * sequence, and that generator is not saved. In an event it picks only among the options the player could press.
 *
 * `random` picks any such option or action. The other characters score each answer by the signs the content
 * already has (check chance, `kill`/`wound`, `money`, scheduled challenges, `mood`; see `bots/features.ts`) and take
 * the best one (events) or draw among the better half (actions). A bot of any character plays the same worldwide: only its own generator differs.
 */
export function botCommand(state: GameState, content: Content, rng: RngState, character: BotCharacter = 'random'): Command {
  const ctx = { state, content };
  const view = eventView(ctx);
  if (view) {
    const options = view.options.filter((o) => o.available);
    if (character === 'random') return { type: 'choose', option: pick(rng, options).index };
    const event = pendingEventDef(state, content);
    if (!event) throw new Error('A view without a pending event');
    const scene = sceneOf(event, state.pendingEvent?.page ?? null);
    const best = bestOf(rng, options, (o) => {
      const def = scene.options?.[o.index] as OptionDef | undefined;
      // A notice has one answer; its outcome is the same whatever is pressed.
      if (!def) return 0;
      return scoreOf(character, optionFeatures(content, event, def, o.chance?.percent ?? null));
    });
    return { type: 'choose', option: best.index };
  }
  const actions = availableActions(ctx);
  if (character === 'random') return { type: 'start', actionId: pick(rng, actions).id };
  // An action is a leaning, not a rule: a bot that always took the best-scored one would repeat it for a lifetime.
  // It draws among the better half, and a hero in debt weighs money more.
  const debt = getPlayer(state).money < 0;
  const score = (a: ActionDef) => {
    const f = actionFeatures(content, a);
    return scoreOf(character, f) + (debt ? f.money : 0);
  };
  const ranked = actions.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s);
  const cut = (ranked[Math.max(1, Math.ceil(ranked.length / 2)) - 1] as { s: number }).s;
  // Everything scoring at least as the last one of the better half: equal scores do not depend on the order in content.
  return { type: 'start', actionId: pick(rng, ranked.filter((r) => r.s >= cut)).a.id };
}
