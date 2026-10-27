import { findTrait } from '../character/holding';
import type { Content } from '../content/schema';
import type { Character } from '../state';

/**
 * What a deed costs or gives the hero by his nature (D-457, D-460, D-467): a deed the option names in `acts:` goes
 * against the traits that list it under `against` (the price by size, `costs`) and is true to the traits that list it
 * under `favours` (a small gain, `costs.favour`). Pure, no randomness; only the hero, only his traits he has now.
 */
export interface NatureReport {
  /** Traits the deeds go against, with the happiness each costs (a positive number). */
  against: { trait: string; name: string; cost: number }[];
  /** Traits the deeds are true to, with the happiness each gives. */
  by: { trait: string; name: string; gain: number }[];
  /** The net change of happiness the choice brings: gains minus costs. */
  delta: number;
}

/** Report for deeds `acts` of a hero, or null when the deeds touch none of his traits (or the content has no `mind`). */
export function natureOf(content: Content, hero: Character, acts: readonly string[] | undefined): NatureReport | null {
  const mind = content.mind;
  if (!mind || !acts || acts.length === 0) return null;
  const against: NatureReport['against'] = [];
  const by: NatureReport['by'] = [];
  for (const t of mind.traits) {
    if (!hero.traits.includes(t.trait)) continue;
    const name = findTrait(content, t.trait)?.name ?? t.trait;
    for (const rule of t.against ?? []) {
      if (acts.includes(rule.act)) against.push({ trait: t.trait, name, cost: mind.costs[rule.cost] });
    }
    if ((t.favours ?? []).some((a) => acts.includes(a))) by.push({ trait: t.trait, name, gain: mind.costs.favour });
  }
  if (against.length === 0 && by.length === 0) return null;
  const delta = by.reduce((n, b) => n + b.gain, 0) - against.reduce((n, a) => n + a.cost, 0);
  return { against, by, delta };
}

/** The lines of a tooltip about a report: the traits named, the happiness in numbers ("against your nature"). */
export function natureLines(report: NatureReport): string[] {
  const out: string[] = [];
  if (report.against.length > 0) out.push(`Against your nature (${report.against.map((a) => a.name).join(', ')}): happiness −${report.against.reduce((n, a) => n + a.cost, 0)}`);
  if (report.by.length > 0) out.push(`True to your nature (${report.by.map((b) => b.name).join(', ')}): happiness +${report.by.reduce((n, b) => n + b.gain, 0)}`);
  return out;
}

/** Whether the choice of a scene counts: a real choice among at least two options (a single answer is no deed, D-460). */
export function isRealChoice(optionCount: number): boolean {
  return optionCount >= 2;
}
