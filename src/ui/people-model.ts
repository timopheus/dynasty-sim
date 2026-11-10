import { anyCharacter } from '../core/archive/archive';
import { fullName } from '../core/character/character';
import { marriageBar } from '../core/family/marriage';
import { proposalOptions } from '../core/family/proposals';
import type { ProposeOrder } from '../core/family/phases';
import { findCharacter, getPlayer } from '../core/helpers';
import { acquaintanceLevel } from '../core/relations/acquaintance';
import { phrase } from '../core/lang/phrases';
import { findReason, opinionCauses, opinionValue, opinionWord } from '../core/relations/opinions';
import type { Character, Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';
import { isNear } from '../core/world/world';
import { conceptName } from './concepts';
import { signedRow, type MouseHint, type Tip, type TipRow } from './tips';
import { ageText, localName, tr, trSex } from './i18n';

const STRANGER = 'A stranger to you';

/** Who a person is to the hero, in words: "Your father", "A close acquaintance". Only what the hero may know (D-037). */
export function kinship(ctx: Ctx, id: string): string {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  if (id === hero.id) return tr('You');
  const c = anyCharacter(state, id);
  if (!c) return tr('Nobody known');
  const word = (m: string, f: string) => (c.sex === 'male' ? m : f);
  if (hero.father === id || hero.mother === id) return word(tr('Your father'), tr('Your mother'));
  if (c.father === hero.id || c.mother === hero.id) return word(tr('Your son'), tr('Your daughter'));
  if (hero.spouse === id) return word(tr('Your husband'), tr('Your wife'));
  const shares = (hero.father !== null && c.father === hero.father) || (hero.mother !== null && c.mother === hero.mother);
  if (shares) return word(tr('Your brother'), tr('Your sister'));
  const level = acquaintanceLevel(state, content, hero.id, id);
  return trSex(level === 'close' ? 'A close acquaintance' : level === 'known' ? 'An acquaintance' : STRANGER, c.sex);
}

/** The opinion of a person of the hero as a line of the tip: in words, and with the numbers only for a close acquaintance (D-037). */
function opinionRow(ctx: Ctx, c: Character): TipRow | null {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  if (!content.opinions || c.id === hero.id || c.deathDay !== null) return null;
  const level = acquaintanceLevel(state, content, hero.id, c.id);
  if (level === null) return null;
  if (!isNear(state, c.id) && !state.opinionReasons.some((r) => r.holder === c.id && r.target === hero.id)) return null;
  const value = opinionValue(ctx, c.id, hero.id);
  const word = opinionWord(content, value);
  const label = tr('[[opinion]] of you');
  const tone = value > 0 ? 'good' : value < 0 ? 'bad' : 'zero';
  if (level !== 'close') return { label, value: word, tone };
  // the reasons of the opinion are a tip inside the tip: each with its number (D-434)
  const rows: TipRow[] = opinionCauses(ctx, c.id, hero.id).map((cause) => {
    const name = cause.id === 'background' ? phrase(content, 'Their own temper and yours') : cause.id === 'relation' ? phrase(content, 'The ties between you') : (findReason(content, cause.id)?.name ?? cause.id);
    return signedRow(name, cause.value);
  });
  const sum = value < 0 ? `−${-value}` : `+${value}`;
  const inner: Tip = { title: `${conceptName('opinion')}: ${sum}`, text: '', rows, total: { label: tr('Total'), value: sum, tone } };
  return { label, value: `${word} (${sum})`, tone, tip: inner };
}

/**
 * Tooltip of a name anywhere on the screen (D-477): the full name, who it is to the hero and the age as the crumb, the
 * opinion of the person with its reasons one tip deeper, and what the mouse does. A person opens a page on a left click
 * and the menu of actions on a right one; a house opens a page only, and its name says it all.
 */
export function personTip(ctx: Ctx, id: string): Tip | null {
  const c = anyCharacter(ctx.state, id);
  if (!c) return null;
  const who = kinship(ctx, id);
  const known = who !== trSex(STRANGER, c.sex);
  const age = known ? `, ${c.deathDay === null ? ageText(ageYears(c.birthDay, ctx.state.day)) : tr('dead')}` : c.deathDay !== null ? `, ${tr('dead')}` : '';
  const opinion = opinionRow(ctx, c);
  const mouse: MouseHint[] = [{ button: 'left', text: tr('Open the page') }];
  mouse.push({ button: 'right', text: tr('Actions') });
  return { title: localName(fullName(c)), crumb: `${who}${age}`, text: '', ...(opinion ? { rows: [opinion] } : {}), mouse };
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
// the words of the bars go through tr() when shown, not here: the language is chosen after this module loads

function whyNotWed(ctx: Ctx, hero: Character, person: Character): string {
  const bar = marriageBar(ctx, hero, person);
  if (bar !== null) return tr(BARS[bar] ?? 'not possible');
  if (ctx.state.status !== 'awaiting_action' && ctx.state.status !== 'running') return tr('not now');
  return isNear(ctx.state, person.id) ? tr('not possible now') : tr('not near you');
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
  const items: MenuItem[] = [{ label: tr('Open the page'), note: '', grey: false, reason: '', action: { type: 'open', id } }];
  if (id !== hero.id && person.deathDay === null) {
    const options = proposalOptions(ctx, id);
    for (const o of options) {
      const suitor = findCharacter(state, o.suitor);
      const target = findCharacter(state, o.target);
      if (!suitor || !target) continue;
      const own = o.suitor === hero.id;
      items.push({
        label: own ? tr('Propose marriage to {name}', { name: localName(fullName(target), 'dat') }) : tr('Propose a match: {a} and {b}', { a: localName(fullName(suitor)), b: localName(fullName(target)) }),
        note: tr('they decide · the answer comes as an event'),
        grey: false,
        reason: '',
        action: { type: 'propose', order: { suitor: o.suitor, target: o.target } },
      });
    }
    if (options.length === 0) {
      items.push({ label: tr('Propose marriage'), note: '', grey: true, reason: whyNotWed(ctx, hero, person), action: { type: 'open', id } });
    }
  }
  return { id, title: localName(fullName(person)), items };
}
