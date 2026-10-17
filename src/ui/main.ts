import { allChronicle } from '../core/archive/archive';
import { entryText, type ChronicleEntry } from '../core/chronicle/log';
import { loadContent } from '../core/content/load';
import type { Content } from '../core/content/schema';
import { newGame, type Command } from '../core/game';
import { contentVersion } from '../core/save/content-version';
import { applyRecorded, newJournal, type Journal } from '../core/save/journal';
import { isValidSeed } from '../core/rng';
import type { GameState } from '../core/state';
import { formatDate } from '../core/time/calendar';
import { getPlayer } from '../core/helpers';
import { entityPage } from '../core/pages/entity';
import { eventView } from '../core/events/view';
import { DEFAULT_MOOD } from '../core/events/content';
import { faceSpec } from '../core/looks';
import { portraitCanvas } from './portrait/canvas';
import { heroView } from './hero';
import { heirLine, willCommandOf, willForm, type PersonChoice, type WillForm } from './will';
import { entityIdFromHash, personHref } from './address';
import { actionRows, eventScreen } from './event';
import { actionControl, eventPageKey, chronicleAnnouncement, eventAnnouncement, numbersToggle, optionControl, pickableAt, shortcutPosition, withNumber, type Control } from './access';
import { headIds } from './entry';
import { entryItem, partNodes, pageView } from './page';
import { dropOldSave, loadGame, openIndexedDb, saveGame, seedFromSearch, startChoice, startGame, type AsyncStore, type Saved, type SaveOutcome } from './storage';
import './style.css';

const CHRONICLE_LIMIT = 60;

