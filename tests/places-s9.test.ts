import { describe, expect, it } from 'vitest';
import { actionAvailability, interruptAction } from '../src/core/actions/actions';
import { partsText } from '../src/core/text/text';
import { allChronicle } from '../src/core/archive/archive';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { entityPage } from '../src/core/pages/entity';
import { placeIdOf, position, routesFrom } from '../src/core/place/place';
import { placeFacts, weatherAt } from '../src/core/place/table';
import type { Content } from '../src/core/content/schema';
import type { Ctx, GameState } from '../src/core/state';
import { actionShelves } from '../src/ui/actions-model';
import { whereView } from '../src/ui/where-model';
import { realContent } from './fixtures/content';

const content: Content = realContent();
// no event on the road: the journeys of these tests run undisturbed
const quiet: Content = { ...content, events: [] };

/** An adult hero who is free to act, at the starting place. */
function game(c: Content = quiet, seed = 5): { state: GameState; ctx: Ctx } {
  const state = newGame(seed, c);
  state.backstory.running = false;
  state.pendingEvent = null;
  state.status = 'awaiting_action';
  getPlayer(state).birthDay = state.day - 30 * 365;
  return { state, ctx: { state, content: c } };
}

const id = (state: GameState, key: string): string => {
  const found = placeIdOf(state, key);
  if (found === null) throw new Error(`no place ${key}`);
  return found;
};

const journal = (state: GameState): string[] => allChronicle(state).filter((e) => e.kind === 'journey').map((e) => partsText(e.parts));

describe('the places of the region (S.9, D-439)', () => {
  const places = content.places;
  if (!places) throw new Error('the real content has no places');

  it('has 12–16 places in four realms, each with the whole table and a line of description', () => {
    expect(places.list.length).toBeGreaterThanOrEqual(12);
    expect(places.list.length).toBeLessThanOrEqual(16);
    expect(new Set(places.list.map((p) => p.realm)).size).toBe(4);
    for (const p of places.list) {
      for (const field of ['realm', 'province', 'people', 'population', 'landscape', 'has', 'climate', 'description'] as const) expect(p[field], `${p.id}.${field}`).toBeDefined();
    }
  });

  it('keeps every description to the style guide: one short line that does not repeat the table', () => {
    const banned = /nestled|bustling|tapestry|sleepy|charming|vibrant|rich history|hidden gem|where \w+ meets/i;
    const lines = places.list.map((p) => p.description ?? '');
    for (const p of places.list) {
      const line = p.description ?? '';
      expect(line.length, p.id).toBeLessThanOrEqual(130);
      expect(line, p.id).not.toMatch(banned);
      expect(line.toLowerCase(), p.id).not.toContain(p.name.toLowerCase());
      for (const word of [p.realm, p.kind, 'rain', 'snow']) expect(line.toLowerCase(), `${p.id}: ${word}`).not.toContain((word ?? '').toLowerCase());
    }
    // no two lines begin the same way (rule 14)
    expect(new Set(lines.map((l) => l.split(' ').slice(0, 2).join(' '))).size).toBe(lines.length);
  });

  it('joins every place to the start by roads of whole days', () => {
    const { state } = game();
    const reached = routesFrom(state, content).map((r) => r.to);
    expect(reached.length).toBe(places.list.length - 1);
    for (const r of places.roads) expect(r.days).toBeGreaterThanOrEqual(1);
  });

  it('builds the table of a place from the content only: no row without its data', () => {
    const { state } = game();
    const facts = placeFacts(state, content, id(state, 'ostmere'));
    expect(facts?.rows.map((r) => r.label)).toEqual(['Place', 'Realm', 'People', 'Land', 'Here']);
    expect(facts?.rows[0]?.value).toBe('great city');
    expect(facts?.rows[1]?.value).toBe('Haverland · Schlilerbach');
  });
});

