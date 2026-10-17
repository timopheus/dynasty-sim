import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import { checkReason } from '../conditions/reasons';
import type { Effects } from '../effects';
import type { CrossCheck, ContentSources } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import type { EventDef, OutcomeDef } from '../events/content';

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
  /**
   * 4.8: when the head dies, whoever held this reason against them holds the reason `inherits_as` against the heir
   * (a weaker "enemy of my father", a debt of honour). Must go the same way as this reason.
   */
  inherits_as: Id.optional(),
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

/** Renown of the target's house adds to the background of those outside it (4.8, D-035): the last step whose `from` is <= the renown. */
const RenownStepSchema = z.strictObject({
  from: Int,
  value: Int.min(-100).max(100),
});

/** What passes to the heir with the head (4.8, GDD §8.6). */
const InheritanceSchema = z.strictObject({
  /** Kind of relation (a rival) that passes to the heir, if the enemy still holds an inheritable reason against the dead. */
  feudRelation: Id,
  /** Chronicle line "Heir to the feud": `{name}` is the heir, `{other}` the enemy, `{deceased}` the dead head. */
  feudText: Text,
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
  /**
   * Chronicle lines when an event starts or ends the hero's tie (GDD 8.9, D-121): `{name}` is the hero, `{other}` the
   * other person. In a patron-protege pair these are for the hero as the patron; `...AsProtege` for the hero as the protege.
   */
  starts: Text,
  ends: Text,
  startsAsProtege: Text.optional(),
  endsAsProtege: Text.optional(),
});

/** Texts of the reasons why a condition on opinions and relations is not met (D-043, D-221). */
const ConditionTextsSchema = z.strictObject({
  /** `{word}` opinion word of the bound, `{name}` the other person. */
  opinionMin: Text,
  opinionMax: Text,
  /** `{kind}` name of the relation kind in lower case, `{name}` the other person. */
  relation: Text,
  relationNone: Text,
  /** `{name}` the person the condition is about. */
  acquaintedKnown: Text,
  acquaintedClose: Text,
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
    /** Renown of the house of the target as a constant part for people not of that house (4.8); steps rise strictly. */
    renown: z.array(RenownStepSchema).default([]),
  }),
  /** Opinion in words, from the lowest value up; the first word starts at -100. */
  words: z.array(WordSchema).min(1),
  relations: z.array(RelationKindSchema),
  acquaintance: AcquaintanceSchema,
  /** Without it nothing passes to the heir except the reasons with `inherits_as`. */
  inheritance: InheritanceSchema.optional(),
  texts: ConditionTextsSchema,
});

export type OpinionsContent = z.infer<typeof OpinionsContentSchema>;
export type ReasonDef = z.infer<typeof ReasonSchema>;
export type RelationKindDef = z.infer<typeof RelationKindSchema>;
export type ReasonKindId = z.infer<typeof ReasonKind>;

/** Checks across modules, e.g. trait ids referenced from opinions (2.4). */
export const checkRelations: CrossCheck = (sources) => {
  const { opinions, traits } = sources;
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
      const both = k.startsAsProtege !== undefined && k.endsAsProtege !== undefined;
      const none = k.startsAsProtege === undefined && k.endsAsProtege === undefined;
      if (k.symmetric && !none) err(`relations[${i}]`, 'a symmetric relation has no lines for the protege');
      if (!k.symmetric && !both) err(`relations[${i}]`, 'a patron-protege relation needs startsAsProtege and endsAsProtege');
      for (const key of ['starts', 'ends', 'startsAsProtege', 'endsAsProtege'] as const) {
        const text = k[key];
        const problem = text === undefined ? null : checkReason(text, [...PLACEHOLDERS, 'other']);
        if (problem) err(`relations[${i}].${key}`, problem);
      }
    });
    const texts: [keyof typeof item.texts, string[]][] = [
      ['opinionMin', ['word', 'name']],
      ['opinionMax', ['word', 'name']],
      ['relation', ['kind', 'name']],
      ['relationNone', ['kind', 'name']],
      ['acquaintedKnown', ['name']],
      ['acquaintedClose', ['name']],
    ];
    for (const [key, allowed] of texts) {
      const problem = checkReason(item.texts[key], allowed);
      if (problem) err(`texts.${key}`, problem);
    }
    item.reasons.forEach((r, i) => {
      if (r.value === 0) err(`reasons[${i}].value`, 'a reason must change the opinion');
      if (r.decay.kind === 'held' && item.reasons.some((o) => o.id === (r.decay as { until: string }).until)) {
        err(`reasons[${i}].decay.until`, 'the name an event ends a held reason by must not be a reason id');
      }
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
    item.reasons.forEach((r, i) => {
      if (r.inherits_as === undefined) return;
      const to = item.reasons.find((o) => o.id === r.inherits_as);
      if (!to) err(`reasons[${i}].inherits_as`, `unknown reason "${r.inherits_as}"`);
      else if (to.id === r.id) err(`reasons[${i}].inherits_as`, 'a reason cannot pass as itself');
      else if (Math.sign(to.value) !== Math.sign(r.value)) err(`reasons[${i}].inherits_as`, `reason "${to.id}" goes the other way than "${r.id}"`);
      else if (to.inherits_as !== undefined) err(`reasons[${i}].inherits_as`, `reason "${to.id}" itself passes on: a feud goes one generation`);
    });
    item.background.renown.forEach((s, i) => {
      const prev = item.background.renown[i - 1];
      if (prev && s.from <= prev.from) err(`background.renown[${i}].from`, 'steps must rise strictly');
    });
    if (item.inheritance) {
      const kind = item.relations.find((k) => k.id === item.inheritance!.feudRelation);
      if (!kind) err('inheritance.feudRelation', `unknown relation kind "${item.inheritance.feudRelation}"`);
      else if (!kind.symmetric) err('inheritance.feudRelation', `relation kind "${kind.id}" must be symmetric: the feud has no patron`);
      const problem = checkReason(item.inheritance.feudText, [...PLACEHOLDERS, 'other', 'deceased']);
      if (problem) err('inheritance.feudText', problem);
    }
    if (item.words[0]?.from !== -100) err('words[0].from', 'the first word must start at -100');
    item.words.forEach((w, i) => {
      const prev = item.words[i - 1];
      if (prev && w.from <= prev.from) err(`words[${i}].from`, 'words must rise strictly');
    });
  }
  errors.push(...checkEventLinks(sources));
  return errors;
};

