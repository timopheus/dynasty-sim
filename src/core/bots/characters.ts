import type { Features } from './features';

/** Characters of the bots (D-247, D-319). `random` is the old bot: it picks any available answer. */
export const BOT_CHARACTERS = ['random', 'cautious', 'greedy', 'duelist'] as const;
export type BotCharacter = (typeof BOT_CHARACTERS)[number];

/** Stream of the bot's own generator in `seedRng(seed, stream)`; `random` keeps the stream 1 it always had. */
export const BOT_STREAMS: Record<BotCharacter, number> = { random: 1, cautious: 11, greedy: 12, duelist: 13 };

export function isBotCharacter(value: string): value is BotCharacter {
  return (BOT_CHARACTERS as readonly string[]).includes(value);
}

/**
 * Score of an option or action for a character: higher is better, equal scores are drawn by the bot's own generator.
 * Only integers (D-319): features are percents and money × 100.
 */
const SCORE: Record<Exclude<BotCharacter, 'random'>, (f: Features) => number> = {
  // Avoids death first, then wounds and a low chance of the check; money is a tie-breaker.
  cautious: (f) => -f.death * 1000 - f.wound * 40 - (100 - f.chance) * 20 - f.gravity * 30 - f.violence * 5 + Math.floor(f.money / 100),
  // Expected money, whatever it costs; a death risk is only a slight discount so the bot does not seek it.
  greedy: (f) => f.money - f.death * 30,
  // Wants the fight: challenges, violence, feuds, a fighting mood; shame and a refusal are what it hates.
  duelist: (f) => f.feud * 30 + f.violence * 25 + f.fight * 20 + f.gravity * 40 - f.shame * 25 - f.death * 3,
};

export function scoreOf(character: Exclude<BotCharacter, 'random'>, f: Features): number {
  return SCORE[character](f);
}

/**
 * What a point of happiness is worth to a character, in the units of its score (D-457, S.10): the bot weighs the price of
 * a deed against its nature. The cautious one keeps the nerve of its hero; the others care a little.
 */
export const HAPPINESS_WEIGHT: Record<Exclude<BotCharacter, 'random'>, number> = { cautious: 30, greedy: 8, duelist: 8 };
