import { allChronicle } from '../core/archive/archive';
import { entryText } from '../core/chronicle/log';
import { loadContent } from '../core/content/load';
import type { Content } from '../core/content/schema';
import { eventView } from '../core/events/view';
import { newGame, type Command } from '../core/game';
import { getPlayer } from '../core/helpers';
import { isValidSeed } from '../core/rng';
import { contentVersion } from '../core/save/content-version';
import { applyRecorded, newJournal, type Journal } from '../core/save/journal';
import type { GameState } from '../core/state';
import { formatDate } from '../core/time/calendar';
import { chronicleAnnouncement, pickableAt, shortcutPosition } from './access';
import { entityIdFromHash } from './address';
import { avatarPanel } from './avatar';
import { choiceNode } from './choice';
import { clockPanel } from './clock';
import { confirmWindow, willWindow } from './dialogs';
import { el } from './dom';
import { headIds } from './entry';
import { eventAnnouncement, eventPageKey, eventScreen, eventTitle, optionControl } from './event';
import { headerPanel } from './header';
import { headerFigures } from './header-model';
import { latelyPanel } from './lately';
import { modalFrame, modalHeading } from './modal';
import { beforeChoice, outcomeOf, type Outcome } from './outcome-model';
import { outcomeWindow } from './outcome';
import { partNodes } from './page';
import { newSidebarState, sidebarPanel, type SidebarState } from './sidebar';
import { visit } from './sidebar-model';
import { dropOldSave, loadGame, openIndexedDb, saveGame, seedFromSearch, startChoice, startGame, type AsyncStore, type Saved, type SaveOutcome } from './storage';
import { whereView } from './where-model';
import { wherePanel } from './where';
import { willForm } from './will';
import './style.css';

