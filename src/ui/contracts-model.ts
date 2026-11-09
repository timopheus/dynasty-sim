import { actionAvailability, availableActions } from '../core/actions/actions';
import { priceCrowns } from '../core/economy/economy';
import { fullName } from '../core/character/character';
import { placesInReach } from '../core/contracts/board';
import { contractReasons, type Contract } from '../core/contracts/contracts';
import { findCharacter, getPlayer } from '../core/helpers';
import { placeDef, routesFrom, standingIn } from '../core/place/place';
import type { Ctx } from '../core/state';
import { crownsText, dateText, daysText, localName, tr } from './i18n';

/**
 * The board of work (CK.4; the contract board of RtP in the form of CK3, D-469, D-472): on the left the offers of the
 * boards within reach, by place, the nearest first; on the right the offer chosen — the employer, where and how long, the
 * pay, the risk as a word and a chance (D-463), what success and failure bring, until when it is offered — and "Take
 * the work" or, for work on another board, the way there. Pure: queries only.
 */
export interface OfferRow {
  id: string;
  /** The kind as the board names it: "A letter to carry". */
  title: string;
  level: number;
  pay: number;
  /** "In Ostmere, 6 days" or "To Valmont, 9 days". */
  where: string;
  /** Who offers it: two offers of one kind differ by their employers. */
  employer: string;
  /** "low (25%)". */
  risk: string;
}

export interface BoardPlace {
  id: string;
  name: string;
  /** Days of the way from the hero; 0 for the place he stands in. */
  days: number;
  here: boolean;
  offers: OfferRow[];
}

export interface OfferDetails {
  id: string;
  title: string;
  level: number;
  employer: { id: string; name: string; occupation: string };
  /** The board it hangs on, and how far the hero is from it. */
  board: string;
  /** What the work is in days and where. */
  work: string;
  pay: number;
  /** The risk as the board says it, with the chance of trouble halfway. */
  risk: string;
  success: string[];
  failure: string[];
  until: string;
  /** "Take the work": enabled, or grey with the reason. */
  take: { enabled: boolean; reason: string };
  /** Work on another board: the way there, when the hero may set out now. */
  travel: { actionId: string; target: string; label: string } | null;
}

export interface BoardView {
  places: BoardPlace[];
  selected: OfferDetails | null;
  /** The work under way, if any: one line above the list. */
  current: string | null;
  /** Nothing on the boards within reach: why the list is empty. */
  empty: string | null;
}

