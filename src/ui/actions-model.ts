import { actionAvailability } from '../core/actions/actions';
import type { ActionCategory, ActionDef } from '../core/actions/content';
import { getPlayer } from '../core/helpers';
import { priceCrowns, workCrowns } from '../core/economy/economy';
import { placeDef, routesFrom } from '../core/place/place';
import type { Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';
import type { WillForm } from './will';

/** A button of the actions panel (D-443): everything the player reads about the action is in it (D-448). */
export interface ActionButton {
  /** The action to start, or `will` for the button of the will window (the will is not an action of the content). */
  id: string;
  name: string;
  /** Lines under the name: how long, what it costs or brings. */
  info: string[];
  grey: boolean;
  /** Why not now, as text. */
  reason: string;
  /**
   * An action that goes somewhere (`target: place`, S.9) is a menu of directions: one entry per place the hero can go to
   * from where he is now, the nearest first. Not for a grey button.
   */
  destinations?: Destination[];
}

/** A direction of the menu "Travel": the place (record id), the days of the shortest way, and whether it is the end of the journey now under way. */
export interface Destination {
  to: string;
  name: string;
  days: number;
  /** The hero is already going there. */
  going: boolean;
}

export interface Shelf {
  category: ActionCategory;
  title: string;
  buttons: ActionButton[];
}

export const SHELVES: { category: ActionCategory; title: string }[] = [
  { category: 'livelihood', title: 'Livelihood' },
  { category: 'road', title: 'Road & place' },
  { category: 'family', title: 'Family & house' },
  { category: 'self', title: 'Self' },
];

export const WILL_ID = 'will';

function daysText(a: ActionDef): string {
  const { min, max } = a.duration;
  return min === max ? `${min} days` : `${min}–${max} days`;
}

/** Cost and income the action shows, from what the content says it does (S.7); nothing it does not say. */
function moneyInfo(ctx: Ctx, a: ActionDef): string[] {
  const hero = getPlayer(ctx.state);
  const out: string[] = [];
  const cost = (a.effects?.pay !== undefined ? priceCrowns(ctx.content, ctx.state, hero, a.effects.pay) : 0) + Math.max(0, -(a.effects?.money ?? 0));
  if (cost > 0) out.push(`costs ${cost} crowns`);
  const monthly = workCrowns(ctx.content, a.id);
  if (monthly > 0) out.push(`+${monthly} / month`);
  return out;
}

/**
 * Whether the hero has grown out of the action for good (D-443): an upper age that is past never comes back, so the
 * action is left off the panel. A child still sees the grown-up ones, grey with the reason.
 */
export function outgrown(ctx: Ctx, a: ActionDef): boolean {
  const max = a.when?.age_max;
  return max !== undefined && ageYears(getPlayer(ctx.state).birthDay, ctx.state.day) > max;
}

/** The places the hero can go to now, the nearest first; ties in the order of the content. */
function destinations(ctx: Ctx): Destination[] {
  const going = ctx.state.activeAction?.target ?? null;
  return routesFrom(ctx.state, ctx.content)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.days - b.r.days || a.i - b.i)
    .map(({ r }) => ({ to: r.to, name: placeDef(ctx.state, ctx.content, r.to)?.name ?? r.to, days: r.days, going: r.to === going }));
}

export interface Panel {
  shelves: Shelf[];
  /** Why nothing can be done now (the house is over, a window waits): above the shelves, or alone when there are none. */
  note: string | null;
}

/**
 * The right panel (D-443): the actions of the hero by shelf. The will is a button of the interface (4.6); it stands on
 * the shelf "Family & house". While a window holds the hero, the buttons are grey and `note` says why. Pure.
 */
export function actionShelves(ctx: Ctx, will: WillForm | null): Panel {
  const { state } = ctx;
  if (state.status === 'ended') return { shelves: [], note: 'The house has come to an end.' };
  if (state.backstory.running) return { shelves: [], note: 'Nothing to do until you have grown up.' };
  // an action under way may be changed for another (S.6): only a window that waits for an answer holds the hero
  const choosing = state.status === 'awaiting_action' || state.status === 'running';
  const held = !choosing || state.pendingEvent !== null ? 'Answer the window first' : '';
  const underWay = state.activeAction?.actionId ?? null;
  const shelves: Shelf[] = SHELVES.map((s) => ({ ...s, buttons: [] }));
  for (const { action, unmet, hidden } of actionAvailability(ctx)) {
    if (hidden || outgrown(ctx, action)) continue;
    const shelf = shelves.find((s) => s.category === action.category);
    // a journey under way may be turned toward another place (D-462): its menu stays open
    const turnable = action.target !== undefined;
    const reasons = held ? [] : action.id === underWay && !turnable ? ['you are doing this now'] : unmet;
    const grey = held !== '' || reasons.length > 0;
    const button: ActionButton = { id: action.id, name: action.name, info: [...(turnable ? [] : [daysText(action)]), ...moneyInfo(ctx, action)], grey, reason: reasons.join('; ') };
    if (turnable && !grey) button.destinations = destinations(ctx);
    shelf?.buttons.push(button);
  }
  if (will) {
    const atNotary = underWay !== null && underWay === ctx.content.succession?.willAction;
    const reasons = held ? [] : atNotary ? ['you are at the notary now'] : will.reasons;
    shelves.find((s) => s.category === 'family')?.buttons.push({
      id: WILL_ID, name: 'Draw up a will', info: ['at the notary', `${will.cost} crowns`], grey: held !== '' || reasons.length > 0, reason: reasons.join('; '),
    });
  }
  // one line above the panel instead of the same reason on every button
  return { shelves: shelves.filter((s) => s.buttons.length > 0), note: held || null };
}