interface Walk {
  reasons: Map<string, number>;
  until: Set<string>;
  kinds: Set<string>;
  file: string;
  errors: ContentError[];
}

function eachWhen(event: EventDef): [string, object][] {
  const out: [string, object][] = [];
  const add = (path: string, when: object | undefined) => {
    if (when) out.push([path, when]);
  };
  add('when', event.when);
  event.weight_mods?.forEach((m, i) => add(`weight_mods[${i}].when`, m.when));
  for (const [name, role] of Object.entries(event.roles ?? {})) {
    add(`roles.${name}.where`, role.where);
    role.prefer?.forEach((p, i) => add(`roles.${name}.prefer[${i}].when`, p.when));
  }
  const scene = (prefix: string, s: EventDef | NonNullable<EventDef['pages']>[string]) => {
    s.options?.forEach((o, i) => {
      add(`${prefix}options[${i}].when`, o.when);
      o.check?.bonus?.forEach((b, j) => add(`${prefix}options[${i}].check.bonus[${j}].when`, b.when));
    });
  };
  scene('', event);
  for (const [id, page] of Object.entries(event.pages ?? {})) scene(`pages.${id}.`, page);
  return out;
}

function eachOutcome(event: EventDef): [string, OutcomeDef][] {
  const out: [string, OutcomeDef][] = [];
  const scene = (prefix: string, s: EventDef | NonNullable<EventDef['pages']>[string]) => {
    if (!s.options) {
      out.push([prefix.replace(/\.$/, ''), s]);
      return;
    }
    s.options.forEach((o, i) => {
      const at = `${prefix}options[${i}]`;
      if (o.check) {
        if (o.success) out.push([`${at}.success`, o.success]);
        if (o.failure) out.push([`${at}.failure`, o.failure]);
      } else {
        out.push([at, o]);
      }
    });
  };
  scene('', event);
  for (const [id, page] of Object.entries(event.pages ?? {})) scene(`pages.${id}.`, page);
  return out;
}

function walkEffects(w: Walk, at: string, effects: Effects): void {
  const err = (path: string, message: string) => w.errors.push({ file: w.file, path: `${at}.${path}`, message });
  effects.opinion?.forEach((o, i) => {
    const def = w.reasons.get(o.reason);
    if (def === undefined) err(`opinion[${i}].reason`, `unknown opinion reason "${o.reason}"`);
    else if (o.value !== undefined && (o.value === 0 || Math.sign(o.value) !== Math.sign(def))) {
      err(`opinion[${i}].value`, `the value ${o.value} does not go the way of reason "${o.reason}" (${def > 0 ? 'positive' : 'negative'})`);
    }
  });
  effects.opinion_end?.forEach((o, i) => {
    if (!w.reasons.has(o.reason) && !w.until.has(o.reason)) err(`opinion_end[${i}].reason`, `unknown opinion reason or held name "${o.reason}"`);
  });
  effects.relation?.forEach((r, i) => {
    const kind = r.start ?? r.end ?? '';
    if (!w.kinds.has(kind)) err(`relation[${i}].${r.start === undefined ? 'end' : 'start'}`, `unknown kind of relation "${kind}"`);
  });
  effects.later?.forEach((entry, i) => walkEffects(w, `${at}.later[${i}].effects`, entry.effects as Effects));
}

/** Reasons, kinds of relations and held names that events name must exist (D-222). */
function checkEventLinks({ opinions, events }: ContentSources): ContentError[] {
  const errors: ContentError[] = [];
  const reasons = new Map<string, number>();
  const until = new Set<string>();
  const kinds = new Set<string>();
  for (const { item } of opinions) {
    for (const r of item.reasons) {
      reasons.set(r.id, r.value);
      if (r.decay.kind === 'held') until.add(r.decay.until);
    }
    for (const k of item.relations) kinds.add(k.id);
  }
  for (const { file, index, item } of events) {
    const base = `events[${index}]`;
    const w: Walk = { reasons, until, kinds, file, errors };
    for (const [path, when] of eachWhen(item)) {
      const { relation, relation_none } = when as { relation?: { kind: string }; relation_none?: { kind: string } };
      for (const [key, link] of [['relation', relation], ['relation_none', relation_none]] as const) {
        if (link && !kinds.has(link.kind)) errors.push({ file, path: `${base}.${path}.${key}.kind`, message: `unknown kind of relation "${link.kind}"` });
      }
    }
    for (const [path, outcome] of eachOutcome(item)) {
      const at = path === '' ? base : `${base}.${path}`;
      if (outcome.effects) walkEffects(w, `${at}.effects`, outcome.effects as Effects);
      for (const [role, effects] of Object.entries(outcome.on ?? {})) walkEffects(w, `${at}.on.${role}`, effects as Effects);
    }
  }
  return errors;
}
