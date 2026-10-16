import { fullName } from '../core/character/character';
import type { Content } from '../core/content/schema';
import type { Command } from '../core/game';
import { getPlayer } from '../core/helpers';
import type { Character, GameState } from '../core/state';
import { heirOf, willGuardians, willHeirs } from '../core/succession/law';
import { willReasons } from '../core/succession/phases';
import { ageYears } from '../core/time/calendar';

export interface PersonChoice {
  id: string;
  /** Name and age, as the list shows it. */
  label: string;
}

/** The heir line of the hero screen (D-018): who inherits now and by what. */
export interface HeirLine {
  id: string;
  name: string;
  /** "by law", "by will", "by will, out of date". */
  by: string;
}

/** Who inherits from the hero now (D-018, D-314); null when nobody of the blood would. Pure. */
export function heirLine(state: GameState): HeirLine | null {
  const found = heirOf(state, state.playerId);
  if (!found) return null;
  const by = found.by === 'law' ? 'by law' : state.will?.stale ? 'by will, out of date' : 'by will';
  return { id: found.heir.id, name: fullName(found.heir), by };
}

/** What the will screen shows (D-314). Pure, so it can be tested without a DOM; main.ts draws it. */
export interface WillForm {
  /** Why the hero cannot go to the notary now (under age, too poor); empty when they can. */
  reasons: string[];
  cost: number;
  /** Kin who may be named heir, in the order of the law: the first is the heir by law. */
  heirs: PersonChoice[];
  /** Grown-ups near the hero who may be named guardian of an heir under age. */
  guardians: PersonChoice[];
  /** Without kin the house ends (D-315); false while the placeholder heir stands in (`temporaryHeir`). */
  endsWithoutKin: boolean;
  /** The terms of the current will, to start the form from. */
  current: { heir: string | null; guardian: string | null; stale: boolean } | null;
}

/** The will screen, or null when wills are not in the content. */
export function willForm(state: GameState, content: Content): WillForm | null {
  const ctx = { state, content };
  const reasons = willReasons(ctx);
  const pace = content.succession;
  if (reasons === null || !pace) return null;
  const hero = getPlayer(state);
  const choice = (c: Character): PersonChoice => ({ id: c.id, label: `${fullName(c)}, aged ${ageYears(c.birthDay, state.day)}` });
  const will = state.will;
  return {
    reasons,
    cost: pace.willCost,
    heirs: willHeirs(state, hero.id).map(choice),
    guardians: willGuardians(ctx, hero).map(choice),
    endsWithoutKin: !pace.temporaryHeir,
    current: will ? { heir: will.heir, guardian: will.guardian, stale: will.stale } : null,
  };
}

/** The `will` command from the values of the form; an empty value leaves the term to the law. */
export function willCommandOf(heir: string, guardian: string): Command {
  return { type: 'will', heir: heir === '' ? null : heir, guardian: guardian === '' ? null : guardian, items: [] };
}
