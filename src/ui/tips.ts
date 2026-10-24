import { findTrait } from '../core/character/holding';
import { ageModifiers } from '../core/character/stats';
import { STAT_IDS, type StatId } from '../core/character/stat-ids';
import type { Content } from '../core/content/schema';
import type { Character, Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';

/** What a tooltip says (D-444, D-448): a title and a line or two; never another tooltip inside. */
export interface Tip {
  title: string;
  text: string;
}

/** What each stat means (GDD 8.1), for the tooltips of the stats. */
export const STAT_MEANING: Record<StatId, string> = {
  diplomacy: 'Winning people over: talks, matches, favours.',
  martial: 'Leading men in a fight and in the field.',
  stewardship: 'Managing money and land.',
  intrigue: 'Schemes, secrets and cunning.',
  learning: 'Book learning, medicine and the law.',
  prowess: 'Personal strength with a weapon; it fades with age.',
};

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** What a stat is made of for someone whose numbers the player knows: the base, each trait, the age. */
export function statParts(ctx: Ctx, c: Character, id: StatId): string[] {
  const out = [`base ${c.baseStats[id]}`];
  for (const traitId of c.traits) {
    const def = findTrait(ctx.content, traitId);
    if (!def) continue;
    const bonus = (def.stats?.[id] ?? 0) + (def.education?.stat === id ? 2 * def.education.level : 0);
    if (bonus !== 0) out.push(`${signed(bonus)} ${def.name}`);
  }
  const age = ageModifiers(ageYears(c.birthDay, ctx.state.day))[id] ?? 0;
  if (age !== 0) out.push(`${signed(age)} age`);
  return out;
}

export function statTip(ctx: Ctx, c: Character | null, id: string, label: string, shown: string): Tip {
  const known = STAT_IDS.find((s) => s === id);
  const parts = known && c ? statParts(ctx, c, known).join(' · ') : '';
  return { title: `${label} ${shown}`, text: [known ? STAT_MEANING[known] : '', parts].filter(Boolean).join(' ') };
}

/** A trait with what it changes, from the content. */
export function traitTip(content: Content, name: string): Tip {
  const def = content.traits.find((t) => t.name === name);
  if (!def) return { title: name, text: 'A trait.' };
  const bonuses = STAT_IDS.flatMap((s) => (def.stats?.[s] ? [`${signed(def.stats[s] ?? 0)} ${s}`] : []));
  if (def.education) bonuses.push(`${signed(2 * def.education.level)} ${def.education.stat}`);
  const kind = def.category === 'education' ? 'Education' : def.category === 'body' ? 'A trait of the body' : 'A trait of character';
  return { title: name, text: [kind, bonuses.join(', ')].filter(Boolean).join('. ') + '.' };
}

/** The figures of the header (D-448). */
export const HEADER_TIPS: Record<string, string> = {
  money: 'Crowns in your purse. Under it, what the month brings in and takes out; click it for the lines.',
  fame: 'How far your name has travelled. It opens doors and draws eyes.',
  'house renown': 'How well the house is known, beyond the fame of its head.',
  'house status': 'Where the house stands among the families of the land.',
};

/** Rows of a page that explain themselves on hover. */
export const ROW_TIPS: Record<string, string> = {
  Age: 'Sex and years of life.',
  Occupation: 'What the person does for a living.',
  Fame: 'How far the name has travelled.',
  Health: 'Wounds and illnesses now.',
  Money: 'Crowns in the purse.',
  Heir: 'Who takes up the house when the head dies, by law or by will.',
};
