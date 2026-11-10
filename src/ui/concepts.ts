import { tr } from './i18n';
import type { Tip } from './tips';

/**
 * The dictionary of concepts (TT.1, D-477): the words of the game that a tip explains in a tip of their own, as the blue
 * words of CK3. Data of the interface: the tips of the interface set links to them in their lines with `[[id]]`, or
 * `[[id|word]]` when the word stands in another form. Each text is a call of `tr()`, so the language is chosen at the
 * moment of use, and a test checks every key.
 */
export interface Concept {
  id: string;
  name: string;
  text: string;
  /** The concept this one is a part of: shown as the crumb of its tip. */
  parent?: string;
}

function defs(): Concept[] {
  return [
    { id: 'diplomacy', name: tr('Diplomacy'), text: tr('Winning people over: talks, matches, favours. It raises the [[opinion]] of those you speak with.') },
    { id: 'martial', name: tr('Martial'), text: tr('Leading men in a fight and in the field.') },
    { id: 'stewardship', name: tr('Stewardship'), text: tr('Managing money and land. It raises the income of work and lowers the upkeep of the house.') },
    { id: 'intrigue', name: tr('Intrigue'), text: tr('Schemes, secrets and cunning.') },
    { id: 'learning', name: tr('Learning'), text: tr('Book learning, medicine and the law.') },
    { id: 'prowess', name: tr('Prowess'), text: tr('Personal strength with a weapon; it fades with age.') },
    { id: 'fame', name: tr('Fame'), text: tr('How far your name has travelled. It opens doors and draws eyes. People of high standing know a famous name before they meet it.') },
    { id: 'house-renown', name: tr('House renown'), text: tr('How well the house is known, beyond the fame of its head. It grows with the deeds of the family and is inherited by the next head.') },
    { id: 'house-status', name: tr('House status'), text: tr('Where the house stands among the families of the land. It sets what the house must spend to keep its name, and who treats it as an equal.') },
    { id: 'happiness', name: tr('Happiness'), text: tr('Deeds against your nature, losses and poverty lower it; deeds true to it and good news raise it. With time it drifts back to where it began; at the bottom you [[breakdown|break]].') },
    { id: 'breakdown', name: tr('Breakdown'), text: tr('At the bottom of [[happiness]] a person breaks: the hero falls into a bad spell and cannot act as usual.'), parent: 'happiness' },
    { id: 'opinion', name: tr('Opinion'), text: tr('What a person thinks of you, from the past between you: a kind word, a wrong, kinship. There is no single measure of how the world sees you: each person has their own opinion, and the house has its [[house-renown|renown]].') },
    { id: 'trait', name: tr('Trait'), text: tr('A lasting quality of a person: it changes stats, opens or closes choices, and stands in their way of life.') },
    { id: 'character-trait', name: tr('A trait of character'), text: tr('A trait of the nature of a person. A deed against it costs [[happiness]]; a deed true to it brings some.'), parent: 'trait' },
    { id: 'education', name: tr('Education'), text: tr('What a young person was taught. It gives a bonus to one stat for life.'), parent: 'trait' },
    { id: 'health', name: tr('Health'), text: tr('The state of the body, made of illnesses, wounds, age and traits. At the bottom of it death comes.') },
    { id: 'heir', name: tr('Heir'), text: tr('Who takes up the house when the head dies, by law or by [[will]]. After your death you go on as the heir.') },
    { id: 'will', name: tr('Will'), text: tr('The head of the house may name who inherits. Without a will the law of the land decides.'), parent: 'heir' },
    { id: 'guardian', name: tr('Guardian'), text: tr('Someone who raises an heir who is under age and covers what the child cannot.') },
    { id: 'circle', name: tr('Circle'), text: tr('The people around you: family, friends and those you meet often. The news of the chronicle is about them.') },
    { id: 'contract', name: tr('Contract'), text: tr('A job taken on the board of a place: it has a pay, a [[risk]] and an [[employer]] who owes you for it.') },
    { id: 'employer', name: tr('Employer'), text: tr('The one who offers a [[contract]] and pays for it.'), parent: 'contract' },
    { id: 'favour', name: tr('Favour'), text: tr('A debt of gratitude: someone who owes you a favour will take your side later. A contract well done leaves one.'), parent: 'contract' },
    { id: 'risk', name: tr('Risk'), text: tr('What can go wrong in a job or a choice, and what it would cost.'), parent: 'contract' },
    { id: 'road', name: tr('Road and days'), text: tr('Places are joined by roads; the days of the way are counted by the road, not by the straight line. The hero walks one day at a time.') },
  ];
}

const byId = (id: string): Concept | undefined => defs().find((c) => c.id === id);

/** All concepts, in the language chosen. */
export function allConcepts(): Concept[] {
  return defs();
}

/** The name of a concept; its id for an unknown one, so a wrong link shows. */
export function conceptName(id: string): string {
  return byId(id)?.name ?? id;
}

/** The tip of a concept: its name, the crumb «Concept» or the parent, the text with its own links. */
export function conceptTip(id: string): Tip | null {
  const c = byId(id);
  if (!c) return null;
  return { title: c.name, crumb: c.parent ? conceptName(c.parent) : tr('Concept'), text: c.text };
}
