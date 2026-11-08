import type { Point } from './model';

/**
 * Map modes, as the buttons by the map (CK3): realms, terrain, peoples, and our roads and places. No faiths yet: the
 * game has none, and the names the map generator gave its religions are not of our world.
 */
export const MAP_MODES = ['realms', 'terrain', 'cultures', 'roads'] as const;
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
  /** The roads of the game, each along the map's routes (`path`, from `a` to `b`). */
  roads: { a: Point; b: Point; days: number; path: Point[] }[];
  hero: Point | null;
  /** The way still ahead: from the hero along the roads to the place the journey leads to. */
  journey: { path: Point[] } | null;
  selected: string | null;
  hovered: string | null;
  /** The names of the map's peoples (by culture id) as the game calls them, where a place of the game tells. */
  peoples: Map<number, string>;
}

/** What the game tells the map on each draw of the screen (M.1). */
export interface MapProps {
  places: PlaceMark[];
  roads: MapOverlay['roads'];
  hero: Point | null;
  journey: MapOverlay['journey'];
  peoples: MapOverlay['peoples'];
  /** One line about a place for its tip: kind, realm, days away. */
  describe: (id: string) => string;
  /** The travel the hero can make to a place now: the label of the item, its price, or the reason it is grey. */
  travel: (id: string) => { label: string; note: string; enabled: boolean; reason: string };
  onOpen: (id: string) => void;
  onTravel: (id: string) => void;
}
