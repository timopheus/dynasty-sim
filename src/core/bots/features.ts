import type { ActionDef } from '../actions/content';
import type { Content } from '../content/schema';
import type { Effects } from '../effects';
import { sceneOf, type EventDef, type OptionDef, type OutcomeDef, type SceneDef } from '../events/content';

/**
 * What a bot can read off an option without new content markup (D-319). Every number is an integer; chances are
 * percents 0..100 and the sums are "percent × amount", so two features of different options compare directly.
 */
export interface Features {
  /** Chance (percent) that the main participant dies by the option. */
  death: number;
  /** Chance (percent) that the main participant is wounded. */
  wound: number;
  /** Expected money of the main participant × 100. */
  money: number;
  /** Chance (percent) of hurting or killing someone else (`kill`/`wound` in `on`). */
  violence: number;
  /** Chance (percent) of starting or stoking a feud: a challenge scheduled, a rival relation, a grudge. */
  feud: number;
  /** Chance (percent) of a triumphant, angry or threatening ending: the mood of what the player sees (`mood`). */
  fight: number;
  /** Chance (percent) of a shameful or painful ending. */
  shame: number;
  /** Chance (percent) the check passes; 100 without a check. */
  chance: number;
  /** Severity of the event it leads to, 0 light … 2 heavy (a scheduled follow-up counts). */
  gravity: number;
}

const NONE: Features = { death: 0, wound: 0, money: 0, violence: 0, feud: 0, fight: 0, shame: 0, chance: 100, gravity: 0 };

const FIGHT_MOODS = new Set(['triumph', 'anger', 'threat']);
const SHAME_MOODS = new Set(['shame', 'pain', 'loss']);
const SEVERITY = { light: 0, medium: 1, heavy: 2 } as const;
/** Pages followed through `next` and follow-ups through `schedule`: deeper is guessed as nothing. */
const DEPTH = 2;

function scale(f: Features, percent: number): Features {
  const s = (n: number) => Math.floor((n * percent) / 100);
  return { death: s(f.death), wound: s(f.wound), money: s(f.money), violence: s(f.violence), feud: s(f.feud), fight: s(f.fight), shame: s(f.shame), chance: f.chance, gravity: f.gravity };
}

function add(a: Features, b: Features): Features {
  return {
    death: a.death + b.death, wound: a.wound + b.wound, money: a.money + b.money, violence: a.violence + b.violence,
    feud: a.feud + b.feud, fight: a.fight + b.fight, shame: a.shame + b.shame, chance: a.chance, gravity: Math.max(a.gravity, b.gravity),
  };
}

/** Mean of the options a follow-up page or event offers: what a player picking blindly would get. */
function mean(list: Features[]): Features {
  if (list.length === 0) return NONE;
  const sum = list.reduce(add, NONE);
  return divide(sum, list.length);
}

function divide(f: Features, n: number): Features {
  const d = (x: number) => Math.trunc(x / n);
  return { death: d(f.death), wound: d(f.wound), money: d(f.money), violence: d(f.violence), feud: d(f.feud), fight: d(f.fight), shame: d(f.shame), chance: f.chance, gravity: f.gravity };
}

function effectsFeatures(content: Content, effects: Effects | undefined, depth: number): Features {
  if (!effects) return NONE;
  let f: Features = { ...NONE };
  if (effects.kill !== undefined) f = { ...f, death: 100 };
  if (effects.wound !== undefined) f = { ...f, wound: 100 };
  if (effects.money !== undefined) f = { ...f, money: effects.money * 100 };
  for (const entry of effects.schedule ?? []) {
    const next = content.events.find((e) => e.id === entry.event);
    if (!next) continue;
    f = { ...f, gravity: Math.max(f.gravity, SEVERITY[next.severity ?? 'light']) };
    // A follow-up that only a challenge can lead to: the hero is putting his name on the line.
    if (next.followup_only && SEVERITY[next.severity ?? 'light'] === 2) f = { ...f, feud: 100 };
    if (depth > 0) f = add(f, eventFeatures(content, next, depth - 1));
  }
  if (effects.relation?.some((r) => r.start === 'rival')) f = { ...f, feud: 100 };
  if (effects.opinion?.some((o) => ['slighted', 'humiliated', 'defeated_me'].includes(o.reason))) f = { ...f, feud: Math.max(f.feud, 50) };
  return f;
}

function onFeatures(on: OutcomeDef['on']): Features {
  let f: Features = { ...NONE };
  for (const effects of Object.values(on ?? {})) {
    if (effects.kill !== undefined || effects.wound !== undefined) f = { ...f, violence: 100 };
    if (effects.relation?.some((r) => r.start === 'rival')) f = { ...f, feud: 100 };
    if (effects.opinion?.some((o) => ['slighted', 'humiliated', 'defeated_me'].includes(o.reason))) f = { ...f, feud: Math.max(f.feud, 50) };
  }
  return f;
}

function outcomeFeatures(content: Content, event: EventDef, outcome: OutcomeDef | undefined, depth: number): Features {
  if (!outcome) return NONE;
  let f = add(effectsFeatures(content, outcome.effects as Effects | undefined, depth), onFeatures(outcome.on));
  if (outcome.mood && FIGHT_MOODS.has(outcome.mood)) f = { ...f, fight: 100 };
  if (outcome.mood && SHAME_MOODS.has(outcome.mood)) f = { ...f, shame: 100 };
  if (outcome.next && depth > 0) {
    const page = sceneOf(event, outcome.next);
    f = add(f, sceneFeatures(content, event, page, depth - 1));
  }
  return f;
}

/** An option with a check passes with the shown chance; without one its own outcome happens for sure. */
export function optionFeatures(content: Content, event: EventDef, option: OptionDef, percent: number | null, depth = DEPTH): Features {
  if (!option.check || percent === null) return { ...outcomeFeatures(content, event, option, depth), chance: 100 };
  const win = scale(outcomeFeatures(content, event, option.success, depth), percent);
  const lose = scale(outcomeFeatures(content, event, option.failure, depth), 100 - percent);
  return { ...add(win, lose), chance: percent };
}

function sceneFeatures(content: Content, event: EventDef, scene: SceneDef, depth: number): Features {
  if (!scene.options) return outcomeFeatures(content, event, scene, depth);
  return mean(scene.options.map((o) => optionFeatures(content, event, o, o.check ? 50 : null, depth)));
}

/** The whole event as a stranger sees it: the mean of its options. A scheduled event or an action's random event. */
function eventFeatures(content: Content, event: EventDef, depth: number): Features {
  const f = sceneFeatures(content, event, event, depth);
  return { ...f, gravity: Math.max(f.gravity, SEVERITY[event.severity ?? 'light']) };
}

/**
 * What an action brings: its own money per day and the mean risk of the events that happen only during it (their
 * `actions` list names it), weighted equally. The events themselves are read as a stranger reads them.
 */
export function actionFeatures(content: Content, action: ActionDef): Features & { days: number } {
  const days = Math.max(1, Math.floor((action.duration.min + action.duration.max) / 2));
  const own = effectsFeatures(content, action.effects as Effects | undefined, 0);
  const related = content.events.filter((e) => e.actions?.includes(action.id) && !e.followup_only);
  const risk = mean(related.map((e) => eventFeatures(content, e, 1)));
  // Money is per 30 days, so a long action does not look richer than a short one.
  return { ...add(own, { ...risk, money: 0 }), money: Math.floor(((own.money + risk.money) * 30) / days), days };
}
