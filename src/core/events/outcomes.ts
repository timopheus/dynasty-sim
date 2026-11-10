import { findTrait } from '../character/holding';
import { fullName } from '../character/character';
import { STAT_IDS } from '../character/stat-ids';
import { conditionDef } from '../health/course';
import { findCharacter } from '../helpers';
import { priceParts } from '../economy/content';
import { priceCrowns } from '../economy/economy';
import { findReason } from '../relations/opinions';
import { findRelationKind } from '../relations/links';
import type { Effects } from '../effects';
import type { Character, Ctx, Scope } from '../state';
import { stats } from '../character/stats';
import { checkedPerson, checkStat, checkTarget } from './checks';
import type { OptionDef, OutcomeDef } from './content';
import { crownsPhrase, localName, phrase } from '../lang/phrases';

/**
 * What an option comes to, in words for the tooltip of its button (D-463, as in CK3): the price, what follows from a
 * success and from a failure, and what the chance is made of. Pure and never consumes randomness: the same state always
 * gives the same words. The words come from the effects themselves, so an author writes nothing twice; the one thing
 * written by hand is `risk:` (D-439).
 */
export interface OptionOutcomes {
  /** What the choice costs for sure: the price of the option, whatever the outcome (D-326, D-441). */
  cost: string[];
  /** Without a check: what follows. Empty with a check. */
  result: string[];
  /** With a check: what a success brings and what a failure brings. */
  success: string[];
  failure: string[];
  /** With a check: what the chance is made of ("Martial (11) against 8"); empty without one. */
  chanceBasis: string[];
}

const LEVEL_WORDS: Record<string, string> = {
  trifle: 'a trifle',
  minor: 'a small sum',
  notable: 'a notable sum',
  major: 'a large sum',
  ruinous: 'a ruinous sum',
};

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** Money of an outcome in crowns, negative for a price: from `money`, `pay` and `gain` (D-441). */
export function moneyOf(ctx: Ctx, c: Character, effects: Effects | undefined): number {
  if (!effects) return 0;
  const { state, content } = ctx;
  return (effects.money ?? 0) - (effects.pay !== undefined ? priceCrowns(content, state, c, effects.pay) : 0) + (effects.gain !== undefined ? priceCrowns(content, state, c, effects.gain) : 0);
}

function moneyWords(ctx: Ctx, c: Character, effects: Effects): string[] {
  const { state, content } = ctx;
  const out: string[] = [];
  const word = (ref: NonNullable<Effects['pay']>, sign: string) => {
    const { level, times } = priceParts(ref);
    const sum = LEVEL_WORDS[level] ?? level;
    out.push(phrase(content, sign === '−' ? 'Pay {sum}{times} ({crowns})' : 'Gain {sum}{times} ({crowns})', { sum: phrase(content, sum), times: times > 1 ? ` ×${times}` : '', crowns: crownsPhrase(content, priceCrowns(content, state, c, ref)) }));
  };
  if (effects.pay !== undefined) word(effects.pay, '−');
  if (effects.gain !== undefined) word(effects.gain, '+');
  if (effects.money !== undefined && effects.money !== 0) out.push(phrase(content, effects.money < 0 ? 'Lose {crowns}' : 'Gain {crowns}', { crowns: crownsPhrase(content, Math.abs(effects.money)) }));
  return out;
}

function nameOf(ctx: Ctx, scope: Scope, role: string): string | null {
  const id = scope[role];
  const person = id === undefined ? null : findCharacter(ctx.state, id);
  return person ? localName(ctx.content, fullName(person)) : null;
}

