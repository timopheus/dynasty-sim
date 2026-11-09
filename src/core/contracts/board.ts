import type { Content } from '../content/schema';
import { findCharacter } from '../helpers';
import { currentPoint, placeDef, routesFrom, routesFromPlace } from '../place/place';
import { int, pick, seedRng, weightedPick } from '../rng';
import type { Character, Ctx, GameState } from '../state';
import { ageYears, toYmd } from '../time/calendar';
import { postOffer } from './contracts';

/**
 * Stream of the boards in `seedRng(seed, stream)` (CK.3): a month and a place apart, like the weather (S.9), so the boards
 * never move the random sequence of the world and are the same whenever in the month they are made.
 */
const BOARD_STREAM = 0x6b000000;
/** Places have a row of their own in the stream of a month, 64 at most (as the weather). */
const PLACES_PER_MONTH = 64;

/** Month number of a day: year × 12 + month − 1. */
export function monthOf(day: number): number {
  const { year, month } = toYmd(day);
  return year * 12 + month - 1;
}

/** Record ids of the places within reach of the boards from where the hero is now (`contracts.board.range` days). Pure. */
export function placesInReach(state: GameState, content: Content): string[] {
  const range = content.contracts?.board?.range;
  if (range === undefined) return [];
  const point = currentPoint(state, content);
  if (!point) return [];
  const near = new Set(routesFrom(state, content).filter((r) => r.days <= range).map((r) => r.to));
  if ('place' in point) near.add(point.place);
  return state.place.places.filter((p) => near.has(p.id)).map((p) => p.id);
}

/**
 * Boards within reach of the hero that have not been refreshed this month get their offers of the month (CK.3): on a new
 * month every board within reach, and a board the hero comes within reach of later in the month when he does. Offers
 * still on a board stay; only the missing ones are posted.
 */
export function refreshBoards(ctx: Ctx): void {
  const { state, content } = ctx;
  if (!content.contracts?.board || !content.places) return;
  const month = monthOf(state.day);
  if (state.contracts.month !== month) {
    state.contracts.month = month;
    state.contracts.posted = [];
  }
  for (const id of placesInReach(state, content)) {
    if (state.contracts.posted.includes(id)) continue;
    state.contracts.posted.push(id);
    fillBoard(ctx, id, month);
  }
}

/** People of the circle who may offer work: alive, grown up, with an occupation, and offering none yet. */
function freeEmployers(ctx: Ctx): Character[] {
  const { state, content } = ctx;
  const busy = new Set(state.contracts.offers.map((o) => o.employer));
  if (state.contracts.current) busy.add(state.contracts.current.employer);
  const out: Character[] = [];
  for (const id of state.circle) {
    const c = findCharacter(state, id);
    if (!c || c.deathDay !== null || c.occupation === null || busy.has(c.id)) continue;
    if (ageYears(c.birthDay, state.day) < content.settings.adultAge) continue;
    out.push(c);
  }
  return out;
}

/**
 * The board of a place gets up to its size of the month (`board.sizes` by the kind of the place): each offer is a kind
 * the place offers and some free person of the circle can, weighted; an employer of that kind; a level and its pay; the
 * days of work, or a place the right number of days away; the days it stays. One person offers one job at a time.
 */
function fillBoard(ctx: Ctx, placeId: string, month: number): void {
  const { state, content } = ctx;
  const contracts = content.contracts;
  const board = contracts?.board;
  const def = placeDef(state, content, placeId);
  if (!contracts || !board || !def) return;
  const size = board.sizes.find((s) => s.kind === def.kind)?.size;
  if (!size) return;
  const index = state.place.places.findIndex((p) => p.id === placeId);
  const rng = seedRng(state.seed, BOARD_STREAM + month * PLACES_PER_MONTH + index);
  const want = int(rng, size.min, size.max);
  let have = state.contracts.offers.filter((o) => o.place === placeId).length;
  let people = freeEmployers(ctx);
  const ways = routesFromPlace(state, content, placeId);
  const kinds = contracts.kinds.filter((k) => k.offer?.places.includes(def.kind));
  while (have < want) {
    const fit = kinds.filter((k) => {
      const offer = k.offer;
      if (!offer || !people.some((p) => offer.employers.includes(p.occupation as string))) return false;
      return offer.to === undefined || ways.some((w) => w.days >= (offer.to?.min ?? 0) && w.days <= (offer.to?.max ?? 0));
    });
    if (fit.length === 0) return;
    const kind = weightedPick(rng, fit, (k) => k.offer?.weight ?? 0);
    const offer = kind.offer;
    if (!offer) return;
    const employer = pick(rng, people.filter((p) => offer.employers.includes(p.occupation as string)));
    const level = int(rng, offer.levels.min, offer.levels.max);
    let to: string | null = null;
    let days: number;
    if (offer.to) {
      const range = offer.to;
      const way = pick(rng, ways.filter((w) => w.days >= range.min && w.days <= range.max));
      to = way.to;
      days = way.days;
    } else days = int(rng, offer.days?.min ?? 1, offer.days?.max ?? 1);
    const stay = int(rng, board.stay.min, board.stay.max);
    postOffer(state, { kind: kind.id, place: placeId, employer: employer.id, level, pay: board.pay[level] ?? 0, to, days, expires: state.day + stay });
    people = people.filter((p) => p !== employer);
    have += 1;
  }
}
