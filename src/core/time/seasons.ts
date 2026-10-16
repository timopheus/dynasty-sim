import type { Content } from '../content/schema';
import { toYmd } from './calendar';
import type { SeasonDef, TimeContent } from './content';

/** The `time` content; a cross-check makes sure it exists, so a missing one is a programming error. */
export function timeContent(content: Content): TimeContent {
  if (!content.time) throw new Error('Content has no time section');
  return content.time;
}

export function seasonAt(content: Content, day: number): SeasonDef {
  const { month } = toYmd(day);
  const found = timeContent(content).seasons.find((s) => s.months.includes(month));
  if (!found) throw new Error(`No season for month ${month}`);
  return found;
}