/** Words for the effects on the hero (or on a person of a role): one short line per change. Pure. */
export function effectWords(ctx: Ctx, effects: Effects | undefined, c: Character, scope: Scope): string[] {
  if (!effects) return [];
  const { content } = ctx;
  const out: string[] = [...moneyWords(ctx, c, effects)];
  for (const id of effects.traits?.add ?? []) out.push(phrase(content, 'Become {trait}', { trait: findTrait(content, id)?.name ?? id }));
  for (const id of effects.traits?.remove ?? []) out.push(phrase(content, 'Lose the trait {trait}', { trait: findTrait(content, id)?.name ?? id }));
  for (const id of STAT_IDS) {
    const step = effects.stats?.[id];
    if (step) out.push(`${signed(step)} ${phrase(content, cap(id))}`);
  }
  if (effects.fame) out.push(phrase(content, effects.fame > 0 ? 'Your fame grows' : 'Your fame fades'));
  if (effects.wound !== undefined) out.push(phrase(content, 'Wound: {name}', { name: conditionDef(content, effects.wound).name }));
  if (effects.disease !== undefined) out.push(phrase(content, 'Disease: {name}', { name: conditionDef(content, effects.disease).name }));
  if (effects.heal !== undefined) out.push(phrase(content, 'You mend'));
  if (effects.kill !== undefined) out.push(phrase(content, 'You die'));
  if (effects.happiness) out.push(`${phrase(content, 'Happiness')} ${signed(effects.happiness)}`);
  if (effects.house_renown) out.push(phrase(content, effects.house_renown > 0 ? 'Your house gains renown' : 'Your house loses renown'));
  if (effects.marry !== undefined) out.push(phrase(content, 'Marriage'));
  if (effects.heirloom_create) out.push(phrase(content, 'An heirloom: {name}', { name: effects.heirloom_create.name }));
  if (effects.heirloom_give) out.push(phrase(content, 'An heirloom changes hands'));
  if (effects.heirloom_sell) out.push(phrase(content, 'An heirloom is sold'));
  if (effects.heirloom_lose) out.push(phrase(content, 'An heirloom is lost'));
  if (effects.secret) out.push(phrase(content, 'A secret is kept'));
  if (effects.story || effects.schedule) out.push(phrase(content, 'Something else may follow'));
  for (const e of effects.relation ?? []) {
    const who = nameOf(ctx, scope, e.with);
    const kind = findRelationKind(content, e.start ?? e.end ?? '')?.name ?? phrase(content, 'a tie');
    if (who) out.push(e.start !== undefined ? phrase(content, '{who} becomes your {kind}', { who, kind: kind.toLowerCase() }) : phrase(content, 'Your tie with {who} ends', { who }));
  }
  if (effects.later?.length && !(effects.story || effects.schedule)) out.push(phrase(content, 'Something else may follow'));
  return out;
}

/** Words for the effects of `on:` roles: what others think of the hero afterwards. */
function roleWords(ctx: Ctx, outcome: OutcomeDef, scope: Scope): string[] {
  const out: string[] = [];
  for (const [role, effects] of Object.entries(outcome.on ?? {})) {
    const who = nameOf(ctx, scope, role);
    if (!who) continue;
    for (const e of (effects as Effects).opinion ?? []) {
      if (e.toward !== 'hero' && e.toward !== 'protagonist') continue;
      const value = e.value ?? findReason(ctx.content, e.reason)?.value ?? 0;
      out.push(phrase(ctx.content, value < 0 ? '{who} will think worse of you' : '{who} will think better of you', { who }));
    }
    for (const e of (effects as Effects).relation ?? []) {
      const kind = findRelationKind(ctx.content, e.start ?? e.end ?? '')?.name ?? phrase(ctx.content, 'a tie');
      out.push(e.start !== undefined ? phrase(ctx.content, '{who} becomes your {kind}', { who, kind: kind.toLowerCase() }) : phrase(ctx.content, 'Your tie with {who} ends', { who }));
    }
  }
  return out;
}

/** Everything one outcome says, with the hero's own effects first. */
function outcomeWords(ctx: Ctx, outcome: OutcomeDef, hero: Character, scope: Scope): string[] {
  const out = [...effectWords(ctx, outcome.effects as Effects | undefined, hero, scope), ...roleWords(ctx, outcome, scope)];
  if (outcome.next !== undefined) out.push(phrase(ctx.content, 'The matter goes on'));
  // the same line from two effects (two opinions of one person) is said once
  return [...new Set(out)];
}