const raw = import.meta.glob<string>('/content/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true });
const files = Object.keys(raw)
  .sort()
  .map((path) => ({ path: path.replace(/^\//, ''), text: raw[path] ?? '' }));

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

/** `?dev=1`: the tools of the developer (the seed, the journal of commands) are shown; a player never sees them. */
const DEV = new URLSearchParams(location.search).get('dev') === '1';

/** Narrow screens: one column, the side panel slides over the page (D-248). */
const NARROW = '(max-width: 47.99rem)';

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

/** A question the player must answer inside the page before anything else. */
interface Question {
  title: string;
  text: string;
  yes: string;
  onYes: () => void;
  onNo: () => void;
}

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
  /** Shown above the centre: why a game was discarded, or that saving failed. */
  notice: string | null;
  saveProblem: string | null;
  /** The side panel: open or folded, the trail of pages, the tab. */
  sidebar: SidebarState;
  menuOpen: boolean;
  /** What the last choice came to, shown before the next event (D-440), and whose lines they are. */
  outcome: { outcome: Outcome; heroId: string } | null;
  question: Question | null;
  /** Announced text of the last event page, so the live region speaks a page once. */
  announcedEvent: string;
  /** What a digit key does on the screen now: position → what to do, null for grey choices. */
  keymap: (null | (() => void))[];
  /** Move focus to the new window / the "where I am" block after a command (not on the first render). */
  focusAfterRender: boolean;
  /** Lines for the live region, spoken together at the end of the next render. */
  queue: string[];
  /** `data-focus` key of the control to focus again after a render that replaced it (tabs, menu). */
  refocus: string | null;
  /** The will window is open (4.6). */
  willOpen: boolean;
  /** The unpinned window on screen can be closed with Escape: what that does. */
  dismiss: (() => void) | null;
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

/** The window of the event on screen, or of a scene of the backstory (D-438): pinned until the player has answered. */
function eventWindow(session: Session, screen: NonNullable<ReturnType<typeof eventScreen>>): HTMLElement {
  const ctx = { state: session.state, content: session.content };
  const controls = screen.options.map((o, i) => optionControl(o, i));
  const picks = screen.options.map((o) => (o.grey ? null : () => { void act(session, { type: 'choose', option: o.index }); }));
  session.keymap = picks;
  const text = eventPageKey(screen.text, screen.options);
  if (text !== session.announcedEvent) {
    session.announcedEvent = text;
    session.queue.push(eventAnnouncement(screen.text, controls));
  }
  return modalFrame({ title: eventTitle(ctx, screen), pinned: true, badge: 'answer to go on', kind: 'event' },
    el('p', { className: 'event-text' }, ...partNodes(el, screen.text)),
    el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(c, picks[i] ?? null))));
}

function newGameMenu(session: Session): void {
  session.menuOpen = false;
  session.question = {
    title: 'Start a new game?',
    text: 'The current dynasty will be lost for good.',
    yes: 'Start a new game',
    onYes: () => { if (session.busy) return; session.question = null; void newGameNow(session); },
    onNo: () => { session.question = null; session.focusAfterRender = true; render(session); },
  };
  session.focusAfterRender = true;
  render(session);
}

function render(session: Session): void {
  const { state, content } = session;
  const ctx = { state, content };
  const hero = getPlayer(state);
  const heads = headIds(allChronicle(state));
  const rerender = () => render(session);

  // the address `#/<kind>/<id>` opens a page in the side panel; none shows the hero
  const addressed = entityIdFromHash(location.hash);
  session.sidebar.trail = addressed ? visit(session.sidebar.trail, addressed) : [];
  const pageId = addressed ?? hero.id;

  session.keymap = [];
  session.dismiss = null;
  const form = willForm(state, content);
  const screen = eventScreen(ctx);
  let modal: HTMLElement | null = null;
  if (session.question) {
    const q = session.question;
    modal = confirmWindow(q.title, q.text, q.yes, q.onYes, q.onNo);
    session.dismiss = q.onNo;
  } else if (session.outcome) {
    const { outcome, heroId } = session.outcome;
    const go = () => { session.outcome = null; session.focusAfterRender = true; rerender(); };
    session.keymap = [go];
    modal = outcomeWindow(outcome, heroId, heads, { text: '1. Continue', note: '', reason: '', reasonId: 'continue-reason', noteId: 'continue-note', attrs: { 'aria-keyshortcuts': '1' }, key: '1' }, go);
  } else if (screen) {
    modal = eventWindow(session, screen);
  } else if (session.willOpen && form && state.status === 'awaiting_action') {
    const close = () => { session.willOpen = false; session.focusAfterRender = true; rerender(); };
    modal = willWindow(form, (cmd) => { session.willOpen = false; void act(session, cmd); }, close);
    session.dismiss = close;
  }
  // on a phone the panel and a window do not share the screen: the window wins
  if (modal && window.matchMedia(NARROW).matches) session.sidebar.open = false;
  if (!screen) session.announcedEvent = '';
  if (!(session.willOpen && form)) session.willOpen = false;

  const where = whereView(ctx);
  const keymap: (null | (() => void))[] = [];
  const centre = wherePanel({
    view: where,
    onStart: (actionId) => { void act(session, { type: 'start', actionId }); },
    onWill: form && state.status === 'awaiting_action' ? () => { session.willOpen = true; session.focusAfterRender = true; rerender(); } : null,
    keymap,
  });
  if (!modal) session.keymap = keymap;

  const notices: HTMLElement[] = [];
  if (session.notice) {
    const lost = session.lostJournal;
    notices.push(el('p', { className: 'notice' }, session.notice,
      lost ? el('button', { className: 'link', type: 'button', onclick: () => downloadJournal(lost) }, 'Download the journal of that game') : ''));
  }
  if (session.saveProblem) notices.push(el('p', { className: 'notice warn', role: 'alert' }, session.saveProblem));

  const sidebar = sidebarPanel({
    ctx, view: session.sidebar, pageId, heads,
    onToggle: () => { session.sidebar.open = !session.sidebar.open; session.refocus = 'sidebar-toggle'; rerender(); },
    onTab: (tab) => { session.sidebar.tab = tab; session.sidebar.tabFor = pageId; session.refocus = `tab-${tab}`; rerender(); },
    onCommand: (cmd) => {
      // the answer is an event window: on a phone the panel gets out of its way
      if (window.matchMedia(NARROW).matches) session.sidebar.open = false;
      void act(session, cmd);
    },
  });

  const header = headerPanel({
    figures: headerFigures(state, content),
    menuOpen: session.menuOpen,
    onMenuToggle: () => { session.menuOpen = !session.menuOpen; session.refocus = 'menu'; rerender(); },
    items: [{ label: 'New game', onClick: () => newGameMenu(session) }, ...(DEV ? [{ label: 'Download the command journal', onClick: () => downloadJournal(session.journal) }] : [])],
    devNotes: DEV ? [`Seed ${state.seed}`] : [],
  });

  const game = el('div', { className: session.sidebar.open ? 'game' : 'game side-closed' },
    ...sidebar,
    header,
    el('main', { className: 'center', id: 'center' }, ...notices, centre, latelyPanel(allChronicle(state), hero.id, heads)),
    clockPanel(formatDate(state.day)),
    avatarPanel(ctx, () => openProfile(session)));
  // the menu stays reachable under a pinned window: "New game" must work whatever is pending
  if (modal) for (const part of game.querySelectorAll<HTMLElement>('.center, .sidebar, .avatar')) part.inert = true;
  app?.replaceChildren(game, ...(modal ? [modal] : []));
  // on a phone the window starts below the header, whatever height its words make it
  if (modal && window.matchMedia(NARROW).matches) modal.style.paddingTop = `${Math.ceil(header.getBoundingClientRect().bottom) + 8}px`;
  if (DEV) game.setAttribute('data-seed', String(state.seed));

  announce(session.queue.splice(0).filter(Boolean).join(' '));
  if (session.refocus) {
    app?.querySelector<HTMLElement>(`[data-focus="${session.refocus}"]`)?.focus();
    session.refocus = null;
  }
  if (session.focusAfterRender) {
    session.focusAfterRender = false;
    (modal ? modalHeading(modal) : app?.querySelector<HTMLElement>('#where-heading'))?.focus({ preventScroll: false });
  }
}

/** The avatar opens the hero's profile in the side panel, even from a page of someone else or with the panel folded. */
function openProfile(session: Session): void {
  session.sidebar.open = true;
  if (entityIdFromHash(location.hash) !== null) history.pushState(null, '', location.pathname + location.search);
  session.sidebar.tab = null;
  session.sidebar.tabFor = null;
  session.refocus = 'avatar';
  render(session);
}

/**
 * Applies a command, then autosaves (D-016): one save after every command. The screen changes only once the write is
 * done, and no command is taken meanwhile (D-234): a reload never shows a choice that was not saved.
 */
async function act(session: Session, cmd: Command): Promise<void> {
  if (session.busy) return;
  session.busy = true;
  try {
    const ctx = { state: session.state, content: session.content };
    // the archive phase moves old lines out of the hot part: count over the whole chronicle
    const seen = allChronicle(session.state).length;
    let before = null;
    if (cmd.type === 'choose') {
      const chosen = eventView(ctx)?.options.find((o) => o.index === cmd.option);
      before = beforeChoice(ctx, Boolean(chosen?.chance));
    }
    applyRecorded(session.journal, session.state, session.content, cmd);
    session.focusAfterRender = true;
    if (before) {
      const outcome = outcomeOf(ctx, before);
      session.outcome = outcome ? { outcome, heroId: before.hero.id } : null;
    }
    // new chronicle lines go to the live region first, the event window follows in render()
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
  session.outcome = null;
  session.willOpen = false;
  session.sidebar.trail = [];
  session.sidebar.tab = null;
  session.sidebar.tabFor = null;
  const started = await startGame(session.store, session.state, session.journal, session.contentVersion, newGameMark());
  session.saved = started.saved;
  session.saveProblem = saveProblemText(started.outcome);
  render(session);
}

/** The address of this page without a seed or a page, keeping the developer flag. */
function bareAddress(): string {
  return location.pathname + (DEV ? '?dev=1' : '');
}

async function newGameNow(session: Session): Promise<void> {
  if (session.busy) return;
  session.busy = true;
  try {
    history.replaceState(null, '', bareAddress());
    session.notice = null;
    session.lostJournal = null;
    session.focusAfterRender = true;
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
    notice: null, saveProblem: null, sidebar: newSidebarState(!window.matchMedia(NARROW).matches || entityIdFromHash(location.hash) !== null),
    menuOpen: false, outcome: null, question: null, announcedEvent: '', keymap: [], focusAfterRender: false, queue: [], refocus: null, willOpen: false, dismiss: null,
  };
  current = session;
  if (choice === 'continue' || choice === 'ask_replace') {
    if (choice === 'ask_replace' && requested !== null) {
      // the address asks for another seed than the saved game: ask inside the page, a `confirm()` may not show there
      session.question = {
        title: 'Replace your dynasty?',
        text: `The address asks for seed ${String(requested)}, which replaces your saved dynasty.`,
        yes: 'Replace it',
        onYes: () => { session.question = null; session.busy = true; void startSession(session, requested).finally(() => { session.busy = false; }); },
        onNo: () => { session.question = null; history.replaceState(null, '', bareAddress()); render(session); },
      };
    }
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
window.addEventListener('hashchange', () => {
  if (!current) return;
  current.sidebar.open = true;
  render(current);
});
if (!loaded.ok) {
  app.replaceChildren(
    el('h1', {}, 'Content errors'),
    el('pre', { className: 'errors' }, loaded.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n')),
  );
} else {
  void boot(loaded.content, contentVersion(files));
}

window.addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'Escape') {
    const s = current;
    if (s.dismiss) {
      e.preventDefault();
      s.dismiss();
    } else if (s.menuOpen) {
      s.menuOpen = false;
      s.refocus = 'menu';
      render(s);
    }
    return;
  }
  const position = shortcutPosition({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: (e.target as HTMLElement | null)?.tagName });
  if (position === null) return;
  const picked = pickableAt(current.keymap.map((c) => ({ grey: c === null })), position);
  const command = picked === null ? null : current.keymap[picked];
  if (!command) return;
  e.preventDefault();
  command();
});