/** Levels as the board shows them: dots, filled to the level, of three. */
export function levelDots(level: number): string {
  return `${'●'.repeat(level)}${'○'.repeat(Math.max(0, 3 - level))}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function riskOf(ctx: Ctx, offer: Contract): { word: string; chance: number } {
  const contracts = ctx.content.contracts;
  const id = contracts?.kinds.find((k) => k.id === offer.kind)?.offer?.risk;
  const risk = contracts?.board?.risks.find((r) => r.id === id);
  return { word: risk?.name ?? 'unknown', chance: risk?.chance ?? 0 };
}

function placeName(ctx: Ctx, id: string): string {
  return placeDef(ctx.state, ctx.content, id)?.name ?? id;
}

function whereText(ctx: Ctx, o: Contract): string {
  return o.to === null ? tr('In {place}, {days}', { place: localName(placeName(ctx, o.place), 'prep'), days: daysText(o.days) }) : tr('To {place}, {days}', { place: localName(placeName(ctx, o.to), 'acc'), days: daysText(o.days) });
}

function rowOf(ctx: Ctx, o: Contract): OfferRow {
  const kind = ctx.content.contracts?.kinds.find((k) => k.id === o.kind);
  const employer = findCharacter(ctx.state, o.employer);
  const risk = riskOf(ctx, o);
  return { id: o.id, title: capital(kind?.name ?? o.kind), level: o.level, pay: o.pay, where: whereText(ctx, o), employer: employer ? localName(fullName(employer)) : tr('someone'), risk: `${risk.word} (${risk.chance}%)` };
}

/** The work under way, as the board and the block "where I am" say it: "A letter to carry for John Calder". */
export function workLine(ctx: Ctx): string | null {
  const { state, content } = ctx;
  const current = state.contracts.current;
  if (!current || state.activeAction?.contract !== current.id) return null;
  const kind = content.contracts?.kinds.find((k) => k.id === current.kind);
  const employer = findCharacter(state, current.employer);
  return tr('{work} for {employer}', { work: capital(kind?.name ?? current.kind), employer: employer ? localName(fullName(employer), 'gen') : tr('someone') });
}

function details(ctx: Ctx, o: Contract, distance: number): OfferDetails {
  const { state, content } = ctx;
  const contracts = content.contracts;
  const kind = contracts?.kinds.find((k) => k.id === o.kind);
  const employer = findCharacter(state, o.employer);
  const english = employer ? fullName(employer) : null;
  const name = english ? localName(english) : tr('someone');
  const occupation = content.population?.occupations.find((x) => x.id === employer?.occupation)?.name ?? '';
  const here = standingIn(state, content) === o.place;
  const risk = riskOf(ctx, o);
  const favor = contracts?.favorLevel !== undefined && o.level >= contracts.favorLevel;
  const strong = favor && kind?.offer?.strongFavor === true && o.level >= 3;
  const success = [crownsText(o.pay), tr('{name} will think better of you', { name }), ...(favor ? [strong ? tr('{name} will owe you a great favor', { name }) : tr('{name} will owe you a favor', { name })] : [])];
  const failure = [tr('No pay'), tr('{name} will think worse of you', { name })];
  const at = (id: string, kase: 'prep' | 'gen' | 'acc') => localName(placeName(ctx, id), kase);
  const work = o.to === null ? tr('{days} of work in {place}', { days: daysText(o.days), place: at(o.place, 'prep') }) : tr('{days} on the road from {from} to {to}', { days: daysText(o.days), from: at(o.place, 'gen'), to: at(o.to, 'acc') });
  const board = here ? tr('On the board here, in {place}', { place: at(o.place, 'prep') }) : tr('On the board in {place}, {days} away', { place: at(o.place, 'prep'), days: daysText(distance) });

  const serve = content.actions.find((a) => a.target === 'contract');
  const free = (state.status === 'awaiting_action' || state.status === 'running') && state.pendingEvent === null;
  // work under way comes first: no second job, and no way to another board that would leave this one half done
  const busy = state.contracts.current !== null;
  let take: OfferDetails['take'];
  if (!free) take = { enabled: false, reason: tr('Answer the window first') };
  else if (busy) take = { enabled: false, reason: contractReasons(state, content).join('; ') || tr('You already have work') };
  else if (!here) take = { enabled: false, reason: tr('Go to {place} first', { place: at(o.place, 'gen') }) };
  else {
    const reasons = contractReasons(state, content);
    const unmet = serve ? (actionAvailability(ctx).find((a) => a.action.id === serve.id)?.unmet ?? []) : [];
    const usable = serve !== undefined && availableActions(ctx).includes(serve);
    take = reasons.length > 0 ? { enabled: false, reason: reasons.join('; ') } : usable ? { enabled: true, reason: '' } : { enabled: false, reason: unmet.join('; ') || tr('Not now') };
  }
  const journey = content.actions.find((a) => a.target === 'place');
  const canTravel = !here && !busy && free && journey !== undefined && availableActions(ctx).includes(journey) && state.activeAction?.target !== o.place;
  // the way there says its days and its price, as on the panel and the page of the place (D-443)
  const cost = journey ? (journey.effects?.pay !== undefined ? priceCrowns(content, state, getPlayer(state), journey.effects.pay) : 0) + Math.max(0, -(journey.effects?.money ?? 0)) : 0;
  const travel = canTravel && journey ? { actionId: journey.id, target: o.place, label: `${tr('Travel to {place}', { place: at(o.place, 'acc') })} (${daysText(distance)}${cost > 0 ? ` · ${crownsText(cost)}` : ''})` } : null;
  return {
    id: o.id,
    title: capital(kind?.name ?? o.kind),
    level: o.level,
    employer: { id: o.employer, name, occupation },
    board,
    work,
    pay: o.pay,
    risk: tr('{risk}: {chance}% chance of trouble', { risk: capital(risk.word), chance: risk.chance }),
    success,
    failure,
    until: tr('Offered until {date}', { date: dateText(o.expires) }),
    take,
    travel,
  };
}

/** The board as the window shows it, with the offer `selected` chosen (the first one here, else the first, if none). */
export function boardView(ctx: Ctx, selected: string | null): BoardView {
  const { state, content } = ctx;
  const reach = placesInReach(state, content);
  const days = new Map(routesFrom(state, content).map((r) => [r.to, r.days]));
  const here = standingIn(state, content);
  const places: BoardPlace[] = [];
  for (const id of reach) {
    const offers = state.contracts.offers.filter((o) => o.place === id && o.expires >= state.day);
    if (offers.length === 0) continue;
    places.push({ id, name: placeName(ctx, id), days: id === here ? 0 : (days.get(id) ?? 0), here: id === here, offers: offers.map((o) => rowOf(ctx, o)) });
  }
  places.sort((a, b) => a.days - b.days || reach.indexOf(a.id) - reach.indexOf(b.id));
  const all = places.flatMap((p) => p.offers.map((o) => ({ o, p })));
  const chosen = all.find((x) => x.o.id === selected) ?? all.find((x) => x.p.here) ?? all[0];
  const offer = chosen ? state.contracts.offers.find((o) => o.id === chosen.o.id) : undefined;
  return {
    places,
    selected: offer && chosen ? details(ctx, offer, chosen.p.days) : null,
    current: workLine(ctx),
    empty: places.length === 0 ? tr('No work on the boards within reach. New offers come every month.') : null,
  };
}

/** How many offers hang on the board of each place within reach, by record id: the pins of the map. */
export function offersByPlace(ctx: Ctx): Map<string, number> {
  const { state, content } = ctx;
  const out = new Map<string, number>();
  for (const id of placesInReach(state, content)) {
    const n = state.contracts.offers.filter((o) => o.place === id && o.expires >= state.day).length;
    if (n > 0) out.set(id, n);
  }
  return out;
}
