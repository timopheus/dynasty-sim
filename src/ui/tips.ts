import { findTrait } from '../core/character/holding';
import { ageModifiers, stats } from '../core/character/stats';
import { STAT_IDS, type StatId } from '../core/character/stat-ids';
import type { Content } from '../core/content/schema';
import type { Character, Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';
import { conceptName, conceptTip } from './concepts';
import { tr } from './i18n';

/** The tone of a number in a breakdown: a plus is green, a minus red, a nought grey (TT.1, as in CK3). */
export type Tone = 'good' | 'bad' | 'zero';

/** One line of a breakdown: the source on the left (a link if it has a tip of its own), the signed value on the right. */
export interface TipRow {
  label: string;
  value: string;
  tone?: Tone;
  /** Opens when the line is hovered in a locked tip. */
  tip?: Tip;
}

/** A condition of a grey button: met ones with a green tick, unmet with a red cross (CK3 shows requirements so). */
export interface TipCond {
  ok: boolean;
  text: string;
}

/** What a mouse button does on the thing; the lines stand at the bottom of the tip, each with the drawing of the button. */
export interface MouseHint {
  button: 'left' | 'right' | 'middle';
  text: string;
}

/**
 * What a tooltip says (D-477, as in CK3): a title, a crumb under it for an object («Your sister · 14 years»), a text in
 * which `[[id]]` or `[[id|word]]` is a link to a concept of the dictionary (`concepts.ts`), the lines of a breakdown with
 * a total, conditions, and at the bottom what the mouse does. Empty parts are not drawn.
 */
export interface Tip {
  title?: string;
  crumb?: string;
  text: string;
  rows?: TipRow[];
  total?: { label: string; value: string; tone?: Tone };
  conds?: TipCond[];
  mouse?: MouseHint[];
}

/** A signed number with the real minus sign, and the tone it is shown in. */
export function signedRow(label: string, n: number, tip?: Tip): TipRow {
  return { label, value: n < 0 ? `−${-n}` : `+${n}`, tone: n > 0 ? 'good' : n < 0 ? 'bad' : 'zero', ...(tip ? { tip } : {}) };
}

/** The text with the markup of concepts taken out: for the attribute a screen reader and the tests read. */
export function plainText(text: string): string {
  return text.replace(/\[\[([a-z-]+)(?:\|([^\]]*))?\]\]/g, (_w, id: string, word?: string) => word ?? conceptName(id));
}

/** The whole tip as a flat text: the same words in one line each. */
export function flatTip(tip: Tip): string {
  return [
    plainText(tip.text),
    ...(tip.rows ?? []).map((r) => `${plainText(r.label)} ${r.value}`),
    ...(tip.total ? [`${tip.total.label} ${tip.total.value}`] : []),
    ...(tip.conds ?? []).map((c) => `${c.ok ? '✓' : '✗'} ${c.text}`),
    ...(tip.mouse ?? []).map((m) => m.text),
  ].filter(Boolean).join('\n');
}

/** What a stat is made of for someone whose numbers the player knows: the base, each trait, the age. */
export function statRows(ctx: Ctx, c: Character, id: StatId): TipRow[] {
  const out: TipRow[] = [{ label: tr('Base'), value: String(c.baseStats[id]), tone: 'zero' }];
  for (const traitId of c.traits) {
    const def = findTrait(ctx.content, traitId);
    if (!def) continue;
    const bonus = (def.stats?.[id] ?? 0) + (def.education?.stat === id ? 2 * def.education.level : 0);
    if (bonus !== 0) out.push(signedRow(def.name, bonus, traitTip(ctx.content, def.name) ?? undefined));
  }
  const age = ageModifiers(ageYears(c.birthDay, ctx.state.day))[id] ?? 0;
  if (age !== 0) out.push(signedRow(tr('Age'), age));
  return out;
}

/**
 * A stat: its name with the number as the title, what it means with links to the dictionary, and for someone whose
 * numbers the player knows the breakdown: base, each trait (a link to its own tip), age.
 */
export function statTip(ctx: Ctx, c: Character | null, id: string): Tip | null {
  const known = STAT_IDS.find((s) => s === id);
  if (!known) return null;
  const meaning = conceptTip(known)?.text ?? '';
  const name = conceptName(known);
  if (!c) return { title: name, text: meaning };
  const rows = statRows(ctx, c, known);
  const total = stats(ctx, c)[known];
  return { title: `${name}: ${total}`, text: meaning, rows, total: { label: name, value: String(total), tone: 'zero' } };
}

/**
 * A trait with what it changes, from the content: its name, the kind as the crumb, the effects with the sign in front.
 */
export function traitTip(content: Content, name: string): Tip | null {
  const def = content.traits.find((t) => t.name === name);
  if (!def) return null;
  const statName = (s: string) => conceptName(s);
  const rows = STAT_IDS.flatMap((s) => (def.stats?.[s] ? [signedRow(statName(s), def.stats[s] ?? 0)] : []));
  if (def.education) rows.push(signedRow(statName(def.education.stat), 2 * def.education.level));
  const kind = def.category === 'education' ? tr('Education') : def.category === 'body' ? tr('A trait of the body') : tr('A trait of character');
  return { title: def.name, crumb: kind, text: '', ...(rows.length ? { rows } : {}) };
}

/** The figures of the header (D-448): the words of a tip; the links to the dictionary are `[[id]]` (TT.1). */
export const HEADER_TIPS: Record<string, string> = {
  money: 'Crowns in your purse. What the month brings in and takes out depends on your work and on [[stewardship]].',
  fame: 'How far your name has travelled. It opens doors and draws eyes; the house has its own [[house-renown|renown]].',
  'house renown': 'How well the house is known, beyond the [[fame]] of its head.',
  'house status': 'Where the house stands among the families of the land. It sets what the house must spend to keep its name.',
};

/** The concept each label of a page row stands for: its tip is the tip of the concept, with the row's own words (TT.1). */
export const ROW_CONCEPTS: Record<string, string> = {
  Fame: 'fame',
  Heir: 'heir',
  Status: 'house-status',
  Renown: 'house-renown',
  Health: 'health',
};

/**
 * Rows of a page whose label does not say it all; the others (father, money, age…) have no tip. A row of a concept
 * shows the tip of the concept; the others have a line of their own.
 */
export const ROW_TIPS: Record<string, string> = {
  Living: 'Members of the house alive now whom you know of.',
};

/** The tip of a row of a page by its label: a concept's, or the line of its own; null where the label says it all. */
export function rowTip(label: string): Tip | null {
  const concept = ROW_CONCEPTS[label];
  if (concept) return conceptTip(concept);
  const text = ROW_TIPS[label];
  return text ? { title: tr(label), text: tr(text) } : null;
}