const raw = import.meta.glob<string>('/content/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true });
const files = Object.keys(raw)
  .sort()
  .map((path) => ({ path: path.replace(/^\//, ''), text: raw[path] ?? '' }));

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** Seed from ?seed=N, otherwise a random one (the UI may use host randomness; the core may not). */
function pickSeed(): number {
  return seedFromSearch(location.search, isValidSeed) ?? (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
}

/** IndexedDB, or null where it is missing or refused (privacy modes, blocked storage). Asks to keep it (D-234). */
async function browserStore(): Promise<AsyncStore | null> {
  try {
    const store = await openIndexedDb(window.indexedDB);
    // Not awaited: the answer does not change how the game saves, only whether the browser may clear it.
    navigator.storage?.persist?.().catch(() => false);
    return store;
  } catch {
    return null;
  }
}

/** The old autosave cell of `localStorage` (D-140) goes away. */
function dropLocalStorageSave(): void {
  try {
    dropOldSave(window.localStorage);
  } catch {
    // localStorage itself may throw in privacy modes.
  }
}

type Tab = 'chronicle' | 'journal';

interface Session {
  state: GameState;
  content: Content;
  /** contentVersion() of the files the game runs on (D-202). */
  contentVersion: string;
  store: AsyncStore | null;
  /** Journal of commands of this game (D-202) and how much of it and of the archive the store holds. */
  journal: Journal;
  saved: Saved;
  /** A command is being applied and saved: the next waits for the write (D-234). */
  busy: boolean;
  /** A journal to offer for download: of the game that could not be continued (D-202). */
  lostJournal: Journal | null;
  /** Shown above the hero: why a game was discarded, or that saving failed. */
  notice: string | null;
  saveProblem: string | null;
  tab: Tab;
  /** Numbers beside words (stats, chances, opinions): a switch instead of hover texts (D-248). */
  showNumbers: boolean;
  /** Announced text of the last event page, so the live region speaks a page once. */
  announcedEvent: string;
  /** What a digit key does on the screen now: position → command, null for grey choices. */
  keymap: (Command | null)[];
  /** Move focus to the new event / action list after a command (not on the first render). */
  focusAfterRender: boolean;
  /** Lines for the live region, spoken together at the end of the next render. */
  queue: string[];
  /** `data-focus` key of the control to focus again after a render that replaced it (switch, tabs). */
  refocus: string | null;
  /** The will screen is open in place of the list of actions (4.6). */
  willOpen: boolean;
}

function saveProblemText(outcome: SaveOutcome): string | null {
  if (outcome.ok) return null;
  if (outcome.reason === 'conflict') return 'This game was saved from another tab, so this tab no longer saves. Reload to continue from the latest save.';
  return outcome.reason === 'quota'
    ? 'Autosave failed: browser storage is full. The game goes on, but progress since the last successful save will be lost if you reload. Starting a new game frees the space.'
    : 'Autosave is not available in this browser. The game goes on, but it will not survive a reload.';
}

/** Offers a journal of commands as a file (D-202): to send with a report or to replay (`npm run replay`). */
function downloadJournal(journal: Journal): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(journal)], { type: 'application/json' }));
  const link = el('a', { href: url, download: `dynasty-journal-seed${journal.seed}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Own lines lose the subject in the chronicle only; the journal mixes people, so names stay (D-162). */
function entriesList(state: GameState, entries: readonly ChronicleEntry[], ownLines: boolean): HTMLElement {
  const recent = entries.slice(-CHRONICLE_LIMIT).reverse();
  const heads = headIds(allChronicle(state));
  return el('ul', { className: 'chronicle' }, ...recent.map((e) => entryItem(el, e, ownLines ? state.playerId : null, heads)));
}

/** Live region outside `#app` (it is replaced on every render): speaks new events and chronicle lines. */
const announcer = Object.assign(document.createElement('div'), { className: 'sr-only' });
announcer.setAttribute('role', 'status');
announcer.setAttribute('aria-live', 'polite');
announcer.setAttribute('aria-atomic', 'true');
document.body.append(announcer);

function announce(text: string): void {
  if (!text) return;
  // cleared first: the same text twice in a row must still be spoken
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = text; }, 50);
}

function applyAttrs(node: HTMLElement, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}

/** A choice button built from its pure description: key and name, a note beside it, the reason as text when grey. */
function choiceNode(session: Session, c: Control, command: Command | null): HTMLElement {
  const button = el('button', { className: command ? 'choice' : 'choice grey', type: 'button' }, c.text);
  applyAttrs(button, c.attrs);
  if (command) button.onclick = () => act(session, command);
  const note = c.note ? el('span', { className: 'note', id: c.noteId }, c.note) : '';
  if (command) return el('div', { className: 'option' }, button, note);
  return el('div', { className: 'unavailable' }, button, note, el('span', { className: 'reason', id: c.reasonId }, c.reason));
}

function numbersButton(session: Session): HTMLElement {
  const t = numbersToggle(session.showNumbers);
  const b = el('button', { className: 'link numbers', type: 'button', onclick: () => { session.showNumbers = !session.showNumbers; session.refocus = 'numbers'; render(session); } }, t.text);
  applyAttrs(b, { ...t.attrs, 'data-focus': 'numbers' });
  return b;
}

/** A list of people to pick one from; the empty value leaves the term to the law. */
function willSelect(id: string, label: string, empty: string, people: PersonChoice[], value: string | null): { field: HTMLElement; input: HTMLSelectElement } {
  const input = document.createElement('select');
  input.id = id;
  input.append(el('option', { value: '' }, empty));
  for (const p of people) input.append(el('option', { value: p.id, selected: p.id === value }, p.label));
  return { field: el('p', {}, el('label', { htmlFor: id }, label), ' ', input), input };
}

/** The will screen (D-314): heir and guardian, the price, "Go to the notary" and "Cancel". */
function willView(form: WillForm, onCommand: (cmd: Command) => void, cancel: () => void): HTMLElement {
  const lawHeir = form.heirs[0];
  const heir = willSelect('will-heir', 'Main heir:', lawHeir ? `Leave it to the law (${lawHeir.label})` : 'Leave it to the law', form.heirs, form.current?.heir ?? null);
  const guardian = willSelect('will-guardian', 'Guardian of an heir under age:', 'Leave it to the law', form.guardians, form.current?.guardian ?? null);
  const status = form.current
    ? form.current.stale ? 'Your will is out of date: write a new one, or the law fills what it no longer says.' : 'You have a will. A new one replaces it.'
    : 'You have no will: the law decides who inherits.';
  const go = el('button', { className: 'choice', type: 'button' }, `Go to the notary (${form.cost} crowns, a few days)`);
  const parts: (Node | string)[] = [el('h2', { tabIndex: -1 }, 'Your will'), el('p', {}, status), heir.field, guardian.field];
  if (form.heirs.length === 0 && form.endsWithoutKin) parts.push(el('p', {}, 'You have no kin to name: without kin the house will end with you.'));
  if (form.reasons.length > 0) {
    go.className = 'choice grey';
    go.setAttribute('aria-disabled', 'true');
    parts.push(el('div', { className: 'unavailable' }, go, el('span', { className: 'reason' }, form.reasons.join('; '))));
  } else {
    go.onclick = () => onCommand(willCommandOf(heir.input.value, guardian.input.value));
    parts.push(el('div', { className: 'option' }, go));
  }
  parts.push(el('button', { className: 'link', type: 'button', onclick: cancel }, 'Cancel'));
  return el('section', { className: 'will' }, ...parts);
}

/** Who inherits now, by law or by will (D-018, D-314). */
function heirParagraph(session: Session): HTMLElement {
  const line = heirLine(session.state);
  if (!line) {
    // Until 4.13 a namesake from afar takes a house without kin (D-315); then the house ends.
    const placeholder = session.content.succession?.temporaryHeir ?? true;
    return el('p', {}, placeholder ? 'Heir: nobody of the blood; a namesake from afar would take up the house.' : 'Heir: nobody. The house would end with you.');
  }
  return el('p', {}, 'Heir: ', el('a', { href: personHref(line.id), className: 'person' }, line.name), ` (${line.by}).`);
}

/**
 * The hero's face (4.12, D-300): the mood of the event on screen, a calm face otherwise; its text is the label a
 * screen reader speaks (D-248).
 */
function portraitFigure(session: Session): HTMLElement {
  const ctx = { state: session.state, content: session.content };
  const spec = faceSpec(ctx, getPlayer(session.state), eventView(ctx)?.mood ?? DEFAULT_MOOD);
  return el('figure', { className: 'portrait' }, portraitCanvas(spec));
}

function render(session: Session): void {
  const { state, content } = session;
  const player = getPlayer(state);
  const hero = heroView(state, content);
  const rerender = () => render(session);
  const parts: Node[] = [];

  const pageId = entityIdFromHash(location.hash);
  if (pageId !== null) {
    // a person, or a page of any other kind of entity (4.2, D-330); null reads as "nobody by that name"
    const found = entityPage({ state, content }, pageId);
    app?.replaceChildren(numbersButton(session), pageView(el, found, headIds(allChronicle(state)), session.showNumbers, (cmd) => act(session, cmd)));
    if (session.refocus) app?.querySelector<HTMLElement>(`[data-focus="${session.refocus}"]`)?.focus();
    else window.scrollTo(0, 0);
    session.refocus = null;
    return;
  }

  if (session.notice) {
    const lost = session.lostJournal;
    parts.push(el('p', { className: 'notice' }, session.notice,
      lost ? el('button', { className: 'link', type: 'button', onclick: () => downloadJournal(lost) }, 'Download the journal of that game') : ''));
  }
  if (session.saveProblem) parts.push(el('p', { className: 'notice warn', role: 'alert' }, session.saveProblem));

  parts.push(
    el('h1', {}, `House of ${hero.surname}`),
    el('div', { className: 'meta bar' }, el('span', {}, `${formatDate(state.day)} · seed ${state.seed}`),
      el('button', { className: 'link', type: 'button', onclick: () => newGameWithConfirm(session) }, 'New game'),
      el('button', { className: 'link', type: 'button', onclick: () => downloadJournal(session.journal) }, 'Journal'), numbersButton(session)),
    el('section', { className: 'hero' },
      portraitFigure(session),
      el('h2', {}, el('a', { href: personHref(player.id), className: 'person' }, hero.name)),
      el('p', {}, `${hero.sex === 'male' ? 'Man' : 'Woman'}, aged ${hero.age}${hero.fame ? `, ${hero.fame}` : ''}. Money ${hero.money}.`),
      el('p', {}, `Health: ${hero.conditions || 'healthy'}.`),
      el('dl', { className: 'stats' }, ...hero.stats.flatMap((s) => [
        el('dt', {}, s.label),
        el('dd', { title: String(s.value) }, withNumber(s.word, s.value, session.showNumbers)),
      ])),
      hero.education.length ? el('p', {}, `Education: ${hero.education.join(', ')}.`) : '',
      hero.traits.length ? el('p', {}, `Traits: ${hero.traits.join(', ')}.`) : '',
      heirParagraph(session),
    ),
  );

  const ctx = { state, content };
  const form = willForm(state, content);
  const screen = eventScreen(ctx);
  let focusTarget: HTMLElement;
  if (screen) {
    const controls = screen.options.map((o, i) => optionControl(o, i, session.showNumbers));
    session.keymap = screen.options.map((o) => (o.grey ? null : { type: 'choose', option: o.index }));
    const eventText = eventPageKey(screen.text, screen.options);
    if (eventText !== session.announcedEvent) {
      session.announcedEvent = eventText;
      session.queue.push(eventAnnouncement(screen.text, controls));
    }
    focusTarget = el('section', { className: 'event', tabIndex: -1 },
      el('p', {}, ...partNodes(el, screen.text)),
      el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(session, c, session.keymap[i] ?? null))));
    parts.push(el('h2', {}, 'Event'), focusTarget);
  } else if (session.willOpen && form && state.status === 'awaiting_action') {
    session.announcedEvent = '';
    session.keymap = [];
    const view = willView(form, (cmd) => { session.willOpen = false; void act(session, cmd); }, () => { session.willOpen = false; session.focusAfterRender = true; rerender(); });
    focusTarget = view.querySelector('h2') ?? view;
    parts.push(view);
  } else {
    session.announcedEvent = '';
    session.willOpen = false;
    const rows = actionRows(ctx);
    const controls = rows.map((a, i) => actionControl(a, i));
    session.keymap = rows.map((a) => (a.grey ? null : { type: 'start', actionId: a.id }));
    focusTarget = el('h2', { tabIndex: -1 }, 'What next?');
    parts.push(focusTarget, el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(session, c, session.keymap[i] ?? null))));
    if (form && state.status === 'awaiting_action') {
      parts.push(el('p', {}, el('button', { className: 'link', type: 'button', onclick: () => { session.willOpen = true; session.focusAfterRender = true; rerender(); } }, 'Make a will…')));
    }
  }

  const tabButton = (tab: Tab, label: string) =>
    el('button', { className: session.tab === tab ? 'tab active' : 'tab', type: 'button', onclick: () => { session.tab = tab; session.refocus = `tab-${tab}`; rerender(); } }, label);
  const keyed = (b: HTMLElement, tab: Tab) => { b.setAttribute('data-focus', `tab-${tab}`); return b; };
  const withPressed = (b: HTMLElement) => { b.setAttribute('aria-pressed', String(b.classList.contains('active'))); return b; };
  const level = session.tab === 'chronicle' ? 'chronicle' : 'journal';
  parts.push(
    el('div', { className: 'tabs' }, withPressed(keyed(tabButton('chronicle', 'Chronicle'), 'chronicle')), withPressed(keyed(tabButton('journal', 'Journal'), 'journal'))),
    entriesList(state, allChronicle(state).filter((e) => e.level === level), level === 'chronicle'),
  );
  app?.replaceChildren(...parts);
  announce(session.queue.splice(0).filter(Boolean).join(' '));
  if (session.refocus) {
    app?.querySelector<HTMLElement>(`[data-focus="${session.refocus}"]`)?.focus();
    session.refocus = null;
  }
  if (session.focusAfterRender) {
    session.focusAfterRender = false;
    focusTarget.focus({ preventScroll: false });
  }
}

