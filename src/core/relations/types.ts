/** Data of the relations module (2.4): plain JSON, kept only for the hero and the people around them (D-063). */

/** One cause of an opinion: `holder` thinks of `target` what the reason says, counted from `day` (D-035). */
export interface OpinionReason {
  reason: string;
  holder: string;
  target: string;
  day: number;
  /** Value when fresh; the reason's own value unless the event gave another. */
  value: number;
  /** Day the reason was taken away by an event; null while it counts. */
  end: number | null;
}

/** A tie created and broken by events, never by an opinion threshold (D-036). Ended ones are kept. */
export interface Relation {
  id: string;
  kind: string;
  /** The patron in a patron-protege pair; no order for symmetric kinds. */
  a: string;
  b: string;
  start: number;
  end: number | null;
  /** Why it ended: an id from the event, or `death`. Null while active. */
  endReason: string | null;
}

export type AcquaintanceLevel = 'known' | 'close';

/** How well a hero knows someone; absence means not acquainted (D-037). */
export interface Acquaintance {
  holder: string;
  other: string;
  level: AcquaintanceLevel;
  since: number;
  /** Day the level became `close`; null while only known. */
  closeSince: number | null;
}

/** Something about a person that not everyone knows (GDD 8.8). */
export interface Secret {
  id: string;
  about: string;
  kind: string;
  day: number;
  knownBy: string[];
}
