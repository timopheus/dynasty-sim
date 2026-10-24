import { anyCharacter } from '../core/archive/archive';
import { fullName } from '../core/character/character';
import { marriageBar } from '../core/family/marriage';
import { proposalOptions } from '../core/family/proposals';
import type { ProposeOrder } from '../core/family/phases';
import { findCharacter, getPlayer } from '../core/helpers';
import { houseById } from '../core/house/house';
import { acquaintanceLevel } from '../core/relations/acquaintance';
import type { Character, Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';
import { isNear } from '../core/world/world';
import type { Tip } from './tips';

/** Who a person is to the hero, in words: "Your father", "A close acquaintance". Only what the hero may know (D-037). */
export function kinship(ctx: Ctx, id: string): string {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  if (id === hero.id) return 'You';
  const c = anyCharacter(state, id);
  if (!c) return 'Nobody known';
  const word = (m: string, f: string) => (c.sex === 'male' ? m : f);
  if (hero.father === id || hero.mother === id) return `Your ${word('father', 'mother')}`;
  if (c.father === hero.id || c.mother === hero.id) return `Your ${word('son', 'daughter')}`;
  if (hero.spouse === id) return `Your ${word('husband', 'wife')}`;
  const shares = (hero.father !== null && c.father === hero.father) || (hero.mother !== null && c.mother === hero.mother);
  if (shares) return `Your ${word('brother', 'sister')}`;
  const level = acquaintanceLevel(state, content, hero.id, id);
  return level === 'close' ? 'A close acquaintance' : level === 'known' ? 'An acquaintance' : 'A stranger to you';
}

/** Tooltip of a name anywhere on the screen (D-448): who it is to the hero, and the age of someone the hero knows. */
export function personTip(ctx: Ctx, id: string): Tip | null {
  const c = anyCharacter(ctx.state, id);
  if (!c) return null;
  const who = kinship(ctx, id);
  const known = who !== 'A stranger to you';
  const age = known ? `, ${c.deathDay === null ? `aged ${ageYears(c.birthDay, ctx.state.day)}` : 'dead'}` : c.deathDay !== null ? ', dead' : '';
  return { title: fullName(c), text: `${who}${age}. Click for the page, right click for what you can do.` };
}

/** Tooltip of a link to a page: a person says who they are to the hero, a house names itself. */
export function entityTip(ctx: Ctx, id: string): Tip | null {
  const person = personTip(ctx, id);
  if (person) return person;
  const house = houseById(ctx.state, id);
  return house ? { title: `House ${house.name}`, text: 'A house. Click for its page.' } : null;
}

/** One line of the menu of a person (D-448): grey with the reason when it cannot be done now. */
export interface MenuItem {
  label: string;
  note: string;
  grey: boolean;
  reason: string;
  /** What choosing it does: open the page, or propose the match. */
  action: { type: 'open'; id: string } | { type: 'propose'; order: ProposeOrder };
}

export interface PersonMenu {
  id: string;
  title: string;
  items: MenuItem[];
}

const BARS: Record<string, string> = {
  young: 'one of you is too young to marry',
  sex: 'the customs of the time forbid it',
  married: 'one of you is married',
  kin: 'too close kin',
};

function whyNotWed(ctx: Ctx, hero: Character, person: Character): string {
  const bar = marriageBar(ctx, hero, person);
  if (bar !== null) return BARS[bar] ?? 'not possible';
  if (ctx.state.status !== 'awaiting_action' && ctx.state.status !== 'running') return 'not now';
  return isNear(ctx.state, person.id) ? 'not possible now' : 'not near you';
}

/**
 * What the hero can do with a person: the interactions the core offers (matches, D-313), the rest grey with the reason.
 * New interactions come with their systems; this is the list they join. Pure.
 */
export function personMenu(ctx: Ctx, id: string): PersonMenu | null {
  const { state } = ctx;
  const person = anyCharacter(state, id);
  if (!person) return null;
  const hero = getPlayer(state);
  const items: MenuItem[] = [{ label: 'Open the page', note: '', grey: false, reason: '', action: { type: 'open', id } }];
  if (id !== hero.id && person.deathDay === null) {
    const options = proposalOptions(ctx, id);
    for (const o of options) {
      const suitor = findCharacter(state, o.suitor);
      const target = findCharacter(state, o.target);
      if (!suitor || !target) continue;
      const own = o.suitor === hero.id;
      items.push({
        label: own ? `Propose marriage to ${fullName(target)}` : `Propose a match: ${fullName(suitor)} and ${fullName(target)}`,
        note: 'they decide · the answer comes as an event',
        grey: false,
        reason: '',
        action: { type: 'propose', order: { suitor: o.suitor, target: o.target } },
      });
    }
    if (options.length === 0) {
      items.push({ label: 'Propose marriage', note: '', grey: true, reason: whyNotWed(ctx, hero, person), action: { type: 'open', id } });
    }
  }
  return { id, title: fullName(person), items };
}