/**
 * Applies a command, then autosaves (D-016): one save after every command. The screen changes only once the write is
 * done, and no command is taken meanwhile (D-234): a reload never shows a choice that was not saved.
 */
async function act(session: Session, cmd: Command): Promise<void> {
  if (session.busy) return;
  session.busy = true;
  try {
    // the archive phase moves old lines out of the hot part: count over the whole chronicle
    const seen = allChronicle(session.state).length;
    applyRecorded(session.journal, session.state, session.content, cmd);
    session.focusAfterRender = true;
    // new chronicle lines go to the live region first, the event page follows in render()
    const lines = allChronicle(session.state).slice(seen).filter((e) => e.level === 'chronicle').map(entryText);
    session.queue.push(chronicleAnnouncement(lines));
    session.saveProblem = saveProblemText(await saveGame(session.store, session.state, session.journal, session.saved, session.contentVersion));
    render(session);
  } finally {
    session.busy = false;
  }
}

/** A mark unique to a new game (D-339): a tab still playing a replaced game cannot write into it. */
function newGameMark(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
}

async function startSession(session: Session, seed: number): Promise<void> {
  session.state = newGame(seed, session.content);
  session.journal = newJournal(seed, session.contentVersion);
  const started = await startGame(session.store, session.state, session.journal, session.contentVersion, newGameMark());
  session.saved = started.saved;
  session.saveProblem = saveProblemText(started.outcome);
  render(session);
}