describe('weather (S.9)', () => {
  it('follows the climate and the season, is the same on every call and never touches the stored randomness', () => {
    const { state } = game();
    const rng = JSON.stringify(state.rng);
    const before = JSON.stringify(state);
    const ostmere = id(state, 'ostmere');
    const now = weatherAt(state, content, ostmere, state.day);
    expect(now).not.toBeNull();
    expect(weatherAt(state, content, ostmere, state.day)).toBe(now);
    // the week, not the day: the same all week
    const monday = state.day - (state.day % 7);
    expect(new Set([0, 1, 2, 3, 4, 5, 6].map((d) => weatherAt(state, content, ostmere, monday + d))).size).toBe(1);
    expect(JSON.stringify(state.rng)).toBe(rng);
    expect(JSON.stringify(state)).toBe(before);
    // winter in a maritime climate and summer in a hot one: names from their own lists
    const winter = content.places?.climates?.find((c) => c.id === 'maritime')?.weather.filter((w) => w.season === 'winter').map((w) => w.name) ?? [];
    expect(winter).toContain(weatherAt(state, content, ostmere, 15));
    const sarayhan = id(state, 'sarayhan');
    const summer = content.places?.climates?.find((c) => c.id === 'hot')?.weather.filter((w) => w.season === 'summer').map((w) => w.name) ?? [];
    expect(summer).toContain(weatherAt(state, content, sarayhan, 180));
  });

  it('changes from week to week and from seed to seed', () => {
    const a = game(quiet, 1).state;
    const b = game(quiet, 2).state;
    const place = id(a, 'ostmere');
    const weeks = new Set(Array.from({ length: 30 }, (_, w) => weatherAt(a, content, place, w * 7)));
    expect(weeks.size).toBeGreaterThan(3);
    const same = Array.from({ length: 30 }, (_, w) => weatherAt(a, content, place, w * 7) === weatherAt(b, content, id(b, 'ostmere'), w * 7)).filter(Boolean).length;
    expect(same).toBeLessThan(30);
  });
});

describe('the road in the journal (S.9, D-462)', () => {
  it('writes the arrival to the journal, not to the chronicle', () => {
    const { state } = game();
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'rohrbach') });
    apply(state, quiet, { type: 'wait', days: 2 });
    expect(position(state, quiet)).toEqual({ at: id(state, 'rohrbach'), journey: null });
    expect(journal(state)).toEqual([expect.stringMatching(/ came to Rohrbach\.$/)]);
    const arrival = allChronicle(state).find((e) => e.kind === 'journey');
    expect(arrival?.level).toBe('journal');
    // the line names the place as a link to its page
    expect(arrival?.parts.some((p) => typeof p !== 'string' && p.id === id(state, 'rohrbach'))).toBe(true);
    // the journey wrote no second line of its own
    expect(allChronicle(state).filter((e) => e.kind === 'action')).toEqual([]);
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('writes a line of its own when the hero stands on the road, and not only the break of the action', () => {
    const { state } = game();
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'teigach') });
    apply(state, quiet, { type: 'wait', days: 3 });
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    expect(state.place.road).not.toBeNull();
    expect(journal(state)).toEqual([expect.stringMatching(/ halted on the road between Ostmere and Teigach\.$/)]);
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('writes the line of a turn, and not the general line of a break, when the hero turns on the road', () => {
    const { state } = game();
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'teigach') });
    apply(state, quiet, { type: 'wait', days: 3 });
    const lines = allChronicle(state).length;
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'rohrbach') });
    const added = allChronicle(state).slice(lines);
    expect(added.map((e) => e.kind)).toEqual(['journey']);
    expect(partsText(added[0]?.parts ?? [])).toMatch(/ turned toward Rohrbach\.$/);
    expect(added.some((e) => e.kind === 'interrupt')).toBe(false);
    expect(state.activeAction?.target).toBe(id(state, 'rohrbach'));
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('writes where the hero stayed when a journey breaks off in a place it passed', () => {
    const { state } = game();
    // Ostmere — Teigach 9 days, then Mullrosin: after 9 days the hero passes Teigach
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'mullrosin') });
    apply(state, quiet, { type: 'wait', days: 9 });
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    expect(journal(state).at(-1)).toMatch(/ broke off the journey in Teigach\.$/);
  });
});

describe('the road in the journal: edge days (S.9)', () => {
  it('says the hero came when a break-off falls on the day of arrival, and nothing when he never left', () => {
    const { state, ctx } = game();
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'rohrbach') });
    apply(state, quiet, { type: 'wait', days: 1 });
    state.day += 1;
    interruptAction(ctx);
    expect(position(state, quiet)).toEqual({ at: id(state, 'rohrbach'), journey: null });
    expect(journal(state).at(-1)).toMatch(/ came to Rohrbach\.$/);

    // set out and change of mind on the same day: no line of a journey, he is where he was
    const other = game();
    apply(other.state, quiet, { type: 'start', actionId: 'travel', target: id(other.state, 'rohrbach') });
    apply(other.state, quiet, { type: 'start', actionId: 'rest' });
    apply(other.state, quiet, { type: 'start', actionId: 'travel', target: id(other.state, 'teigach') });
    apply(other.state, quiet, { type: 'start', actionId: 'travel', target: id(other.state, 'rohrbach') });
    expect(journal(other.state)).toEqual([]);
  });
});

