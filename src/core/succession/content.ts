import { z } from 'zod';
import { Id, Int, Text, type ContentError } from '../content/types';
import type { Content, CrossCheck } from '../content/schema';
import { checkTemplate } from '../text/text';

/**
 * Optional top-level key `succession` (4.6, D-314, D-315, D-360). Without it the law still works, the placeholder heir
 * of D-007 stands in when there is no kin, and wills are not in the game.
 */
export const SuccessionContentSchema = z.strictObject({
  /**
   * Scaffolding until 4.13 (D-315): when the law finds no living kin, a generated adult of the same surname takes the
   * house (D-007) instead of the end of the house. 4.13 sets it to false.
   */
  temporaryHeir: z.boolean(),
  /** Age of that placeholder heir; `settings.adultAge` without it (D-320). */
  temporaryHeirAge: z.strictObject({ min: Int.min(0), max: Int.min(0) }).optional(),
  /**
   * The action "at the notary" the `will` command starts (D-314, D-360): its duration is the time a will takes; its
   * `when` has `will_command: true` (only the command starts it) and its effects `will_signed: true`.
   */
  willAction: Id,
  /** What the notary takes, paid when the will is signed at the end of the action. */
  willCost: Int.min(0),
  /** Share of the money for the main heir in percent; the rest goes in equal parts to the other children and the widow (D-314). */
  heirPercent: Int.min(0).max(100),
  /** Reason of opinion of the heir by law towards the heir a will put before them (D-314). */
  passedOverReason: Id,
  /** Relation kind of the guardian (`a`) and the ward (`b`), not symmetric (D-314). */
  guardianRelation: Id,
  texts: z.strictObject({
    /** Chronicle line of the new head: `{name}` is the heir, `{deceased}` the dead head. */
    byLaw: Text,
    byWill: Text,
    /** The house comes to an end: `{name}` is the last head, `{house}` the surname. */
    ended: Text,
    /** Journal lines of the hero: `{heir}` is the named heir. */
    willSigned: Text,
    willSignedNoHeir: Text,
    /** The will is out of date (D-314): a child was born, or a person it names died (`{other}`). */
    willStaleBirth: Text,
    willStaleDeath: Text,
  }),
});

export type SuccessionContent = z.infer<typeof SuccessionContentSchema>;

export function successionContent(content: Content): SuccessionContent | null {
  return content.succession;
}

/** Extra placeholders of each text beside those of the subject. */
const TEXT_EXTRAS: Record<keyof SuccessionContent['texts'], string[]> = {
  byLaw: ['deceased'],
  byWill: ['deceased'],
  ended: ['house'],
  willSigned: ['heir'],
  willSignedNoHeir: [],
  willStaleBirth: [],
  willStaleDeath: ['other'],
};

function checkText(text: string, extras: string[]): string | null {
  let rest = text;
  for (const extra of extras) rest = rest.replaceAll(`{${extra}}`, 'x');
  const problem = checkTemplate(rest);
  return problem === null ? null : `${problem}${extras.length ? `; this text may also use ${extras.map((e) => `{${e}}`).join(', ')}` : ''}`;
}

export const checkSuccession: CrossCheck = ({ succession, actions, opinions }) => {
  const errors: ContentError[] = [];
  for (const { file, item } of succession) {
    const err = (path: string, message: string) => errors.push({ file, path: `succession.${path}`, message });
    if (item.temporaryHeirAge && item.temporaryHeirAge.min > item.temporaryHeirAge.max) err('temporaryHeirAge', 'min is above max');
    const action = actions.find((a) => a.item.id === item.willAction)?.item;
    if (!action) err('willAction', `unknown action "${item.willAction}"`);
    else {
      if (action.when?.will_command !== true) err('willAction', `action "${action.id}" needs when: { will_command: true }: only the will command starts it`);
      if (action.effects?.will_signed !== true) err('willAction', `action "${action.id}" needs effects: { will_signed: true }: the will takes effect at its end`);
    }
    for (const { item: other } of actions) {
      if (other.id === item.willAction) continue;
      if (other.when?.will_command !== undefined) err('willAction', `only the will action "${item.willAction}" may use will_command (action "${other.id}")`);
      if (other.effects?.will_signed !== undefined) err('willAction', `only the will action "${item.willAction}" may use will_signed (action "${other.id}")`);
    }
    const ops = opinions[0]?.item;
    if (!ops?.reasons.some((r) => r.id === item.passedOverReason)) err('passedOverReason', `unknown reason of opinion "${item.passedOverReason}"`);
    const kind = ops?.relations.find((r) => r.id === item.guardianRelation);
    if (!kind) err('guardianRelation', `unknown relation kind "${item.guardianRelation}"`);
    else if (kind.symmetric) err('guardianRelation', `relation kind "${kind.id}" must not be symmetric: the guardian is its a`);
    for (const [key, extras] of Object.entries(TEXT_EXTRAS)) {
      const problem = checkText(item.texts[key as keyof SuccessionContent['texts']], extras);
      if (problem) err(`texts.${key}`, problem);
    }
  }
  return errors;
};
