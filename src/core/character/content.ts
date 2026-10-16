import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { checkTemplate } from '../text/text';
import { EDUCATION_STAT_IDS } from './stat-ids';

export const SexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof SexSchema>;

/**
 * Top-level content key `names`, defined exactly once. Besides the name pools it
 * holds the texts of this module that have no better home: the stat scale, the
 * fame steps and the reasons shown when a sex condition is not met.
 */
export const NamesSchema = z.strictObject({
  given: z.strictObject({
    male: z.array(Text).min(1),
    female: z.array(Text).min(1),
  }),
  surnames: z.array(Text).min(1),
  /** Words for stat values (GDD 8.1): the last entry whose `from` is <= the value. */
  statScale: z.array(z.strictObject({ from: Int.min(0), word: Text })).min(1),
  /** Four fame steps, from private person to known to all (D-037). */
  fame: z.array(Text).length(4),
  /** Reason shown for an action that needs the given sex, to a character of the other sex. */
  requiresSex: z.strictObject({ male: Text, female: Text }),
});

const StatBonuses = z.strictObject({
  diplomacy: Int.optional(),
  martial: Int.optional(),
  stewardship: Int.optional(),
  intrigue: Int.optional(),
  learning: Int.optional(),
  prowess: Int.optional(),
});

export const TRAIT_CATEGORIES = ['character', 'education', 'skill', 'body', 'reputation', 'secret'] as const;

/** Top-level content key `traits`, a list merged from all files (D-032). */
export const TraitSchema = z.strictObject({
  id: Id,
  name: Text,
  category: z.enum(TRAIT_CATEGORIES),
  /** The trait that cannot be held together with this one; the link must go both ways. */
  opposite: Id.optional(),
  /** Changes to stats. Education traits get theirs from `education` instead. */
  stats: StatBonuses.optional(),
  /** How easily others see the trait (D-037): at a glance, with acquaintance, only through intrigue. */
  visibility: z.enum(['obvious', 'normal', 'secret']),
  /** Weight when traits are generated at random (0 = never). Education weights are the level weights. */
  weight: Int.min(0).default(0),
  /** Education only: the stat it raises and the level 1-4, a bonus of +2 per level (D-032). */
  education: z.strictObject({ stat: z.enum(EDUCATION_STAT_IDS), level: Int.min(1).max(4) }).optional(),
  /** Character traits only: the chronicle line written when a character gains the trait. */
  gained: Text.optional(),
});

export type Names = z.infer<typeof NamesSchema>;
export type TraitDef = z.infer<typeof TraitSchema>;

interface TraitsRef {
  add?: string[] | undefined;
  remove?: string[] | undefined;
}

/** Calls `visit` for the `traits` effect of every `effects` block found anywhere inside `node`. */
function walkTraitEffects(node: unknown, path: string, visit: (traits: TraitsRef, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkTraitEffects(item, `${path}[${i}]`, visit));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const at = `${path}.${key}`;
      if (key === 'effects' && value !== null && typeof value === 'object' && 'traits' in value) {
        visit((value as { traits: TraitsRef }).traits, `${at}.traits`);
      }
      walkTraitEffects(value, at, visit);
    }
  }
}

export const checkCharacter: CrossCheck = ({ names, traits, actions, events }) => {
  const errors: ContentError[] = [];

  for (const { file, item } of names) {
    item.statScale.forEach((step, i) => {
      const prev = item.statScale[i - 1];
      if (i === 0 && step.from !== 0) errors.push({ file, path: 'names.statScale[0].from', message: 'the stat scale must start at 0' });
      if (prev && step.from <= prev.from) {
        errors.push({ file, path: `names.statScale[${i}].from`, message: 'stat scale steps must be in ascending order' });
      }
    });
    // Shown as is, never filled in: no placeholders allowed.
    const plain: [string, string][] = [
      ['requiresSex.male', item.requiresSex.male],
      ['requiresSex.female', item.requiresSex.female],
      ...item.fame.map((t, i): [string, string] => [`fame[${i}]`, t]),
    ];
    for (const [key, text] of plain) {
      if (/[{}]/.test(text)) errors.push({ file, path: `names.${key}`, message: 'this text is shown as is; placeholders are not allowed' });
    }
  }

  const byId = new Map<string, TraitDef>();
  for (const { file, index, item } of traits) {
    const at = `traits[${index}]`;
    if (byId.has(item.id)) errors.push({ file, path: `${at}.id`, message: `duplicate trait id "${item.id}"` });
    byId.set(item.id, item);
    if (item.category === 'education') {
      if (!item.education) errors.push({ file, path: `${at}.education`, message: 'an education trait needs education: {stat, level}' });
      if (item.stats) errors.push({ file, path: `${at}.stats`, message: 'an education trait takes its bonus from its level, not from stats' });
      if (item.opposite) errors.push({ file, path: `${at}.opposite`, message: 'an education trait has no opposite' });
    } else if (item.education) {
      errors.push({ file, path: `${at}.education`, message: 'only an education trait has the education field' });
    }
    if (item.category === 'character') {
      if (!item.gained) errors.push({ file, path: `${at}.gained`, message: 'a character trait needs a gained line for the chronicle' });
    } else if (item.gained) {
      errors.push({ file, path: `${at}.gained`, message: 'only a character trait has a gained line' });
    }
    if (item.gained) {
      const problem = checkTemplate(item.gained);
      if (problem) errors.push({ file, path: `${at}.gained`, message: problem });
    }
  }
  for (const { file, index, item } of traits) {
    if (!item.opposite) continue;
    const at = `traits[${index}].opposite`;
    const other = byId.get(item.opposite);
    if (item.opposite === item.id) errors.push({ file, path: at, message: 'a trait cannot be its own opposite' });
    else if (!other) errors.push({ file, path: at, message: `unknown trait "${item.opposite}"` });
    else if (other.opposite !== item.id) {
      errors.push({ file, path: at, message: `"${item.opposite}" does not name "${item.id}" as its opposite back` });
    }
  }

  const checkRefs = (file: string, root: unknown, path: string) => {
    walkTraitEffects(root, path, (effect, at) => {
      const listed = [...(effect.add ?? []).map((id) => ['add', id] as const), ...(effect.remove ?? []).map((id) => ['remove', id] as const)];
      for (const [kind, id] of listed) {
        if (!byId.has(id)) errors.push({ file, path: `${at}.${kind}`, message: `unknown trait "${id}"` });
      }
      const added = (effect.add ?? []).flatMap((id) => byId.get(id) ?? []);
      if (added.filter((t) => t.category === 'education').length > 1) {
        errors.push({ file, path: `${at}.add`, message: 'a character has one education for life; one effect adds two' });
      }
      for (const t of added) {
        if (t.opposite && (effect.add ?? []).includes(t.opposite)) {
          errors.push({ file, path: `${at}.add`, message: `"${t.id}" and its opposite "${t.opposite}" are added together` });
        }
      }
      for (const id of effect.remove ?? []) {
        if ((effect.add ?? []).includes(id)) errors.push({ file, path: at, message: `"${id}" is both added and removed` });
      }
    });
  };
  for (const { file, index, item } of actions) checkRefs(file, item, `actions[${index}]`);
  for (const { file, index, item } of events) checkRefs(file, item, `events[${index}]`);
  return errors;
};