describe('"Live as you will" on the road (S.9)', () => {
  it('is unavailable on the road, so the clock stops there and the player chooses; the way on stays open', () => {
    const { state, ctx } = game();
    const live = () => actionAvailability(ctx).find((a) => a.action.id === 'live');
    expect(live()?.unmet).toEqual([]);
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'teigach') });
    apply(state, quiet, { type: 'wait', days: 3 });
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    apply(state, quiet, { type: 'wait', days: 28 });
    expect(position(state, quiet)).toMatchObject({ road: expect.anything() });
    expect(live()?.unmet.length).toBeGreaterThan(0);
    // both ends of the road are open from the middle of it, and every other place beyond them
    const days = Object.fromEntries(routesFrom(state, quiet).map((r) => [r.to, r.days]));
    expect(days[id(state, 'ostmere')]).toBe(3);
    expect(days[id(state, 'teigach')]).toBe(6);
    expect(days[id(state, 'rohrbach')]).toBe(5);
  });
});

describe('the page of a place and the block "where I am" (S.9)', () => {
  it('opens a page of a place: table, season and weather, roads with links, and the way from the hero', () => {
    const { ctx, state } = game();
    const found = entityPage(ctx, id(state, 'ostmere'));
    expect(found?.type).toBe('entity');
    if (found?.type !== 'entity') return;
    expect(found.page).toMatchObject({ kind: 'place', title: 'Ostmere' });
    const labels = found.page.facts.map((f) => f.label);
    expect(labels).toEqual(['Place', 'Realm', 'People', 'Land', 'Here', 'Now', 'Roads', 'You']);
    expect(found.page.facts.find((f) => f.label === 'You')?.parts).toEqual(['You are here.']);
    expect(found.page.subtitle).toBe(content.places?.list.find((p) => p.id === 'ostmere')?.description);
    const roads = found.page.facts.find((f) => f.label === 'Roads')?.parts ?? [];
    expect(roads.some((p) => typeof p !== 'string' && p.id === id(state, 'rohrbach'))).toBe(true);
    const far = entityPage(ctx, id(state, 'valmont'));
    expect(far?.type === 'entity' && far.page.facts.find((f) => f.label === 'You')?.parts).toEqual(['54 days from where you are.']);
  });

  it('says where the hero stands, where he is going and how many days are left, and where he stands on the road', () => {
    const { state, ctx } = game();
    expect(whereView(ctx)).toMatchObject({ title: 'Ostmere', status: 'Standing here', place: { name: 'Ostmere' } });
    expect(whereView(ctx).table.map((r) => r.label)).toEqual(['Place', 'Realm', 'People', 'Land', 'Here', 'Season', 'Weather']);
    expect(whereView(ctx).goTo[0]).toMatchObject({ name: 'Rohrbach', days: 2 });
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'teigach') });
    apply(state, quiet, { type: 'wait', days: 3 });
    expect(whereView(ctx)).toMatchObject({ place: null, title: 'On the road', heading: 'Heading for Teigach', line: '6 days left', status: 'Between Ostmere and Teigach, 3 days from Ostmere' });
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    apply(state, quiet, { type: 'wait', days: 30 });
    expect(whereView(ctx)).toMatchObject({ place: null, heading: 'Free to act' });
    expect(whereView(ctx).line).toMatch(/turn back/);
  });

  it('lists the directions of the journey nearest first, and turns the hero while he is under way', () => {
    const { state, ctx } = game();
    const travel = () => actionShelves(ctx, null).shelves.flatMap((s) => s.buttons).find((b) => b.id === 'travel');
    const first = travel()?.destinations ?? [];
    expect(first.length).toBe(15);
    expect(first.map((d) => d.days)).toEqual([...first.map((d) => d.days)].sort((a, b) => a - b));
    expect(first.some((d) => d.going)).toBe(false);
    apply(state, quiet, { type: 'start', actionId: 'travel', target: id(state, 'teigach') });
    expect(travel()?.grey).toBe(false);
    expect(travel()?.destinations?.find((d) => d.going)?.name).toBe('Teigach');
  });
});