async function newGameWithConfirm(session: Session): Promise<void> {
  if (session.busy || !confirm('Start a new game? The current dynasty will be lost for good.')) return;
  session.busy = true;
  try {
    history.replaceState(null, '', location.pathname);
    session.notice = null;
    session.lostJournal = null;
    await startSession(session, pickSeed());
  } finally {
    session.busy = false;
  }
}

const DISCARDED: Record<string, string> = {
  old_version: 'Your saved game is from another version of the game and cannot be continued. A new game has begun.',
  content_changed: "The game's content has changed and your saved game no longer fits it. A new game has begun.",
};

async function boot(content: Content, version: string): Promise<void> {
  dropLocalStorageSave();
  const store = await browserStore();
  const outcome = await loadGame(store, content, version);
  const requested = seedFromSearch(location.search, isValidSeed);
  const choice = startChoice(outcome, requested);
  const loadedGame = outcome.kind === 'loaded' ? outcome : null;
  const state = loadedGame?.state ?? newGame(pickSeed(), content);
  const session: Session = {
    state, content, contentVersion: version, store,
    journal: loadedGame?.journal ?? newJournal(state.seed, version), saved: loadedGame?.saved ?? { game: '', chunks: 0, commands: 0 }, busy: false, lostJournal: null,
    notice: null, saveProblem: null, tab: 'chronicle', showNumbers: false, announcedEvent: '', keymap: [], focusAfterRender: false, queue: [], refocus: null, willOpen: false,
  };
  current = session;
  if (choice === 'continue' || (choice === 'ask_replace' && !confirm(`The address asks for seed ${String(requested)}, which replaces your saved dynasty. Replace it?`))) {
    if (choice === 'ask_replace') history.replaceState(null, '', location.pathname);
    render(session);
  } else {
    if (outcome.kind === 'discarded') {
      session.notice = DISCARDED[outcome.reason] ?? 'Your saved game could not be read. A new game has begun.';
      session.lostJournal = outcome.journal;
    }
    await startSession(session, requested ?? pickSeed());
  }
}

const loaded = loadContent(files);
let current: Session | null = null;
window.addEventListener('hashchange', () => { if (current) render(current); });
if (!loaded.ok) {
  app.replaceChildren(
    el('h1', {}, 'Content errors'),
    el('pre', { className: 'errors' }, loaded.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n')),
  );
} else {
  void boot(loaded.content, contentVersion(files));
}

window.addEventListener('keydown', (e) => {
  if (!current || entityIdFromHash(location.hash) !== null) return;
  const position = shortcutPosition({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: (e.target as HTMLElement | null)?.tagName });
  if (position === null) return;
  const picked = pickableAt(current.keymap.map((c) => ({ grey: c === null })), position);
  const command = picked === null ? null : current.keymap[picked];
  if (!command) return;
  e.preventDefault();
  void act(current, command);
});
