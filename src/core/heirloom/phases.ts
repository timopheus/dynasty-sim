import { fullName, isAlive } from '../character/character';
import { placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { findCharacter } from '../helpers';
import { addOpinionReason } from '../relations/opinions';
import type { SuccessionHook } from '../state';
import { fillTemplate } from '../text/text';
import { kindName, livingHeirlooms, passTo } from './heirloom';

/**
 * 4.9: heirlooms pass by the will, otherwise to the main heir (D-238, D-381). Reads `executedWill`, which `succeed`
 * leaves for the hooks (D-360). A thing the dead head held, or one whose owner died earlier, goes to the receiver the
 * will names for it if they live, else to the heir; things of the living stay. Never imports lifecycle.ts (import cycle).
 */
export const heirloomOnSuccession: SuccessionHook = (ctx, deceased, heir) => {
  const { state, content } = ctx;
  const cfg = content.heirlooms;
  if (!cfg) return;
  const will = state.executedWill;
  for (const h of livingHeirlooms(state)) {
    const owner = h.owner === null ? null : findCharacter(state, h.owner);
    if (h.owner !== deceased.id && owner && isAlive(owner)) continue;
    const named = will?.items.find((i) => i.item === h.id);
    const receiver = named ? findCharacter(state, named.to) : null;
    const bequeathed = receiver !== null && isAlive(receiver) && receiver.id !== deceased.id;
    const to = bequeathed ? receiver : heir;
    passTo(state, h, to, fullName(to));
    const parts = fillTemplate(bequeathed ? cfg.texts.bequeathed : cfg.texts.inherited, {
      ...placeholderValues(to, state.day),
      heirloom: { id: h.id, name: h.name },
      kind: kindName(content, h.kind),
      deceased: { id: deceased.id, name: fullName(deceased) },
    });
    log(ctx, { subject: to, kind: 'heirloom', level: 'chronicle', parts });
    // the new head is slighted by a will that put someone else before them
    if (bequeathed && to.id !== heir.id && cfg.bequestReason !== undefined) addOpinionReason(ctx, heir.id, to.id, cfg.bequestReason);
  }
};
