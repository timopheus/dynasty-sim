import type { Effects } from '../effects';

/**
 * Effects that change the hero (D-174): the block `on.hero`, `relation … with: hero`, `hero` in `secret.known_by`,
 * `reveal.to` and the roles of `schedule` and `story`, and `introduce` — nested `later` included. The hero's feelings
 * (`opinion`, `opinion_end` toward the hero) are not among them: they change the person of the world, not the hero.
 * A pure walk over the keys; it must not import effects.ts values (import cycle with the schema).
 */
type Loose = Record<string, unknown>;

const isHero = (role: unknown): boolean => role === 'hero';
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);

/** Roles named by a `schedule` entry or a `story` block (3.8): its `roles` map and its `protagonist`. */
function storyRoles(entry: Loose): unknown[] {
  const roles = entry.roles;
  const mapped = roles !== null && typeof roles === 'object' ? Object.values(roles as Loose) : [];
  return [...mapped, entry.protagonist];
}

/** Keys of one effects block that change the hero, as short names for validator messages. */
export function heroEffectProblems(effects: Effects): string[] {
  const e = effects as Loose;
  const out: string[] = [];
  if (asList(e.relation).some((r) => isHero(r.with))) out.push('relation with the hero');
  const secret = e.secret as Loose | undefined;
  if (secret && Array.isArray(secret.known_by) && secret.known_by.some(isHero)) out.push('the hero in secret.known_by');
  const reveal = e.reveal as Loose | undefined;
  if (reveal && Array.isArray(reveal.to) && reveal.to.some(isHero)) out.push('the hero in reveal.to');
  if (e.introduce !== undefined) out.push('introduce');
  if (asList(e.schedule).some((s) => storyRoles(s).some(isHero))) out.push('the hero in schedule.roles');
  const story = e.story as Loose | undefined;
  if (story && storyRoles(story).some(isHero)) out.push('the hero in story.roles');
  for (const entry of asList(e.later)) out.push(...heroEffectProblems(entry.effects as Effects));
  return out;
}

/**
 * The effects without the keys that change the hero (D-174), for an event of `who: both` that fell to a person of the
 * world. Conditions on the hero and `opinion toward: hero` stay: the hero is still in the scope. Returns a copy.
 */
export function withoutHeroEffects(effects: Effects): Effects {
  const e: Loose = { ...(effects as Loose) };
  if (asList(e.relation).length > 0) {
    const kept = asList(e.relation).filter((r) => !isHero(r.with));
    if (kept.length > 0) e.relation = kept;
    else delete e.relation;
  }
  const secret = e.secret as Loose | undefined;
  if (secret && Array.isArray(secret.known_by)) e.secret = { ...secret, known_by: secret.known_by.filter((r) => !isHero(r)) };
  const reveal = e.reveal as Loose | undefined;
  if (reveal && Array.isArray(reveal.to)) {
    const to = reveal.to.filter((r) => !isHero(r));
    if (to.length > 0) e.reveal = { ...reveal, to };
    else delete e.reveal;
  }
  delete e.introduce;
  if (Array.isArray(e.schedule)) {
    const kept = asList(e.schedule).filter((s) => !storyRoles(s).some(isHero));
    if (kept.length > 0) e.schedule = kept;
    else delete e.schedule;
  }
  const story = e.story as Loose | undefined;
  if (story && storyRoles(story).some(isHero)) delete e.story;
  if (Array.isArray(e.later)) {
    e.later = asList(e.later).map((entry) => ({ ...entry, effects: withoutHeroEffects(entry.effects as Effects) }));
  }
  return e as Effects;
}

/** Block `on.<role>` of an outcome as it applies to a person of the world: nothing for `hero`. */
export function onForNpc(on: Record<string, Effects> | undefined): [string, Effects][] {
  return Object.entries(on ?? {}).flatMap(([role, effects]): [string, Effects][] => (isHero(role) ? [] : [[role, withoutHeroEffects(effects)]]));
}
