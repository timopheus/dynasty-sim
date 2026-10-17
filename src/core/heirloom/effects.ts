import { z } from 'zod';
import { fullName, isAlive } from '../character/character';
import { placeholderValues } from '../character/text';
import { grantTrait } from '../character/holding';
import { log } from '../chronicle/log';
import { Id, Int, Text } from '../content/types';
import { findCharacter, newId } from '../helpers';
import { addOpinionReason } from '../relations/opinions';
import type { Character, Ctx, Scope } from '../state';
import { fillTemplate, partsText, type TextPart } from '../text/text';
import { isNear } from '../world/world';
import { heldBy, kindName, livingHeirlooms, passTo, type Heirloom } from './heirloom';
import { heirloomName } from './name';

/**
 * Effect keys of this module (4.9, D-238, D-380), applied to the character of the block. A thing that is not there to
 * act on (none of the kind held, the limit, the role empty) is skipped quietly (D-221). Like every file that feeds
 * effects.ts, this one must not import effects.ts (import cycle).
 * - `heirloom_create: {kind, name}` — the character comes into a new thing; `name` is a template with the roles of the
 *   event and the grammar (`<symbol>`), read once; not made when the house already holds `heirlooms.max`;
 * - `heirloom_give: {to, kind?}` — the oldest thing of the kind (any kind without it) the character holds goes to the
 *   person of the role `to`, who is alive and not the giver;
 * - `heirloom_sell: {money, kind?, reason?, trait?}` — the oldest thing of the kind is sold: the seller gets `money`,
 *   the others of the house who are near hold the opinion `reason` of them, the seller takes the reputation `trait`;
 * - `heirloom_lose: {kind?}` — the oldest thing of the kind is lost for good.
 * Only `to` of `heirloom_give` names another person.
 */
export const heirloomEffectShape = {
  heirloom_create: z.strictObject({ kind: Id, name: Text }).optional(),
  heirloom_give: z.strictObject({ to: Id, kind: Id.optional() }).optional(),
  heirloom_sell: z.strictObject({ money: Int.min(0), kind: Id.optional(), reason: Id.optional(), trait: Id.optional() }).optional(),
  heirloom_lose: z.strictObject({ kind: Id.optional() }).optional(),
};

interface HeirloomEffects {
  heirloom_create?: { kind: string; name: string } | undefined;
  heirloom_give?: { to: string; kind?: string | undefined } | undefined;
  heirloom_sell?: { money: number; kind?: string | undefined; reason?: string | undefined; trait?: string | undefined } | undefined;
  heirloom_lose?: { kind?: string | undefined } | undefined;
}

function values(ctx: Ctx, c: Character, h: Heirloom): Record<string, TextPart> {
  return { ...placeholderValues(c, ctx.state.day), heirloom: { id: h.id, name: h.name }, kind: kindName(ctx.content, h.kind) };
}

export function applyHeirloomEffects(ctx: Ctx, c: Character, effects: HeirloomEffects, scope: Scope): void {
  const { state, content } = ctx;
  const cfg = content.heirlooms;
  if (!cfg) return;
  if (effects.heirloom_create && livingHeirlooms(state).length < cfg.max) {
    const { kind, name } = effects.heirloom_create;
    const id = newId(state, 'i');
    const h: Heirloom = { id, name: heirloomName(ctx, name, scope, state.heirlooms.length), kind, status: 'held', owner: null, made: state.day, origin: '', ended: null, owners: [] };
    state.heirlooms.push(h);
    passTo(state, h, c, fullName(c));
    const parts = fillTemplate(cfg.texts.created, values(ctx, c, h));
    h.origin = partsText(parts);
    log(ctx, { subject: c, kind: 'heirloom', level: 'chronicle', parts });
  }
  const give = effects.heirloom_give;
  if (give) {
    const toId = scope[give.to];
    const to = toId === undefined ? null : findCharacter(state, toId);
    const h = heldBy(state, c, give.kind)[0];
    if (h && to && to.id !== c.id && isAlive(to)) {
      passTo(state, h, to, fullName(to));
      log(ctx, { subject: c, kind: 'heirloom', level: 'chronicle', parts: fillTemplate(cfg.texts.given, { ...values(ctx, c, h), to: { id: to.id, name: fullName(to) } }) });
    }
  }
  const sell = effects.heirloom_sell;
  if (sell) {
    const h = heldBy(state, c, sell.kind)[0];
    if (h) {
      end(state, h, 'sold');
      c.money += sell.money;
      log(ctx, { subject: c, kind: 'heirloom', level: 'chronicle', parts: fillTemplate(cfg.texts.sold, values(ctx, c, h)), money: sell.money });
      if (sell.reason !== undefined && c.house !== null) {
        for (const m of state.characters) {
          if (m.house === c.house && m.id !== c.id && isAlive(m) && (isNear(state, m.id) || isNear(state, c.id))) addOpinionReason(ctx, m.id, c.id, sell.reason);
        }
      }
      if (sell.trait !== undefined) grantTrait(content, c, sell.trait);
    }
  }
  const lose = effects.heirloom_lose;
  if (lose) {
    const h = heldBy(state, c, lose.kind)[0];
    if (h) {
      end(state, h, 'lost');
      log(ctx, { subject: c, kind: 'heirloom', level: 'chronicle', parts: fillTemplate(cfg.texts.lost, values(ctx, c, h)) });
    }
  }
}

/** The thing is out of the house for good: the term of the owner closes. */
function end(state: Ctx['state'], h: Heirloom, status: 'sold' | 'lost'): void {
  const last = h.owners.at(-1);
  if (last && last.to === null) last.to = state.day;
  h.status = status;
  h.owner = null;
  h.ended = state.day;
}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function heirloomEffectRoleRefs(effects: HeirloomEffects): string[] {
  return effects.heirloom_give === undefined ? [] : [effects.heirloom_give.to];
}
