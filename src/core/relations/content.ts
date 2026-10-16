import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';

/** What a reason is about: trait memory differs for wrongs done to a person and for favours (D-035). */
const ReasonKind = z.enum(['harm', 'benefit']);

/**
 * How a reason fades (D-035): over a number of days, never, or not until something ends it. `held` reasons are
 * ended by name (`until`), e.g. a debt repaid; the consumer is the event engine of stage 3.
 */
const DecaySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fade'), days: Int.min(1) }),
  z.strictObject({ kind: z.literal('never') }),
  z.strictObject({ kind: z.literal('held'), until: Id }),
]);

const ReasonSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Opinion points when the reason is fresh; negative for ill will. */
  value: Int.min(-100).max(100),
  kind: ReasonKind,
  decay: DecaySchema,
});

/** Trait of the person who holds the opinion changes how it remembers (D-035). */
const TraitEffectSchema = z.strictObject({
  trait: Id,
  kind: ReasonKind,
  /** Speed of forgetting in percent of normal: 0 never forgets, 200 forgets twice as fast. */
  fade: Int.min(0).max(1000).default(100),
  /** Weight of such reasons in percent of normal. */
  scale: Int.min(0).max(1000).default(100),
});

/** Constant background of one trait of the holder towards one trait of the other person (GDD 8.6). */
const BackgroundRuleSchema = z.strictObject({
  holder: Id,
  target: Id,
  value: Int.min(-100).max(100),
});

const WordSchema = z.strictObject({
  /** Lowest opinion value the word covers; the words run from -100 up. */
  from: Int.min(-100).max(100),
  text: Text,
});

/** A relation between two people (D-036). `a` is the patron in a patron-protege pair, and the roles are meaningful. */
const RelationKindSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Same role on both sides (friends, rivals, lovers): the pair has no order. */
  symmetric: z.boolean(),
  /** Standing reason in the opinion while the relation is active: what `a` thinks of `b` and the other way round. */
  opinion: z.strictObject({ a: Int.min(-100).max(100), b: Int.min(-100).max(100) }),
  /** Acquaintance the relation gives the hero at least. */
  acquaintance: z.enum(['known', 'close']),
});

/** Acquaintance of the hero grows with time near the circle (2.4, D-037). */
const AcquaintanceSchema = z.strictObject({
  /** Chance in percent each week that the hero meets one person of the circle they do not know yet. */
  meetPer100: Int.min(0).max(100),
  /** Days someone must be known before they can become close. */
  closeAfterDays: Int.min(0),
  /** Chance in percent each week that one such acquaintance still in the circle becomes close. */
  closePer100: Int.min(0).max(100),
});

/** Top-level content key `opinions`, at most once (D-035…D-037). */
export const OpinionsContentSchema = z.strictObject({
  reasons: z.array(ReasonSchema),
  traitEffects: z.array(TraitEffectSchema),
  background: z.strictObject({
    /** Limit of the background taken together, in both directions. */
    max: Int.min(0).max(100),
    rules: z.array(BackgroundRuleSchema),
  }),
  /** Opinion in words, from the lowest value up; the first word starts at -100. */
  words: z.array(WordSchema).min(1),
  relations: z.array(RelationKindSchema),
  acquaintance: AcquaintanceSchema,
});

export type OpinionsContent = z.infer<typeof OpinionsContentSchema>;
export type ReasonDef = z.infer<typeof ReasonSchema>;
export type RelationKindDef = z.infer<typeof RelationKindSchema>;
export type ReasonKindId = z.infer<typeof ReasonKind>;

/** Checks across modules, e.g. trait ids referenced from opinions (2.4). */
export const checkRelations: CrossCheck = ({ opinions, traits }) => {
  const errors: ContentError[] = [];
  const traitIds = new Set(traits.map((t) => t.item.id));
  for (const { file, item } of opinions) {
    const err = (path: string, message: string) => errors.push({ file, path: `opinions.${path}`, message });
    const unique = (path: string, ids: string[], what: string) => {
      const seen = new Set<string>();
      ids.forEach((id, i) => {
        if (seen.has(id)) err(`${path}[${i}].id`, `duplicate ${what} id "${id}"`);
        seen.add(id);
      });
    };
    unique('reasons', item.reasons.map((r) => r.id), 'reason');
    unique('relations', item.relations.map((r) => r.id), 'relation');
    item.relations.forEach((k, i) => {
      if (k.symmetric && k.opinion.a !== k.opinion.b) err(`relations[${i}].opinion`, 'a symmetric relation needs the same opinion on both sides');
    });
    item.reasons.forEach((r, i) => {
      if (r.value === 0) err(`reasons[${i}].value`, 'a reason must change the opinion');
    });
    const known = (path: string, id: string) => {
      if (!traitIds.has(id)) err(path, `unknown trait "${id}"`);
    };
    item.traitEffects.forEach((e, i) => known(`traitEffects[${i}].trait`, e.trait));
    const rules = new Set<string>();
    item.background.rules.forEach((r, i) => {
      known(`background.rules[${i}].holder`, r.holder);
      known(`background.rules[${i}].target`, r.target);
      const key = `${r.holder}/${r.target}`;
      if (rules.has(key)) err(`background.rules[${i}]`, `duplicate rule for "${r.holder}" towards "${r.target}"`);
      rules.add(key);
    });
    const pairs = new Set<string>();
    item.traitEffects.forEach((e, i) => {
      const key = `${e.trait}/${e.kind}`;
      if (pairs.has(key)) err(`traitEffects[${i}]`, `duplicate effect of trait "${e.trait}" on ${e.kind}`);
      pairs.add(key);
    });
    if (item.words[0]?.from !== -100) err('words[0].from', 'the first word must start at -100');
    item.words.forEach((w, i) => {
      const prev = item.words[i - 1];
      if (prev && w.from <= prev.from) err(`words[${i}].from`, 'words must rise strictly');
    });
  }
  return errors;
};
