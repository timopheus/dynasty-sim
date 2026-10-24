import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/core/actions/actions';
import { applyEffects } from '../src/core/effects';
import { getPlayer } from '../src/core/helpers';
import { botCommand } from '../src/core/bot';
import { MAX_WAIT_DAYS, apply, newGame, play } from '../src/core/game';
import { eventView } from '../src/core/events/view';
import { entryText } from '../src/core/chronicle/log';
import { checkInvariants } from '../src/core/invariants';
import { seedRng } from '../src/core/rng';
import type { Content } from '../src/core/content/schema';
import type { GameState } from '../src/core/state';
import { realContent } from './fixtures/content';

/** A game past the backstory: the hero is an adult and waits for an action. */
function grownUp(content: Content, seed: number): GameState {
  const state = newGame(seed, content);
  const rng = seedRng(seed, 77);
  for (let i = 0; i < 200 && state.backstory.running; i++) play(state, content, botCommand(state, content, rng));
  while (state.status === 'awaiting_choice') play(state, content, botCommand(state, content, rng));
  expect(state.backstory.running).toBe(false);
  return state;
}

describe('living time (S.6, D-325)', () => {
  const content = realContent();

  it('live is idle: it ends on its day, stops the clock, writes no chronicle line', () => {
    const quiet = { ...content, narrator: { ...content.narrator!, eventChancePer10k: 0, idleChancePer10k: 0, npcChancePer10k: 0 } };
    const state = grownUp(quiet, 3);
    expect(content.actions.find((a) => a.id === 'live')?.idle).toBe(true);
    expect(state.status).toBe('awaiting_action');
    const lines = state.chronicle.length;
    apply(state, quiet, { type: 'start', actionId: 'live' });
    expect(state.status).toBe('running');
    const end = state.activeAction!.endDay;
    apply(state, quiet, { type: 'wait', days: end - state.day });
    expect(state.day).toBe(end);
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.chronicle.slice(lines).filter((e) => e.kind === 'action')).toEqual([]);
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('365 × wait 1 and one wait 365 in live give the same state', () => {
    const a = grownUp(content, 3);
    const b = structuredClone(a);
    apply(a, content, { type: 'start', actionId: 'live' });
    apply(b, content, { type: 'start', actionId: 'live' });
    const target = a.day + 365;
    const drive = (s: GameState, step: (s: GameState) => void) => {
      while (s.day < target && s.status !== 'ended') {
        if (s.status === 'running') step(s);
        else if (s.status === 'awaiting_choice') apply(s, content, { type: 'choose', option: eventView({ state: s, content })!.options.find((o) => o.available)!.index });
        else apply(s, content, { type: 'start', actionId: 'live' });
      }
    };
    drive(a, (s) => apply(s, content, { type: 'wait', days: 1 }));
    drive(b, (s) => apply(s, content, { type: 'wait', days: target - s.day }));
    expect(a.day).toBe(b.day);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a new start breaks the action off with a journal line; the same action again is refused', () => {
    const state = grownUp(content, 3);
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.status).toBe('running');
    expect(() => apply(state, content, { type: 'start', actionId: 'rest' })).toThrow(/already under way/);
    apply(state, content, { type: 'start', actionId: 'live' });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'interrupt', level: 'journal' });
    const lines = state.chronicle.length;
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.activeAction?.actionId).toBe('rest');
    expect(state.chronicle).toHaveLength(lines); // leaving live writes nothing
    expect(state.status).toBe('running');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a switch keeps the text an event asked for its break', () => {
    const state = grownUp(content, 3);
    apply(state, content, { type: 'start', actionId: 'rest' });
    state.interruptRequest = { template: '{name} was called away.' };
    apply(state, content, { type: 'start', actionId: 'live' });
    expect(entryText(state.chronicle.at(-1)!)).toMatch(/was called away/);
    expect(state.interruptRequest).toBeNull();
  });

  it('a switch from the notary drops the will', () => {
    const state = grownUp(content, 3);
    apply(state, content, { type: 'will', heir: null, guardian: null, items: [] });
    expect(state.activeAction?.actionId).toBe('notary');
    apply(state, content, { type: 'start', actionId: 'live' });
    apply(state, content, { type: 'wait', days: 1 }); // the succession phase drops a draft nobody is writing
    expect(state.willDraft).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });

  /** A hero who only lives: choices with a decision per year and how the clock stopped. */
  function liveYears(seed: number, years: number) {
    const state = grownUp(content, seed);
    const rng = seedRng(seed, 78);
    const start = state.day;
    let choices = 0;
    const stops = new Set<string>();
    while (state.day - start < years * 365 && state.status !== 'ended') {
      if (state.status === 'awaiting_choice') {
        choices++;
        const def = content.events.find((e) => e.id === state.pendingEvent!.eventId)!;
        stops.add(def.options || def.pages ? 'decision' : 'notice');
        apply(state, content, botCommand(state, content, rng));
      } else if (state.status === 'awaiting_action') {
        const ok = availableActions({ state, content }).some((a) => a.id === 'live');
        apply(state, content, { type: 'start', actionId: ok ? 'live' : 'rest' });
      } else apply(state, content, { type: 'wait', days: MAX_WAIT_DAYS });
    }
    return { state, choices, stops, years: (state.day - start) / 365 };
  }

  it('a notice never stops the clock: only decisions and the end of an action do', () => {
    const { state, stops } = liveYears(3, 15);
    expect(state.narratorStats.notices).toBeGreaterThan(0);
    expect([...stops]).toEqual(['decision']);
  });

  it('pure living gives 6-12 events with a choice a year (D-168)', () => {
    let choices = 0;
    let years = 0;
    for (const seed of [1, 2, 3]) {
      const r = liveYears(seed, 15);
      choices += r.choices;
      years += r.years;
      expect(checkInvariants(r.state, content)).toEqual([]);
    }
    expect(choices / years).toBeGreaterThanOrEqual(6);
    expect(choices / years).toBeLessThanOrEqual(12);
  });

  it('a severely ill hero can start only the actions of rest', () => {
    const state = grownUp(content, 3);
    const ctx = { state, content };
    applyEffects(ctx, getPlayer(state), { wound: 'severe_wound' }, {});
    const ids = availableActions(ctx).map((a) => a.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => content.health.rest.actions.includes(id))).toBe(true);
    expect(ids).toContain('rest');
  });
});
