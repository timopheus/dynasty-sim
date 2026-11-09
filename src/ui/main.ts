import { allChronicle } from '../core/archive/archive';
import { entryText } from '../core/chronicle/log';
import { loadContent } from '../core/content/load';
import type { Content } from '../core/content/schema';
import { eventView } from '../core/events/view';
import { newGame, type Command } from '../core/game';
import { getPlayer } from '../core/helpers';
import { fullName } from '../core/character/character';
import { houseOf } from '../core/house/house';
import { isValidSeed } from '../core/rng';
import { contentVersion } from '../core/save/content-version';
import { applyRecorded, newJournal, type Journal } from '../core/save/journal';
import type { GameState } from '../core/state';
import { chronicleAnnouncement, pickableAt, shortcutPosition } from './access';
import { entityIdFromHash, hrefOf } from './address';
import { actionShelves, BOARD_ID, WILL_ID } from './actions-model';
import { boardWindow } from './contracts';
import { boardView, offersByPlace } from './contracts-model';
import { actionsPanel } from './actions-panel';
import { avatarPanel } from './avatar';
import { choiceNode } from './choice';
import { clockPanel } from './clock';
import { keepInView, personMenuNode, personOf, type MenuAnchor } from './context-menu';
import { clockMode, idleAction, isPauseKey, newClock, SAVE_EVERY_DAYS, speedForKey, tick, tickMs, type Clock, type Speed } from './clock-model';
import { confirmWindow, willWindow } from './dialogs';
import { el } from './dom';
import { headIds } from './entry';
import { eventAnnouncement, eventPageKey, eventScreen, eventTitle, optionControl } from './event';
import { backstoryScreen } from './backstory-screen';
import { headerPanel, menuNode } from './header';
import { headerFigures } from './header-model';
import { modalFrame, modalHeading } from './modal';
import { beforeChoice, newsOf, outcomeOf, type Outcome } from './outcome-model';
import { outcomeWindow } from './outcome';
import { newsPanel } from './news';
import { pushNews, visibleNews, type NewsItem } from './news-model';
import { findAction } from '../core/actions/actions';
import type { Effects } from '../core/effects';
import { moneyOf } from '../core/events/outcomes';
import { workCrowns } from '../core/economy/economy';
import { partNodes, usePersonTips } from './page';
import { personMenu, personTip, type MenuItem } from './people-model';
import { newSidebarState, sidebarPanel, type SidebarState } from './sidebar';
import { visit } from './sidebar-model';
import { dropOldSave, loadGame, openIndexedDb, saveGame, seedFromSearch, startChoice, startGame, type AsyncStore, type Saved, type SaveOutcome } from './storage';
import { installTooltips, syncTip } from './tooltip';
import { whereView } from './where-model';
import { wherePanel } from './where';
import { mapProps } from './map/game';
import { regionModel } from './map/region';
import { mapView } from './map/view';
import { willForm } from './will';
import './style.css';
import './frame.css';
import { currentLang, dateText, savedLang, setLang, tr, useNames, type Lang } from './i18n';

