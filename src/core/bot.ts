import { availableActions } from './actions/actions';
import type { ActionDef } from './actions/content';
import { getPlayer } from './helpers';
import { BOT_CHARACTERS, isBotCharacter, scoreOf, type BotCharacter } from './bots/characters';
import { actionFeatures, optionFeatures } from './bots/features';
import type { Content } from './content/schema';
import { pendingEventDef } from './events/events';
import { sceneOf, type OptionDef } from './events/content';
import { eventView } from './events/view';
import { MAX_WAIT_DAYS, type Command } from './game';
import { proposalOptions } from './family/proposals';
import { chancePer, pick, type RngState } from './rng';
import type { Ctx, GameState } from './state';
import { willGuardians, willHeirs, willItems, willReceivers } from './succession/law';
import { willReasons } from './succession/phases';

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

/** Chances per decision, out of 100, that a bot of any character goes to the notary or proposes a match (4.6, D-365). */
const WILL_PER_100 = 3;
const PROPOSE_PER_100 = 5;

/**
 * Between actions the bot sometimes writes a will (none yet, or an out-of-date one; there is kin to name) or proposes a
 * match from `proposalOptions` of the people near the hero (D-313). It draws on its own generator only when such a
 * command is possible, so a game without kin and matches plays as before (D-365).
 */
function houseCommand(ctx: Ctx, rng: RngState): Command | null {
  const { state } = ctx;
  const hero = getPlayer(state);
  const reasons = willReasons(ctx);
  if (reasons !== null && reasons.length === 0 && (state.will === null || state.will.stale)) {
    const heirs = willHeirs(state, hero.id);
    if (heirs.length > 0 && chancePer(rng, WILL_PER_100, 100)) {
      const heir = pick(rng, [null, ...heirs.map((c) => c.id)]);
      const guardian = pick(rng, [null, ...willGuardians(ctx, hero).map((c) => c.id)]);
      // each thing to someone near or, when null is drawn, to the heir (D-427); no draw without things
      const receivers = willReceivers(state, hero).map((c) => c.id);
      const items = receivers.length === 0 ? [] : willItems(state, hero).flatMap((h) => {
        const to = pick(rng, [null, ...receivers]);
        return to === null ? [] : [{ item: h.id, to }];
      });
      return { type: 'will', heir, guardian, items };
    }
  }
  const options = [...state.household, ...state.circle].flatMap((id) => proposalOptions(ctx, id));
  if (options.length > 0 && chancePer(rng, PROPOSE_PER_100, 100)) {
    const { suitor, target } = pick(rng, options);
    return { type: 'propose', suitor, target };
  }
  return null;
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
  // An action under way: let the days pass until the next decision, as the old `start` did (D-439).
  if (state.status === 'running') return { type: 'wait', days: MAX_WAIT_DAYS };
  const house = houseCommand(ctx, rng);
  if (house) return house;
  // The bot acts on purpose: living one's own life (`idle`, S.6) is no plan, and a cautious bot would take it always
  // (nothing in it risks anything). The pace of living is measured on its own (S.6), not through the bot.
  const available = availableActions(ctx);
  const actions = available.some((a) => !a.idle) ? available.filter((a) => !a.idle) : available;
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
