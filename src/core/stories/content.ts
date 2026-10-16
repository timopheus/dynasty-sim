import type { CrossCheck } from '../content/schema';
import type { ContentError } from '../content/types';
import { walkKeys } from '../conditions/walk';
import type { EventDef } from '../events/content';

interface ScheduleRef {
  event: string;
  roles?: Record<string, string>;
}

interface StoryRef {
  open: string;
  fallback?: string[];
  roles?: Record<string, string>;
}

/** Roles of the event that take a person handed over (`pick: given`), and which of them may stay empty. */
function givenRoles(event: EventDef): { name: string; optional: boolean }[] {
  return Object.entries(event.roles ?? {})
    .filter(([, role]) => role.pick === 'given')
    .map(([name, role]) => ({ name, optional: role.optional === true }));
}

/**
 * Stories have no content key of their own: this check looks at `schedule` and `story` in the effects of actions and
 * events (D-244). Events named must exist; the roles handed over must be `pick: given` roles of the event they go to,
 * and every given role that may not stay empty must be handed over; a fallback must be an event of the same story; an
 * event of a story must have some effect that opens the story.
 */
export const checkStories: CrossCheck = ({ actions, events }) => {
  const errors: ContentError[] = [];
  const byId = new Map(events.map(({ item }) => [item.id, item]));
  const opened = new Set<string>();

  const handed = (file: string, path: string, target: EventDef, roles: Record<string, string> | undefined) => {
    const given = givenRoles(target);
    for (const name of Object.keys(roles ?? {})) {
      if (!given.some((g) => g.name === name)) errors.push({ file, path: `${path}.roles.${name}`, message: `event "${target.id}" has no role "${name}" with pick: given` });
    }
    for (const g of given) {
      if (!g.optional && !Object.hasOwn(roles ?? {}, g.name)) errors.push({ file, path, message: `role "${g.name}" of event "${target.id}" is not handed over` });
    }
  };

  const visit = (file: string, item: unknown, at: string) => {
    walkKeys(item, at, ['schedule', 'story'], (value, path) => {
      if (path.endsWith('.schedule') && Array.isArray(value)) {
        (value as ScheduleRef[]).forEach((entry, i) => {
          const target = byId.get(entry.event);
          if (!target) errors.push({ file, path: `${path}[${i}].event`, message: `unknown event "${entry.event}"` });
          else handed(file, `${path}[${i}]`, target, entry.roles);
        });
      }
      // `story` of an event is the story it belongs to (a string); the effect `story` is an object.
      if (path.endsWith('.story') && value !== null && typeof value === 'object') {
        const story = value as StoryRef;
        opened.add(story.open);
        (story.fallback ?? []).forEach((id, i) => {
          const target = byId.get(id);
          const fpath = `${path}.fallback[${i}]`;
          if (!target) errors.push({ file, path: fpath, message: `unknown event "${id}"` });
          else if (target.story !== story.open) errors.push({ file, path: fpath, message: `fallback "${id}" is not an event of story "${story.open}" (it needs story: ${story.open})` });
        });
        if (story.fallback?.length) {
          // A role handed over must be a given role of some fallback; each fallback must get its own given roles.
          const targets = story.fallback.flatMap((id) => (byId.get(id)?.story === story.open ? [byId.get(id) as EventDef] : []));
          for (const name of Object.keys(story.roles ?? {})) {
            if (targets.length > 0 && !targets.some((t) => givenRoles(t).some((g) => g.name === name))) {
              errors.push({ file, path: `${path}.roles.${name}`, message: `no fallback of story "${story.open}" has a role "${name}" with pick: given` });
            }
          }
          story.fallback.forEach((id, i) => {
            const target = byId.get(id);
            if (target?.story !== story.open) return;
            for (const g of givenRoles(target)) {
              if (!g.optional && !Object.hasOwn(story.roles ?? {}, g.name)) errors.push({ file, path: `${path}.fallback[${i}]`, message: `role "${g.name}" of event "${id}" is not handed over by the story` });
            }
          });
        }
      }
    });
  };

  for (const { file, index, item } of actions) visit(file, item, `actions[${index}]`);
  for (const { file, index, item } of events) visit(file, { ...item, story: undefined }, `events[${index}]`);
  for (const { file, index, item } of events) {
    if (item.story !== undefined && !opened.has(item.story)) errors.push({ file, path: `events[${index}].story`, message: `no effect opens story "${item.story}"` });
  }
  return errors;
};
