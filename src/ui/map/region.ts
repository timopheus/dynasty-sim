import raw from './region-map.json?raw';
import type { MapFile, MapModel } from './model';
import { buildModel } from './model';

let model: MapModel | null = null;

/** The map of the region (M.1), parsed on first use. */
export function regionModel(): MapModel {
  if (!model) model = buildModel(JSON.parse(raw) as MapFile);
  return model;
}
