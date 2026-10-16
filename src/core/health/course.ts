import { log } from '../chronicle/log';
import { addTrait, removeTrait } from '../character/traits';
import type { Content } from '../content/schema';
import { int, weightedPick } from '../rng';
import type { Character, Ctx } from '../state';
import { DEATH, HEAL, type ConditionDef, type StageDef } from './content';

/** A condition a character has (D-033): which one, its stage and since when. */
export interface HealthCondition {
  /** Condition id from `health.conditions`. */
  id: string;
  /** Stage id of that condition. */
  stage: string;
  /** Day the condition began. */
  start: number;
  /** Day the current stage began. */
  since: number;
}

export function conditionDef(content: Content, id: string): ConditionDef {
  const def = content.health.conditions.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown condition "${id}"`);
  return def;
}

export function stageOf(content: Content, hc: HealthCondition): StageDef {
  const stage = conditionDef(content, hc.id).stages.find((s) => s.id === hc.stage);
  if (!stage) throw new Error(`Condition "${hc.id}" has no stage "${hc.stage}"`);
  return stage;
}

function stageIndex(def: ConditionDef, stageId: string): number {
  return def.stages.findIndex((s) => s.id === stageId);
}

export function hasCondition(c: Character, id: string): boolean {
  return c.conditions.some((hc) => hc.id === id);
}

/** True if any condition of the character is at a severe stage. */
export function isSeverelyIll(content: Content, c: Character): boolean {
  return c.conditions.some((hc) => stageOf(content, hc).severe);
}

/** Line about a stage or an outcome: severe matters go to the chronicle, the rest to the journal (GDD 8.9). */
function write(ctx: Ctx, c: Character, template: string, chronicle: boolean): void {
  log(ctx.state, { subject: c, kind: 'health', level: chronicle ? 'chronicle' : 'journal', template });
}

/**
 * Gives a condition at its first stage. A condition the character already has
 * is left as it is. Returns whether the character changed.
 */
export function addCondition(ctx: Ctx, c: Character, id: string, text?: string): boolean {
  if (hasCondition(c, id)) return false;
  const def = conditionDef(ctx.content, id);
  const first = def.stages[0];
  if (!first) throw new Error(`Condition "${id}" has no stages`);
  c.conditions.push({ id, stage: first.id, start: ctx.state.day, since: ctx.state.day });
  if (text) write(ctx, c, text, first.severe);
  return true;
}

/** Moves to another stage; the stage text is written only on the way toward death. */
function enterStage(ctx: Ctx, c: Character, hc: HealthCondition, stageId: string): void {
  const def = conditionDef(ctx.content, hc.id);
  const worse = stageIndex(def, stageId) > stageIndex(def, hc.stage);
  hc.stage = stageId;
  hc.since = ctx.state.day;
  const stage = stageOf(ctx.content, hc);
  if (worse && stage.text) write(ctx, c, stage.text, stage.severe);
}

/** The condition ends: one outcome is rolled (nothing, a scar, an injury, an old wound). */
function recover(ctx: Ctx, c: Character, hc: HealthCondition): void {
  const def = conditionDef(ctx.content, hc.id);
  c.conditions = c.conditions.filter((x) => x !== hc);
  if (def.outcomes.length === 0) return;
  const outcome = weightedPick(ctx.state.rng, def.outcomes, (o) => o.weight);
  for (const id of outcome.removes ?? []) removeTrait(ctx, c, id);
  const gained = outcome.trait !== undefined && addTrait(ctx, c, outcome.trait);
  const followed = outcome.condition !== undefined && addCondition(ctx, c, outcome.condition);
  if (outcome.text) write(ctx, c, outcome.text, gained || followed);
}

/**
 * The `heal` effect for one condition: one stage back, or recovery from the
 * first stage. A permanent condition stays at its first stage.
 */
export function healStep(ctx: Ctx, c: Character, hc: HealthCondition): void {
  const def = conditionDef(ctx.content, hc.id);
  const index = stageIndex(def, hc.stage);
  const back = def.stages[index - 1];
  if (back) enterStage(ctx, c, hc, back.id);
  else if (!def.permanent) recover(ctx, c, hc);
}

/** Percent shifts of the chances for a character now: rest helps, the road hurts (only the hero acts). */
function chanceShift({ state, content }: Ctx, c: Character): { better: number; worse: number } {
  const actionId = c.id === state.playerId ? state.activeAction?.actionId : undefined;
  if (actionId !== undefined) {
    for (const shift of [content.health.rest, content.health.road]) {
      if (shift.actions.includes(actionId)) return shift;
    }
  }
  return { better: 100, worse: 100 };
}

/**
 * The weekly roll of one condition: one draw against the transitions of its
 * stage, in order, each chance shifted by rest or the road. Returns true if the
 * character is to die of it; the caller kills (this file cannot import lifecycle).
 */
export function weeklyTransition(ctx: Ctx, c: Character, hc: HealthCondition): boolean {
  const { state, content } = ctx;
  const stage = stageOf(content, hc);
  if (stage.transitions.length === 0 || state.day - hc.since < stage.minDays) return false;
  const def = conditionDef(content, hc.id);
  const here = stageIndex(def, hc.stage);
  const shift = chanceShift(ctx, c);
  const roll = int(state.rng, 0, 9999);
  let total = 0;
  for (const t of stage.transitions) {
    const better = t.to === HEAL || (t.to !== DEATH && stageIndex(def, t.to) < here);
    total += Math.floor((t.per10k * (better ? shift.better : shift.worse)) / 100);
    if (roll >= total) continue;
    if (t.to === DEATH) return true;
    if (t.to === HEAL) recover(ctx, c, hc);
    else enterStage(ctx, c, hc, t.to);
    return false;
  }
  return false;
}

/** Product of the mortality multipliers of all stages, and the condition most to blame (null if none above 1). */
export function conditionMortality(content: Content, c: Character): { multiplier: number; blame: ConditionDef | null } {
  let multiplier = 1;
  let worst = 1;
  let blame: ConditionDef | null = null;
  for (const hc of c.conditions) {
    const m = stageOf(content, hc).mortality;
    multiplier *= m;
    if (m > worst) {
      worst = m;
      blame = conditionDef(content, hc.id);
    }
  }
  return { multiplier, blame };
}

/** "Severe wound (festering), Frailty (frail)" or an empty string; for the screen and the run summary. */
export function conditionsText(content: Content, c: Character): string {
  return c.conditions.map((hc) => `${conditionDef(content, hc.id).name} (${stageOf(content, hc).name})`).join(', ');
}
