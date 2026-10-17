import { fullName } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { findCharacter } from '../helpers';
import { heirOf } from '../succession/law';
import type { Character, Ctx } from '../state';
import { fillTemplate } from '../text/text';
import { isNear } from '../world/world';
import { activeRelationBetween, startRelation } from './links';
import { addOpinionReason, findReason, reasonValue } from './opinions';
import type { Acquaintance } from './types';

/**
 * What passes to the heir with the head (4.8, GDD §3, §8.6): the knowledge of people, enmity and debts of honour, the feud.
 * Knowledge is copied when the head dies, while it is known who was near (the heir leaves the circle and the household
 * when they take over, `succeed`); the rest after the heir has taken over (`relationsOnSuccession`).
 */

const alive = (c: Character | null): c is Character => c !== null && c.deathDay === null;

/** Whether the heir knew the head's world: a child or the spouse, or someone of the household or the circle on the day of death. */
function knewTheHead(ctx: Ctx, deceased: Character, heir: Character): boolean {
  return heir.father === deceased.id || heir.mother === deceased.id || deceased.spouse === heir.id || isNear(ctx.state, heir.id);
}

/**
 * The head's acquaintances pass to the heir a step lower: a close one becomes known, a known one is not known any more.
 * Never worse than what the heir knew already. Called when the hero dies, before the heir takes over.
 */
export function inheritKnowledge(ctx: Ctx, deceased: Character): void {
  const { state } = ctx;
  const found = heirOf(state, deceased.id);
  if (!found || !knewTheHead(ctx, deceased, found.heir)) return;
  const heir = found.heir;
  const rows = state.acquaintances.filter((a) => a.holder === deceased.id && a.level === 'close' && a.other !== heir.id);
  for (const row of rows) {
    if (!alive(findCharacter(state, row.other))) continue;
    if (state.acquaintances.some((a) => a.holder === heir.id && a.other === row.other)) continue;
    const entry: Acquaintance = { holder: heir.id, other: row.other, level: 'known', since: state.day, closeSince: null };
    state.acquaintances.push(entry);
  }
}

/**
 * Enmity and debts pass to the heir (D-035): whoever holds against the dead head a reason with `inherits_as` that still
 * counts holds the weaker reason against the heir. A rival of the head who holds such a reason becomes a rival of the heir,
 * with the line "Heir to the feud".
 */
export function inheritEnmity(ctx: Ctx, deceased: Character, heir: Character): void {
  const { state, content } = ctx;
  const opinions = content.opinions;
  if (!opinions) return;
  const holders = new Set<string>();
  const pass: { holder: string; reason: string }[] = [];
  for (const r of state.opinionReasons) {
    if (r.target !== deceased.id || r.end !== null || r.holder === heir.id) continue;
    const def = findReason(content, r.reason);
    const holder = findCharacter(state, r.holder);
    if (!def?.inherits_as || !alive(holder)) continue;
    if (reasonValue(opinions, r, holder, state.day) === 0) continue;
    holders.add(holder.id);
    pass.push({ holder: holder.id, reason: def.inherits_as });
  }
  for (const p of pass) addOpinionReason(ctx, p.holder, heir.id, p.reason);
  const feud = opinions.inheritance;
  if (!feud) return;
  for (const rel of [...state.relations]) {
    if (rel.kind !== feud.feudRelation || rel.end !== state.day || rel.endReason !== 'death') continue;
    const otherId = rel.a === deceased.id ? rel.b : rel.b === deceased.id ? rel.a : null;
    const other = otherId === null ? null : findCharacter(state, otherId);
    if (!alive(other) || other.id === heir.id || !holders.has(other.id) || activeRelationBetween(state, heir.id, other.id, feud.feudRelation)) continue;
    startRelation(ctx, feud.feudRelation, heir.id, other.id);
    const parts = fillTemplate(feud.feudText, {
      ...placeholderValues(heir, state.day),
      other: { id: other.id, name: fullName(other) },
      deceased: { id: deceased.id, name: fullName(deceased) },
    });
    log(ctx, { subject: heir, kind: 'feud_inherited', level: 'chronicle', parts });
  }
}
