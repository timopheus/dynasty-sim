import { readContentFiles } from '../content-files';
import { loadContent } from '../../src/core/content/load';
import { newGame, apply } from '../../src/core/game';
import { botCommand } from "../../src/core/bot"; import { seedRng } from "../../src/core/rng";
const r = loadContent(readContentFiles());
if (!r.ok) throw new Error('content');
const s = newGame(1, r.content); const rng = seedRng(1, 99);
for (let i = 0; i < 8 && s.backstory.running; i++) { const c = botCommand(s, r.content, rng); if (!c) break; apply(s, r.content, c); }
for (const e of s.chronicle.slice(0, 40)) console.log(e.day, e.kind, e.level, JSON.stringify(e.parts).slice(0, 80));
