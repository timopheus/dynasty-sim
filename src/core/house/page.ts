import type { EntityPage } from '../pages/entity';
import type { PersonSection } from '../pages/person';
import type { Ctx } from '../state';

/** Section of the page of a person about their house and nickname (4.1 wires it, 4.7 fills it). */
export const houseSection: PersonSection = () => null;

/** The page of a house `h…` (D-311): null until 4.7 fills it; the registry of kinds (4.2) wires it to the prefix. */
export function housePage(_ctx: Ctx, _id: string): EntityPage | null {
  return null;
}
