import { formatDate, toYmd } from './calendar';
import { fullName, type Character } from './character';
import type { GameState } from './game';

function lifespan(c: Character): string {
  const born = toYmd(c.birthDay).year;
  return c.deathDay === null ? `b. ${born}` : `${born}–${toYmd(c.deathDay).year}`;
}

/** Chronicle as Markdown: one section per head of the house, entries by date. */
export function chronicleMarkdown(state: GameState): string {
  const founder = state.characters[0];
  const house = founder ? founder.surname : 'Unknown';
  const lines: string[] = [
    `# Chronicle of the House of ${house}`,
    '',
    `Seed ${state.seed} · ${formatDate(0)} – ${formatDate(state.day)}`,
  ];
  for (const c of state.characters) {
    const entries = state.chronicle.filter((e) => e.characterId === c.id);
    if (entries.length === 0) continue;
    lines.push('', `## ${fullName(c)} (${lifespan(c)})`, '');
    for (const e of entries) lines.push(`- ${formatDate(e.day)} — ${e.text}`);
  }
  return `${lines.join('\n')}\n`;
}
