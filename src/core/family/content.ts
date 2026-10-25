import { z } from 'zod';
import { PLACEHOLDERS } from '../character/text';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Range, Text, type ContentError } from '../content/types';
import { checkReason } from '../conditions/reasons';

/** Chances are out of 10000 (D-003: integers only). */
const Per10k = Int.min(0).max(10000);

/** A row of a table by age: it applies below `below` full years; the last row has no limit. */
const AgeRowSchema = z.strictObject({ below: Int.min(1).optional(), per10k: Per10k });

/** Rows by age, ascending; the last one has no `below`. */
const AgeTableSchema = z.array(AgeRowSchema).min(1);

export type AgeTable = z.infer<typeof AgeTableSchema>;

/** The kinds of kin of the condition `kin` and of the role `pick: kin` (4.5). */
export const KIN_KINDS = ['spouse', 'child', 'parent', 'sibling'] as const;
export type KinKind = (typeof KIN_KINDS)[number];

/**
 * The family of a person of the circle as it is when the person first joins the circle (D-313): only the living kin
 * are made, by these chances, from the person's own stream (`family/pedigree.ts`).
 */
const PedigreeSchema = z.strictObject({
  /** Chance that a relative of this age is still alive. */
  alive: AgeTableSchema,
  /** Chance that a person of this age has been married. */
  married: AgeTableSchema,
  /** Years between a parent and the child. */
  parentGap: Range,
  /** Years the husband is older than the wife. */
  spouseGap: Range,
  /** Brothers and sisters born, alive or not; made only when a parent is alive (siblings are linked by parents). */
  siblings: Range,
  /** Siblings are born up to this many years before or after the person. */
  siblingSpread: Int.min(0),
  /** Children born to a married woman per 10 years of marriage, at most; alive or not. */
  childrenPer10Years: Range,
});

/** Optional top-level key `family` (4.5, D-313): marriages, births, the pedigrees of the circle. */
export const FamilyContentSchema = z.strictObject({
  /**
   * Ceiling of living people in the state (D-313): couples of the circle have no new children while there are at
   * least this many; the hero's house always has.
   */
  livingMax: Int.min(1),
  /** Yearly chance of a married woman to conceive, by her age; a row with 0 ends the fertile years. */
  conception: AgeTableSchema,
  /** Days from the conception to the birth. */
  pregnancyDays: Range,
  /** Chance that the mother dies in childbirth (a death request with the cause `childbirth`, D-164). */
  childbirthDeathPer10k: Per10k,
  /** Event fired by the command `propose` (D-313): roles `suitor` and `target`, both `pick: given`. */
  proposalEvent: Id,
  pedigree: PedigreeSchema,
  texts: z.strictObject({
    /** Chronicle line about the hero: `{name}` the hero, `{other}` the spouse. */
    married: Text,
    /** Chronicle line about the hero: `{name}` the hero, `{other}` the mother or father, `{child}` the newborn, `{kind}` son or daughter. */
    born: Text,
    /** The same for a heroine who gave birth: `{name}` the heroine, `{child}` the newborn, `{kind}` son or daughter. */
    bornToHer: Text,
    /** Chronicle line about the hero: `{name}` the hero, `{other}` the dead child, `{kind}` son or daughter. */
    childDied: Text,
    /** Chronicle line about the hero: `{name}` the hero, `{other}` the dead spouse. */
    spouseDied: Text,
    /** Reasons of unmet conditions (D-043). */
    reasons: z.strictObject({
      married: Text,
      unmarried: Text,
      /** `{kind}` the kind of kin (`kinds`), `{name}` the other person. */
      kin: Text,
      /** `{count}` the number of living children. */
      childrenMin: Text,
      /** `{name}` the other person. */
      canMarry: Text,
    }),
    /** Words of the kinds of kin for the reason `kin`, e.g. `child: child`. */
    kinds: z.strictObject(Object.fromEntries(KIN_KINDS.map((k) => [k, Text])) as Record<KinKind, typeof Text>),
  }),
});

export type FamilyContent = z.infer<typeof FamilyContentSchema>;

/** The row of a table for an age; the last row when no `below` fits. */
export function ageRow(table: AgeTable, age: number): number {
  const row = table.find((r) => r.below === undefined || age < r.below) ?? table[table.length - 1];
  return row ? row.per10k : 0;
}

function checkAgeTable(table: AgeTable, path: string, err: (path: string, message: string) => void): void {
  let below = 0;
  table.forEach((row, i) => {
    const last = i === table.length - 1;
    if (row.below === undefined && !last) err(`${path}[${i}].below`, 'only the last row may have no limit');
    if (row.below !== undefined && last) err(`${path}[${i}].below`, 'the last row has no limit');
    if (row.below !== undefined) {
      if (row.below <= below) err(`${path}[${i}].below`, 'rows go up by age');
      below = row.below;
    }
  });
}

/** The death causes the family module writes itself; `health.causes` must have their lines. */
export const FAMILY_CAUSES = ['childbirth'] as const;

/**
 * Cross-check of `family`: tables by age go up; the proposal event exists and has the given roles `suitor` and
 * `target`; the death causes of births have lines; the texts use only their placeholders.
 */
export const checkFamily: CrossCheck = ({ family, events, health }) => {
  const errors: ContentError[] = [];
  const causes = new Set(health.flatMap((h) => h.item.causes.map((c) => c.id)));
  for (const { file, item } of family) {
    const err = (path: string, message: string) => errors.push({ file, path: `family.${path}`, message });
    checkAgeTable(item.conception, 'conception', err);
    checkAgeTable(item.pedigree.alive, 'pedigree.alive', err);
    checkAgeTable(item.pedigree.married, 'pedigree.married', err);
    const event = events.find((e) => e.item.id === item.proposalEvent)?.item;
    if (!event) err('proposalEvent', `unknown event "${item.proposalEvent}"`);
    else {
      for (const role of ['suitor', 'target']) {
        if (event.roles?.[role]?.pick !== 'given') err('proposalEvent', `event "${event.id}" needs a role "${role}" with pick: given`);
      }
      if (event.actions) err('proposalEvent', `event "${event.id}" is fired by a command and cannot be bound to actions`);
      if (event.places) err('proposalEvent', `event "${event.id}" is fired by a command and cannot be bound to places`);
    }
    for (const cause of FAMILY_CAUSES) {
      if (!causes.has(cause)) errors.push({ file, path: 'family', message: `health.causes has no line for the cause "${cause}" of births` });
    }
    const lines: [string, string, string[]][] = [
      ['married', item.texts.married, ['other']],
      ['born', item.texts.born, ['other', 'child', 'kind']],
      ['bornToHer', item.texts.bornToHer, ['child', 'kind']],
      ['childDied', item.texts.childDied, ['other', 'kind']],
      ['spouseDied', item.texts.spouseDied, ['other']],
    ];
    for (const [key, text, extra] of lines) {
      const problem = checkReason(text, [...PLACEHOLDERS, ...extra]);
      if (problem) err(`texts.${key}`, problem);
    }
    const reasons: [string, string, string[]][] = [
      ['married', item.texts.reasons.married, []],
      ['unmarried', item.texts.reasons.unmarried, []],
      ['kin', item.texts.reasons.kin, ['kind', 'name']],
      ['childrenMin', item.texts.reasons.childrenMin, ['count']],
      ['canMarry', item.texts.reasons.canMarry, ['name']],
    ];
    for (const [key, text, allowed] of reasons) {
      const problem = checkReason(text, allowed);
      if (problem) err(`texts.reasons.${key}`, problem);
    }
  }
  return errors;
};
