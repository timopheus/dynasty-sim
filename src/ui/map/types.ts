import type { Point } from './model';

/** Map modes, as the buttons by the clock (CK3): realms, terrain, cultures, faiths, and our roads and places. */
export const MAP_MODES = ['realms', 'terrain', 'cultures', 'faiths', 'roads'] as const;
export type MapMode = (typeof MAP_MODES)[number];

/** A place of the game on the map. */
export interface PlaceMark {
  id: string;
  name: string;
  at: Point;
  kind: string;
}

/** What the game puts over the map each frame. */
export interface MapOverlay {
  places: PlaceMark[];
  roads: { a: Point; b: Point; days: number }[];
  hero: Point | null;
  journey: { from: Point; to: Point } | null;
  selected: string | null;
  hovered: string | null;
}

/** What the game tells the map on each draw of the screen (M.1). */
export interface MapProps {
  places: PlaceMark[];
  roads: MapOverlay['roads'];
  hero: Point | null;
  journey: MapOverlay['journey'];
  /** One line about a place for its tip: kind, realm, days away. */
  describe: (id: string) => string;
  /** The travel the hero can make to a place now: the label of the item, or the reason it is grey. */
  travel: (id: string) => { label: string; enabled: boolean; reason: string };
  onOpen: (id: string) => void;
  onTravel: (id: string) => void;
}