const raw = import.meta.glob<string>('/content/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true });
const files = Object.keys(raw)
  .sort()
  .map((path) => ({ path: path.replace(/^\//, ''), text: raw[path] ?? '' }));
// the Russian translation of the texts (RU.1, D-476): the same game in a second language
const rawRu = import.meta.glob<string>('/lang/ru/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true });
const ruFiles = Object.keys(rawRu)
  .sort()
  .map((path) => ({ path: path.replace(/^\//, ''), text: rawRu[path] ?? '' }));

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
  /** The side panel: open or folded, the trail of pages, the whole chronicle. */
  sidebar: SidebarState;
  menuOpen: boolean;
  /** The menu of a person (D-448) is open where `anchor` says. */
  personMenu: MenuAnchor | null;
  /** The action under way and the day it began, for the word at its end (D-464). */
  actionStart: { id: string; day: number } | null;
  /** The short words by the clock (D-464): what came of a light choice, and the end of an action. */
  news: NewsItem[];
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
  /** The board of work is open (CK.4), with the offer chosen in it (null: the first one here). */
  boardOpen: boolean;
  boardSelected: string | null;
  /** `data-focus` of the control that opened the board: the focus goes back there when it closes. */
  boardFrom: string | null;
  /** The board was just opened: the focus goes to the offer chosen, so the arrows work at once. */
  boardFocus: boolean;
  /** The unpinned window on screen can be closed with Escape: what that does. */
  dismiss: (() => void) | null;
  /** A window is on screen: the clock stands and the digits answer it (D-448). */
  windowOpen: boolean;
  /** The time player (S.8): speed, pause, days since the last save; the timer of the next day. */
  clock: Clock;
  timer: ReturnType<typeof setTimeout> | null;
}

function saveProblemText(outcome: SaveOutcome): string | null {
  if (outcome.ok) return null;
  if (outcome.reason === 'conflict') return tr('This game was saved from another tab, so this tab no longer saves. Reload to continue from the latest save.');
  return outcome.reason === 'quota'
    ? tr('Autosave failed: browser storage is full. The game goes on, but progress since the last successful save will be lost if you reload. Starting a new game frees the space.')
    : tr('Autosave is not available in this browser. The game goes on, but it will not survive a reload.');
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
  return modalFrame({ title: eventTitle(ctx, screen), pinned: true, badge: tr('answer to go on'), kind: 'event' },
    el('p', { className: 'event-text' }, ...partNodes(el, screen.text)),
    el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(c, picks[i] ?? null, { icons: screen.options[i]?.icons ?? {check: false, cost: false, trait: false}, tip: screen.options[i]?.tip ?? null }))));
}

function newGameMenu(session: Session): void {
  session.menuOpen = false;
  session.question = {
    title: tr('Start a new game?'),
    text: tr('The current dynasty will be lost for good.'),
    yes: tr('Start a new game'),
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
  if (session.sidebar.whole !== pageId) session.sidebar.whole = null;
  usePersonTips((id) => personTip(ctx, id));

  const underway = state.activeAction?.actionId ?? null;
  if (underway === null) session.actionStart = null;
  else if (session.actionStart?.id !== underway) session.actionStart = { id: underway, day: state.day };
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
    session.dismiss = go;
    modal = outcomeWindow(outcome, heroId, heads, { text: '1. Continue', note: '', reason: '', reasonId: 'continue-reason', noteId: 'continue-note', attrs: { 'aria-keyshortcuts': '1' }, key: '1' }, go);
  } else if (screen) {
    modal = eventWindow(session, screen);
  } else if (session.willOpen && form && (state.status === 'awaiting_action' || state.status === 'running')) {
    const close = () => { session.willOpen = false; session.focusAfterRender = true; rerender(); };
    modal = willWindow(form, (cmd) => { session.willOpen = false; void act(session, cmd); }, close);
    session.dismiss = close;
  } else if (session.boardOpen && content.contracts && (state.status === 'awaiting_action' || state.status === 'running')) {
    const close = () => {
      session.boardOpen = false;
      if (session.boardFrom) session.refocus = session.boardFrom;
      else session.focusAfterRender = true;
      rerender();
    };
    const serve = content.actions.find((a) => a.target === 'contract');
    const view = boardView(ctx, session.boardSelected);
    if (session.boardFocus) {
      session.boardFocus = false;
      session.refocus = view.selected ? `offer-${view.selected.id}` : null;
    }
    modal = boardWindow({
      view,
      onSelect: (id) => { session.boardSelected = id; session.refocus = `offer-${id}`; rerender(); },
      onTake: (id) => { if (!serve) return; session.boardOpen = false; void act(session, { type: 'start', actionId: serve.id, target: id }); },
      onTravel: (actionId, target) => { session.boardOpen = false; void act(session, { type: 'start', actionId, target }); },
      onClose: close,
    });
    session.dismiss = close;
  }
  // a window of the game (an event, an outcome, a question) closes the board: it is opened again by hand
  if (session.boardOpen && (session.question || session.outcome || screen)) session.boardOpen = false;
  // on a phone the panel and a window do not share the screen: the window wins
  if (modal && window.matchMedia(NARROW).matches) session.sidebar.open = false;
  if (!screen) session.announcedEvent = '';
  if (!(session.willOpen && form)) session.willOpen = false;

  const menuProps = {
    menuOpen: session.menuOpen,
    onMenuToggle: () => { session.menuOpen = !session.menuOpen; session.refocus = 'menu'; rerender(); },
    items: [
      { label: tr('New game'), onClick: () => newGameMenu(session) },
      // the other language (RU.1): its own name, so whoever cannot read this one finds it
      ...(contents.ru ? [{ label: currentLang() === 'en' ? 'Русский язык' : 'English', onClick: () => switchLang(session) }] : []),
      ...(DEV ? [{ label: 'Download the command journal', onClick: () => downloadJournal(session.journal) }] : []),
    ],
    devNotes: DEV ? [`Seed ${state.seed}`] : [],
  };

  // the early years are a screen of their own (playtest 09.11): no panels, no map, no profile of a grown man behind them
  if (state.backstory.running) {
    session.windowOpen = true;
    const stages = content.backstory?.stages ?? [];
    const stage = Math.min(state.backstory.stage, Math.max(0, stages.length - 1));
    const page = backstoryScreen({
      name: fullName(hero),
      house: houseOf(state, hero)?.name ?? hero.surname,
      step: stage + 1,
      steps: stages.length,
      scene: modal ?? el('div', { className: 'modal-layer' }),
      menu: menuNode(menuProps),
    });
    if (DEV) page.setAttribute('data-seed', String(state.seed));
    app?.replaceChildren(page);
    afterDraw(session, modal);
    return;
  }

  const centre = wherePanel(whereView(ctx));
  const actions = actionsPanel({
    panel: actionShelves(ctx, form, boardCount(ctx)),
    onStart: (id, target) => {
      if (id === BOARD_ID) { openBoard(session, null, `action-${BOARD_ID}`); return; }
      if (id !== WILL_ID) { void act(session, target === undefined ? { type: 'start', actionId: id } : { type: 'start', actionId: id, target }); return; }
      session.willOpen = true;
      session.focusAfterRender = true;
      rerender();
    },
  });
  session.windowOpen = modal !== null;
  const mode = clockMode(state, session.clock, session.windowOpen);

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
    onWhole: (id) => { session.sidebar.whole = id; rerender(); },
    onInteract: (id, button) => {
      const r = button.getBoundingClientRect();
      openPersonMenu(session, { id, x: Math.round(r.left), y: Math.round(r.bottom + 4), from: 'interact' });
    },
    onAct: (id, target) => { void act(session, target === undefined ? { type: 'start', actionId: id } : { type: 'start', actionId: id, target }); },
    onBoard: (placeId) => { openBoard(session, state.contracts.offers.find((o) => o.place === placeId)?.id ?? null, 'place-board'); },
  });

  const header = headerPanel({ figures: headerFigures(state, content), ...menuProps });

  // the map fills the screen behind the panels, as in CK3 (M.1, D-469); made once, it keeps its view across the draws
  const map = mapView();
  map.update(mapProps(ctx, regionModel(), {
    open: (id) => {
      session.sidebar.open = true;
      if (location.hash === hrefOf(id)) render(session);
      else location.hash = hrefOf(id);
    },
    travel: (actionId, id) => { void act(session, { type: 'start', actionId, target: id }); },
  }));
  // the free part of the map, by the frame of cards (frame.css); measured again once the screen is drawn
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  map.setInsets({ left: session.sidebar.open ? 23.5 * rem : 0, right: 20.5 * rem, top: 5.5 * rem, bottom: lastBottomInset || 21 * rem });
  const game = el('div', { className: session.sidebar.open ? 'game' : 'game side-closed' },
    map.element,
    // the frame of cards over the map (playtest 09.11): the page over the portrait, the actions over the clock
    el('div', { className: 'left-column' }, ...sidebar.filter((n) => n.classList.contains('sidebar')), avatarPanel(ctx, () => openProfile(session))),
    ...sidebar.filter((n) => !n.classList.contains('sidebar')),
    header,
    el('main', { className: 'center', id: 'center' }, ...notices, centre),
    el('div', { className: 'right-column' },
      actions,
      el('div', { className: 'clock-stack' },
        newsPanel(visibleNews(session.news, state.day)),
        clockPanel({
          date: dateText(state.day),
          mode,
          speed: session.clock.speed,
          canPlay: mode === 'paused' || (mode === 'idle' && idleAction(state, content) !== null),
          onToggle: () => { void togglePause(session); },
          onSpeed: (speed) => setSpeed(session, speed),
          held: session.boardOpen ? tr('Paused while the work board is open') : null,
        }))));
  // the menu stays reachable under a pinned window: "New game" must work whatever is pending
  if (modal) for (const part of game.querySelectorAll<HTMLElement>('.center, .sidebar, .sidebar-toggle, .avatar, .actions-panel')) part.inert = true;
  // the map is kept across draws: it is closed under a window and open again without one
  map.element.inert = modal !== null;
  const menu = menuNodeFor(session);
  app?.replaceChildren(game, ...(modal ? [modal] : []), ...(menu ? [menu] : []));
  measureFreeMap(game, map);
  if (menu) keepInView(menu);
  // on a phone the window starts below the header, whatever height its words make it
  if (modal && window.matchMedia(NARROW).matches) modal.style.paddingTop = `${Math.ceil(header.getBoundingClientRect().bottom) + 8}px`;
  if (DEV) game.setAttribute('data-seed', String(state.seed));

  afterDraw(session, modal);
}

/** What the button of the board says (CK.4); null without contracts in the content. */
function boardCount(ctx: { state: GameState; content: Content }): { offers: number; here: number } | null {
  if (!ctx.content.contracts?.board) return null;
  const byPlace = offersByPlace(ctx);
  const here = ctx.state.place.here;
  let offers = 0;
  for (const n of byPlace.values()) offers += n;
  return { offers, here: here !== null && !ctx.state.activeAction?.target ? (byPlace.get(here) ?? 0) : 0 };
}

/**
 * Opens the board of work on an offer (null: the first one here), unless another window holds the hero; `from` is the
 * control that opened it, where the focus goes back.
 */
function openBoard(session: Session, offer: string | null, from: string | null): void {
  if (session.windowOpen && !session.boardOpen) return;
  session.boardOpen = true;
  session.boardSelected = offer;
  session.boardFrom = from;
  session.boardFocus = true;
  render(session);
}

/** The height of the block at the bottom at the last draw: the next draw starts from it. */
let lastBottomInset = 0;

/** The panels over the map as drawn: the map centres the hero in what they leave free (M.1). */
function measureFreeMap(game: HTMLElement, map: ReturnType<typeof mapView>): void {
  const gap = 12;
  const box = (selector: string) => game.querySelector(selector)?.getBoundingClientRect() ?? null;
  const side = game.classList.contains('side-closed') ? null : box('.left-column');
  const right = box('.right-column');
  const top = box('.topbar');
  const centre = box('.center');
  lastBottomInset = centre ? Math.max(0, window.innerHeight - centre.top + gap) : 0;
  // a wide window (the work board) keeps above the block "where I am"
  document.documentElement.style.setProperty('--free-bottom', `${lastBottomInset}px`);
  map.setInsets({
    left: side ? side.right + gap : 0,
    right: right ? Math.max(0, window.innerWidth - right.left + gap) : 0,
    top: top ? top.bottom + gap : 0,
    bottom: lastBottomInset,
  });
}

/** What every draw ends with: words for the screen reader, the focus, the tip under the pointer, the clock. */
function afterDraw(session: Session, modal: HTMLElement | null): void {
  announce(session.queue.splice(0).filter(Boolean).join(' '));
  if (session.refocus) {
    app?.querySelector<HTMLElement>(`[data-focus="${session.refocus}"]`)?.focus();
    session.refocus = null;
  }
  if (session.focusAfterRender) {
    session.focusAfterRender = false;
    (modal ? modalHeading(modal) : app?.querySelector<HTMLElement>('#where-heading'))?.focus({ preventScroll: false });
  }
  syncTip();
  schedule(session);
}

/** A mouse button is down: a redraw now would swallow the click, so the clock waits for it to come up. */
let pointerHeld = false;
window.addEventListener('pointerdown', () => { pointerHeld = true; }, true);
for (const type of ['pointerup', 'pointercancel', 'blur'] as const) window.addEventListener(type, () => { pointerHeld = false; }, true);

/** A CSS path of an element inside `#app` by tags and classes, to find its new copy after a redraw. */
function pathOf(node: Element): string {
  const parts: string[] = [];
  for (let n: Element | null = node; n && n !== app; n = n.parentElement) {
    parts.unshift([n.tagName.toLowerCase(), ...[...n.classList].map((c) => CSS.escape(c))].join('.'));
  }
  return parts.join(' > ');
}

/**
 * A redraw of a day of the clock that the player did not ask for: the focus and the scroll of the panels stay where
 * they were, so time running never throws the reader or the keyboard back to the top.
 */
function keepView(redraw: () => void): void {
  if (!app) return redraw();
  const focusables = () => [...app.querySelectorAll<HTMLElement>('button, a[href], summary, [tabindex]')];
  const active = document.activeElement instanceof HTMLElement && app.contains(document.activeElement) ? document.activeElement : null;
  const key = active?.getAttribute('data-focus') ?? null;
  const id = active?.id || null;
  const index = active ? focusables().indexOf(active) : -1;
  const label = active?.textContent ?? '';
  const scrolled = [...app.querySelectorAll('*')].filter((n) => n.scrollTop > 0).map((n) => ({ path: pathOf(n), top: n.scrollTop }));
  redraw();
  for (const { path, top } of scrolled) {
    const node = app.querySelector(path);
    if (node) node.scrollTop = top;
  }
  if (!active || document.activeElement !== document.body) return;
  const again = (key ? app.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`) : null)
    ?? (id ? document.getElementById(id) : null)
    ?? focusables().find((n, i) => i === index && n.textContent === label)
    ?? null;
  again?.focus({ preventScroll: true });
}

/** Sets the timer of the next day while time runs, clears it when it does not; a running timer is left alone. */
function schedule(session: Session): void {
  const mode = clockMode(session.state, session.clock, session.windowOpen);
  if (mode !== 'running') {
    if (session.timer !== null) clearTimeout(session.timer);
    session.timer = null;
    return;
  }
  if (session.timer === null) session.timer = setTimeout(() => { void runDay(session); }, tickMs(session.clock.speed));
}

/** Saves now (D-439: on a decision, on pause, every 30 days); the next command waits for the write (D-234). */
async function saveNow(session: Session): Promise<void> {
  session.saveProblem = saveProblemText(await saveGame(session.store, session.state, session.journal, session.saved, session.contentVersion));
  session.clock.unsaved = 0;
}

/** A word for the news, also spoken by the live region. */
function addNews(session: Session, text: string): void {
  session.news = pushNews(session.news, { day: session.state.day, text });
  session.queue.push(text);
}

/** The end of an ordinary action (not the idle life) is a word in the news: its name and what it brought (D-464). */
function actionEndNews(session: Session, before: string | null, seen: number): void {
  const { state, content } = session;
  if (before === null || state.activeAction?.actionId === before) return;
  const action = findAction(content, before);
  if (action.idle) return;
  const hero = state.playerId;
  const done = allChronicle(state).slice(seen).find((e) => e.kind === 'action' && e.subject === hero);
  if (!done) return;
  // what the action brought: its own effects and the income of its occupation for the days it lasted (S.7)
  const days = session.actionStart?.id === before ? state.day - session.actionStart.day : 0;
  const money = moneyOf({ state, content }, getPlayer(state), action.effects as Effects | undefined) + Math.floor((workCrowns(content, before) * days) / 30);
  addNews(session, `${action.name}: ${money ? `${money > 0 ? '+' : '−'}${Math.abs(money)} crowns` : 'done'}`);
}

/**
 * The end of work on a contract (CK.4) is a word in the news, whether done, failed or left: the line it wrote, which
 * says which, and the pay of the work when it was done.
 */
function contractNews(session: Session, seen: number): void {
  const { state } = session;
  const hero = getPlayer(state);
  const line = allChronicle(state).slice(seen).find((e) => e.kind === 'contract' && e.subject === hero.id);
  if (!line) return;
  // the pay of the work, not whatever else the day or the window brought
  const pay = state.contracts.last?.pay ?? 0;
  addNews(session, `${entryText(line)}${pay > 0 ? ` +${pay} crowns.` : ''}`);
}

/** One day of the clock: `wait 1`, the idle action again if it ended, a stop on a decision. */
async function runDay(session: Session): Promise<void> {
  session.timer = null;
  if (current !== session) return;
  if (clockMode(session.state, session.clock, session.windowOpen) !== 'running') return;
  if (session.busy || pointerHeld) {
    schedule(session);
    return;
  }
  session.busy = true;
  try {
    const seen = allChronicle(session.state).length;
    const endingAction = session.state.activeAction?.actionId ?? null;
    const stopped = tick(session.journal, session.state, session.content);
    actionEndNews(session, endingAction, seen);
    contractNews(session, seen);
    session.clock.unsaved += 1;
    const lines = allChronicle(session.state).slice(seen).filter((e) => e.level === 'chronicle').map(entryText);
    session.queue.push(chronicleAnnouncement(lines));
    if (stopped || session.clock.unsaved >= SAVE_EVERY_DAYS) await saveNow(session);
    if (stopped) {
      session.focusAfterRender = true;
      render(session);
    } else {
      keepView(() => render(session));
    }
  } finally {
    session.busy = false;
  }
  schedule(session);
}

/** "Play"/"Pause" and Space (D-448): pause saves (D-439); play with nothing to do starts living as one wills. */
async function togglePause(session: Session): Promise<void> {
  if (session.busy) return;
  const { state, content, clock } = session;
  const mode = clockMode(state, clock, session.windowOpen);
  if (mode === 'running') {
    clock.paused = true;
    session.busy = true;
    try {
      await saveNow(session);
    } finally {
      session.busy = false;
    }
    keepView(() => render(session));
  } else if (mode === 'paused') {
    clock.paused = false;
    keepView(() => render(session));
  } else if (mode === 'idle') {
    const live = idleAction(state, content);
    if (live === null) return;
    clock.paused = false;
    await act(session, { type: 'start', actionId: live });
  }
}

/** A speed button or 1/2/3 (D-448): the new pace, and time goes on if it was paused. */
function setSpeed(session: Session, speed: Speed): void {
  session.clock.speed = speed;
  session.clock.paused = false;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = null;
  // the focus stays on the button pressed (or wherever it was, for a key)
  keepView(() => render(session));
}

/** The menu of the person the session has open, or null. A menu of someone no longer known closes itself. */
function menuNodeFor(session: Session): HTMLElement | null {
  const anchor = session.personMenu;
  if (!anchor) return null;
  const menu = personMenu({ state: session.state, content: session.content }, anchor.id);
  if (!menu) { session.personMenu = null; return null; }
  return personMenuNode(menu, anchor, (item) => chooseMenuItem(session, item));
}

function openPersonMenu(session: Session, anchor: MenuAnchor): void {
  session.personMenu = anchor;
  session.refocus = 'menu-item-0';
  keepView(() => render(session));
}

function closePersonMenu(session: Session): void {
  const from = session.personMenu?.from ?? null;
  session.personMenu = null;
  session.refocus = from;
  keepView(() => render(session));
}

function chooseMenuItem(session: Session, item: MenuItem): void {
  session.personMenu = null;
  if (item.action.type === 'open') {
    session.sidebar.open = true;
    if (location.hash === hrefOf(item.action.id)) render(session);
    else location.hash = hrefOf(item.action.id);
    return;
  }
  void act(session, { type: 'propose', ...item.action.order });
}

/** The avatar opens the hero's profile in the side panel, even from a page of someone else or with the panel folded. */
function openProfile(session: Session): void {
  session.sidebar.open = true;
  if (entityIdFromHash(location.hash) !== null) history.pushState(null, '', location.pathname + location.search);
  session.sidebar.whole = null;
  session.refocus = 'avatar';
  render(session);
}

/**
 * Applies a command of the player, then autosaves (D-016): a command is a decision, and the game saves on every
 * decision (D-439). The screen changes only once the write is done, and no command is taken meanwhile (D-234): a
 * reload never shows a choice that was not saved. Time runs on afterwards by the clock, never here (S.8).
 */
async function act(session: Session, cmd: Command): Promise<void> {
  if (session.busy) return;
  session.busy = true;
  try {
    const ctx = { state: session.state, content: session.content };
    // the archive phase moves old lines out of the hot part: count over the whole chronicle
    const seen = allChronicle(session.state).length;
    let before = null;
    if (cmd.type === 'choose') before = beforeChoice(ctx, cmd.option);
    applyRecorded(session.journal, session.state, session.content, cmd);
    contractNews(session, seen);
    session.focusAfterRender = true;
    if (before) {
      const outcome = outcomeOf(ctx, before);
      session.outcome = outcome ? { outcome, heroId: before.hero.id } : null;
      // a light choice leaves a word in the news and the clock goes on (D-464)
      const word = outcome ? null : newsOf(ctx, before);
      if (word) addNews(session, word);
    }
    // new chronicle lines go to the live region first, the event window follows in render()
    const lines = allChronicle(session.state).slice(seen).filter((e) => e.level === 'chronicle').map(entryText);
    session.queue.push(chronicleAnnouncement(lines));
    await saveNow(session);
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
  session.news = [];
  session.willOpen = false;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = null;
  session.clock = newClock(false);
  session.sidebar.trail = [];
  session.sidebar.whole = null;
  session.personMenu = null;
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

const DISCARDED: Record<string, () => string> = {
  old_version: () => tr('Your saved game is from another version of the game and cannot be continued. A new game has begun.'),
  content_changed: () => tr("The game's content has changed and your saved game no longer fits it. A new game has begun."),
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
    menuOpen: false, personMenu: null, actionStart: null, news: [], outcome: null, question: null, announcedEvent: '', keymap: [], focusAfterRender: false, queue: [], refocus: null, willOpen: false, boardOpen: false, boardSelected: null, boardFrom: null, boardFocus: false, dismiss: null,
    // a game continued after a reload starts paused: the player picks it up himself
    windowOpen: false, clock: newClock(loadedGame !== null), timer: null,
  };
  current = session;
  if (choice === 'continue' || choice === 'ask_replace') {
    if (choice === 'ask_replace' && requested !== null) {
      // the address asks for another seed than the saved game: ask inside the page, a `confirm()` may not show there
      session.question = {
        title: tr('Replace your dynasty?'),
        text: tr('The address asks for seed {seed}, which replaces your saved dynasty.', { seed: requested }),
        yes: tr('Replace it'),
        onYes: () => { session.question = null; session.busy = true; void startSession(session, requested).finally(() => { session.busy = false; }); },
        onNo: () => { session.question = null; history.replaceState(null, '', bareAddress()); render(session); },
      };
    }
    render(session);
  } else {
    if (outcome.kind === 'discarded') {
      session.notice = DISCARDED[outcome.reason]?.() ?? tr('Your saved game could not be read. A new game has begun.');
      session.lostJournal = outcome.journal;
    }
    await startSession(session, requested ?? pickSeed());
  }
}

const loaded = loadContent(files);
const loadedRu = loaded.ok ? loadContent([...files, ...ruFiles]) : null;
// a translation that does not load leaves the game in English, and says why to the developer
if (loadedRu && !loadedRu.ok) console.warn('Russian is off:', loadedRu.errors.slice(0, 20).map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n'));
const contents: Record<Lang, Content | null> = { en: loaded.ok ? loaded.content : null, ru: loadedRu?.ok ? loadedRu.content : null };
if (contents.ru) useNames(contents.ru);
setLang(savedLang() === 'ru' && contents.ru ? 'ru' : 'en');
let current: Session | null = null;
window.addEventListener('hashchange', () => {
  if (!current) return;
  current.sidebar.open = true;
  current.personMenu = null;
  render(current);
});
installTooltips();
installPersonMenu();
if (!loaded.ok) {
  app.replaceChildren(
    el('h1', {}, 'Content errors'),
    el('pre', { className: 'errors' }, loaded.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n')),
  );
} else {
  void boot(contents[currentLang()] ?? loaded.content, contentVersion(files));
}

/**
 * The other language (RU.1, D-476): the screen and every new line in it at once; the world is the same, the lines already
 * written stay in the language they were written in. Before the first choice of a game nothing is lost by beginning it
 * anew: the same seed gives the same world (a test checks it), and its first lines are in the new language too.
 */
function switchLang(session: Session): void {
  const next: Lang = currentLang() === 'en' ? 'ru' : 'en';
  const content = contents[next];
  if (!content || session.busy) return;
  setLang(next);
  session.content = content;
  session.menuOpen = false;
  session.refocus = 'menu';
  if (session.journal.commands.length === 0) {
    session.busy = true;
    void startSession(session, session.state.seed).finally(() => { session.busy = false; });
    return;
  }
  render(session);
}

window.addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'Escape') {
    const s = current;
    if (s.personMenu) {
      e.preventDefault();
      closePersonMenu(s);
    } else if (s.dismiss) {
      e.preventDefault();
      s.dismiss();
    } else if (s.menuOpen) {
      s.menuOpen = false;
      s.refocus = 'menu';
      render(s);
    }
    return;
  }
  const target = (e.target as HTMLElement | null)?.tagName;
  // J opens and closes the board of work (D-474: letters, not the keys the browser takes)
  if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && target !== 'INPUT' && target !== 'TEXTAREA' && target !== 'SELECT' && current.content.contracts?.board) {
    const s = current;
    if (s.boardOpen) {
      e.preventDefault();
      s.boardOpen = false;
      if (s.boardFrom) s.refocus = s.boardFrom;
      else s.focusAfterRender = true;
      render(s);
      return;
    }
    if (!s.windowOpen && !s.personMenu && !s.menuOpen && !s.state.backstory.running && (s.state.status === 'awaiting_action' || s.state.status === 'running')) {
      e.preventDefault();
      openBoard(s, null, null);
      return;
    }
  }
  if (isPauseKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target })) {
    e.preventDefault();
    void togglePause(current);
    return;
  }
  // digits answer a window when one is open (D-263), else pick the speed of the clock (D-448)
  if (!current.windowOpen) {
    const speed = shortcutPosition({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target }) === null ? null : speedForKey(e.key);
    if (speed !== null) {
      e.preventDefault();
      setSpeed(current, speed);
    }
    return;
  }
  const position = shortcutPosition({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target });
  if (position === null) return;
  const picked = pickableAt(current.keymap.map((c) => ({ grey: c === null })), position);
  const command = picked === null ? null : current.keymap[picked];
  if (!command) return;
  e.preventDefault();
  command();
});

/**
 * The menu of a person opens wherever the person is named (D-448): right click, the menu key or Shift+F10 on a name
 * (D-444: whatever opens by the mouse opens from the keyboard too). A click anywhere else closes it.
 */
function installPersonMenu(): void {
  document.addEventListener('contextmenu', (e) => {
    const id = personOf(e.target);
    if (!current || !id) return;
    e.preventDefault();
    openPersonMenu(current, { id, x: e.clientX, y: e.clientY, from: null });
  });
  document.addEventListener('keydown', (e) => {
    if (!current || !(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
    const id = personOf(e.target);
    if (!id) return;
    e.preventDefault();
    const target = (e.target as Element).closest<HTMLElement>('[data-person]');
    const r = target?.getBoundingClientRect();
    openPersonMenu(current, { id, x: Math.round(r?.left ?? 0), y: Math.round((r?.bottom ?? 0) + 4), from: target?.getAttribute('data-focus') ?? null });
  });
  document.addEventListener('click', (e) => {
    if (!current?.personMenu || (e.target instanceof Element && e.target.closest('.person-menu, [data-focus="interact"]'))) return;
    const session = current;
    session.personMenu = null;
    keepView(() => render(session));
  });
}
