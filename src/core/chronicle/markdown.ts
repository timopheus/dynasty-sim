import { fullName, type CharacterBase } from '../character/character';
import type { GameState } from '../state';
import type { TextPart } from '../text/text';
import { ageYears, formatDate, toYmd } from '../time/calendar';
import type { ChronicleEntry } from './log';

function lifespan(c: CharacterBase): string {
  const born = toYmd(c.birthDay).year;
  return c.deathDay === null ? `b. ${born}` : `${born}–${toYmd(c.deathDay).year}`;
}

function shortMonth(day: number): string {
  return formatDate(day).split(' ')[1]?.slice(0, 3) ?? '';
}

interface Section {
  head: CharacterBase;
  entries: ChronicleEntry[];
}

/** One section per head of the house: from the "start" or "succession" line to the next one (D-019). */
function sections(state: GameState, keep: (e: ChronicleEntry) => boolean): Section[] {
  const byId = new Map(state.characters.map((c) => [c.id, c]));
  const out: Section[] = [];
  for (const e of state.chronicle) {
    if (e.kind === 'start' || e.kind === 'succession') {
      const head = byId.get(e.subject);
      if (head && !out.some((s) => s.head.id === head.id)) out.push({ head, entries: [] });
    }
    if (out.length > 0 && keep(e)) out.at(-1)?.entries.push(e);
  }
  return out;
}

function anchor(id: string): string {
  return id;
}

function renderText(parts: readonly TextPart[], own: string, heads: ReadonlySet<string>): string {
  return parts
    .map((p) => {
      if (typeof p === 'string') return p;
      return p.id !== own && heads.has(p.id) ? `[${p.name}](#${anchor(p.id)})` : p.name;
    })
    .join('');
}

function render(state: GameState, title: string, keep: (e: ChronicleEntry) => boolean, dated: boolean): string {
  const founder = state.characters[0];
  const house = founder ? founder.surname : 'Unknown';
  const lines: string[] = [`# ${title} of the House of ${house}`, '', `Seed ${state.seed} · ${formatDate(0)} – ${formatDate(state.day)}`];
  const secs = sections(state, keep);
  const heads = new Set(secs.map((s) => s.head.id));
  for (const { head, entries } of secs) {
    lines.push('', `<a id="${anchor(head.id)}"></a>`, `## ${fullName(head)} (${lifespan(head)})`);
    let year = Number.NaN;
    for (const e of entries) {
      const y = toYmd(e.day).year;
      if (y !== year) {
        year = y;
        lines.push('', `### ${y} · ${ageYears(head.birthDay, e.day)}`, '');
      }
      const when = dated ? formatDate(e.day).replace(/ \d+$/, '') : shortMonth(e.day);
      const world = e.subject !== head.id && e.level === 'chronicle' ? '◆ ' : '';
      lines.push(`- ${world}**${when}** — ${renderText(e.parts, head.id, heads)}${e.mark ? ' ▸' : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Chronicle as Markdown (D-019): sections only for heads of the house, "year · age", months,
 * links to other heads, ◆ for the deaths of known people of the circle, ▸ for marked choices.
 */
export function chronicleMarkdown(state: GameState): string {
  return render(state, 'Chronicle', (e) => e.level === 'chronicle', false);
}

/** Journal: every stored line, the everyday detail the chronicle leaves out, with days. */
export function journalMarkdown(state: GameState): string {
  return render(state, 'Journal', () => true, true);
}