/** The price: money paid in every outcome of the option, at the same sum. */
function splitCost(ctx: Ctx, hero: Character, outcomes: OutcomeDef[]): { cost: string[]; paid: number } {
  const sums = outcomes.map((o) => moneyOf(ctx, hero, o.effects as Effects | undefined));
  const first = sums[0];
  if (first === undefined || first >= 0 || !sums.every((s) => s === first)) return { cost: [], paid: 0 };
  // a price by level keeps its level in words (D-326, D-441)
  const refs = outcomes.map((o) => JSON.stringify((o.effects as Effects | undefined)?.pay));
  const pay = (outcomes[0]?.effects as Effects | undefined)?.pay;
  const sameLevel = pay !== undefined && refs.every((r) => r === refs[0]) && outcomes.every((o) => (o.effects as Effects | undefined)?.money === undefined);
  if (pay !== undefined && sameLevel) {
    const { level, times } = priceParts(pay);
    return { cost: [phrase(ctx.content, 'Costs {sum}{times} ({crowns})', { sum: phrase(ctx.content, LEVEL_WORDS[level] ?? level), times: times > 1 ? ` ×${times}` : '', crowns: crownsPhrase(ctx.content, -first) })], paid: first };
  }
  return { cost: [phrase(ctx.content, 'Costs {crowns}', { crowns: crownsPhrase(ctx.content, -first) })], paid: first };
}

function withoutMoney(ctx: Ctx, hero: Character, words: string[], effects: Effects | undefined, paid: number): string[] {
  if (paid === 0) return words;
  // the price is its own line: the money lines of this outcome are dropped from the list
  const money = new Set(effects ? moneyWords(ctx, hero, effects) : []);
  return words.filter((w) => !money.has(w));
}

/**
 * The words of an option for its tooltip. `scope` is the roles of the event; the hero is the main participant. An
 * option the player cannot choose still gets its words: a grey button explains itself (D-043).
 */
export function optionOutcomes(ctx: Ctx, option: OptionDef, hero: Character, scope: Scope): OptionOutcomes {
  const check = option.check;
  const outcomes = check ? [option.success ?? {}, option.failure ?? {}] : [ownEffects(option)];
  const { cost, paid } = splitCost(ctx, hero, outcomes);
  const words = (o: OutcomeDef) => withoutMoney(ctx, hero, outcomeWords(ctx, o, hero, scope), o.effects as Effects | undefined, paid);
  if (!check) return { cost, result: words(outcomes[0] ?? {}), success: [], failure: [], chanceBasis: [] };
  const stat = checkStat(ctx, check, hero, scope);
  const target = checkTarget(ctx, check, scope);
  // `checkStat` has the bonuses in it already; the person checked may be a role (`of`), who is named
  const who = check.of === undefined ? null : nameOf(ctx, scope, check.of);
  // the bonuses are tested on the person checked, as `checkStat` does; they are part of the number shown
  const person = checkedPerson(ctx, check, hero, scope);
  const bonus = stat - stats(ctx, person)[check.stat];
  const opponent = check.against ? nameOf(ctx, scope, check.against.role) : null;
  const content = ctx.content;
  const statName = (s: string) => phrase(content, cap(s));
  const against = check.against
    ? phrase(content, "{who}'s {stat} ({n})", { who: opponent ?? phrase(content, 'the other'), stat: statName(check.against.stat), n: target })
    : phrase(content, 'difficulty {n}', { n: target });
  const own = bonus !== 0 ? phrase(content, '{n}, of which {bonus} from circumstances', { n: stat, bonus: signed(bonus) }) : String(stat);
  const basis = who
    ? phrase(content, "{who}'s {stat} ({own}) against {against}", { who, stat: statName(check.stat), own, against })
    : phrase(content, '{stat} ({own}) against {against}', { stat: statName(check.stat), own, against });
  return {
    cost,
    result: [],
    success: words(outcomes[0] ?? {}),
    failure: words(outcomes[1] ?? {}),
    chanceBasis: [basis],
  };
}

function ownEffects(option: OptionDef): OutcomeDef {
  const { effects, on, next } = option;
  return { ...(effects ? { effects } : {}), ...(on ? { on } : {}), ...(next !== undefined ? { next } : {}) };
}
