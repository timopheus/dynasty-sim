/**
 * The news by the clock (D-464, as the short messages of CK3): what came of a choice that earned no window, and the end
 * of an ordinary action. The newest few stay a while and fade; time never stops for them. S.14 adds letters here.
 */
export interface NewsItem {
  /** Day of the game the word was written. */
  day: number;
  text: string;
}

/** At most this many words show at once. */
export const NEWS_MAX = 3;
/** A word goes after this many days of the game. */
export const NEWS_DAYS = 45;

/** The list with a new word on it: the newest last, the old beyond `NEWS_MAX` dropped. */
export function pushNews(list: readonly NewsItem[], item: NewsItem): NewsItem[] {
  return [...list, item].slice(-NEWS_MAX);
}

export interface NewsRow {
  text: string;
  /** 0 is the newest; the screen fades the rows by it. */
  age: number;
}

/** The words to show on `today`, the newest first; the ones older than `NEWS_DAYS` have gone. */
export function visibleNews(list: readonly NewsItem[], today: number): NewsRow[] {
  return list
    .filter((n) => today - n.day <= NEWS_DAYS)
    .slice(-NEWS_MAX)
    .reverse()
    .map((n, age) => ({ text: n.text, age }));
}
