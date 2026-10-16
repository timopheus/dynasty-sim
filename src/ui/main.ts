import { entryText, type ChronicleEntry } from '../core/chronicle/log';
import { loadContent } from '../core/content/load';
import type { Content } from '../core/content/schema';
import { apply, newGame, type Command } from '../core/game';
import { isValidSeed } from '../core/rng';
import type { GameState } from '../core/state';
import { formatDate } from '../core/time/calendar';
import { getPlayer } from '../core/helpers';
import { personPage } from '../core/pages/person';
import { heroView } from './hero';
import { personHref, personIdFromHash } from './address';
import { actionRows, eventScreen } from './event';
import { actionControl, chronicleAnnouncement, eventAnnouncement, numbersToggle, optionControl, pickableAt, shortcutPosition, withNumber, type Control } from './access';
import { headIds } from './entry';
import { entryItem, partNodes, pageView } from './page';
import { clearGame, loadGame, saveGame, seedFromSearch, startChoice, type KeyValueStore } from './storage';
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

/** `localStorage`, or null where even touching it throws (privacy modes, blocked storage). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type Tab = 'chronicle' | 'journal';

interface Session {
  state: GameState;
  content: Content;
  store: KeyValueStore | null;
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
}

function saveProblemText(reason: 'quota' | 'unavailable'): string {
  return reason === 'quota'
    ? 'Autosave failed: browser storage is full. The game goes on, but progress since the last successful save will be lost if you reload. Starting a new game frees the space.'
    : 'Autosave is not available in this browser. The game goes on, but it will not survive a reload.';
}

/** Own lines lose the subject in the chronicle only; the journal mixes people, so names stay (D-162). */
function entriesList(state: GameState, entries: ChronicleEntry[], ownLines: boolean): HTMLElement {
  const recent = entries.slice(-CHRONICLE_LIMIT).reverse();
  const heads = headIds(state.chronicle);
  return el('ul', { className: 'chronicle' }, ...recent.map((e) => entryItem(el, e, ownLines ? state.playerId : null, heads)));
}

/** Live region outside `#app` (it is replaced on every render): speaks new events and chronicle lines. */
const announcer = Object.assign(document.createElement('div'), { className: 'sr-only' });
announcer.setAttribute('role', 'status');
announcer.setAttribute('aria-live', 'polite');
announcer.setAttribute('aria-atomic', 'true');
document.body.append(announcer);

function announce(text: string): void {
  if (text) announcer.textContent = text;
}

function applyAttrs(node: HTMLElement, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}

/** A choice button built from its pure description: key and name, a note beside it, the reason as text when grey. */
function choiceNode(session: Session, c: Control, command: Command | null): HTMLElement {
  const button = el('button', { className: command ? 'choice' : 'choice grey', type: 'button' }, c.text);
  applyAttrs(button, c.attrs);
  if (command) button.onclick = () => act(session, command);
  const note = c.note ? el('span', { className: 'note' }, c.note) : '';
  if (command) return el('div', { className: 'option' }, button, note);
  return el('div', { className: 'unavailable' }, button, note, el('span', { className: 'reason', id: c.reasonId }, c.reason));
}

function numbersButton(session: Session): HTMLElement {
  const t = numbersToggle(session.showNumbers);
  const b = el('button', { className: 'link numbers', type: 'button', onclick: () => { session.showNumbers = !session.showNumbers; render(session); } }, t.text);
  applyAttrs(b, t.attrs);
  return b;
}

function render(session: Session): void {
  const { state, content } = session;
  const player = getPlayer(state);
  const hero = heroView(state, content);
  const rerender = () => render(session);
  const parts: Node[] = [];

  const pageId = personIdFromHash(location.hash);
  if (pageId !== null) {
    app?.replaceChildren(numbersButton(session), pageView(el, personPage({ state, content }, pageId), headIds(state.chronicle), session.showNumbers));
    window.scrollTo(0, 0);
    return;
  }

  if (session.notice) parts.push(el('p', { className: 'notice' }, session.notice));
  if (session.saveProblem) parts.push(el('p', { className: 'notice warn', role: 'alert' }, session.saveProblem));

  parts.push(
    el('h1', {}, `House of ${hero.surname}`),
    el('p', { className: 'meta' }, `${formatDate(state.day)} · seed ${state.seed} · `,
      el('button', { className: 'link', type: 'button', onclick: () => newGameWithConfirm(session) }, 'New game'), ' · ', numbersButton(session)),
    el('section', { className: 'hero' },
      el('h2', {}, el('a', { href: personHref(player.id), className: 'person' }, hero.name)),
      el('p', {}, `${hero.sex === 'male' ? 'Man' : 'Woman'}, aged ${hero.age}${hero.fame ? `, ${hero.fame}` : ''}. Money ${hero.money}.`),
      el('p', {}, `Health: ${hero.conditions || 'healthy'}.`),
      el('dl', { className: 'stats' }, ...hero.stats.flatMap((s) => [
        el('dt', {}, s.label),
        el('dd', { title: String(s.value) }, withNumber(s.word, s.value, session.showNumbers)),
      ])),
      hero.education.length ? el('p', {}, `Education: ${hero.education.join(', ')}.`) : '',
      hero.traits.length ? el('p', {}, `Traits: ${hero.traits.join(', ')}.`) : '',
    ),
  );

  const ctx = { state, content };
  const screen = eventScreen(ctx);
  let focusTarget: HTMLElement;
  if (screen) {
    const controls = screen.options.map((o, i) => optionControl(o, i, session.showNumbers));
    session.keymap = screen.options.map((o) => (o.grey ? null : { type: 'choose', option: o.index }));
    const eventText = eventAnnouncement(screen.text, controls);
    if (eventText !== session.announcedEvent) {
      session.announcedEvent = eventText;
      session.queue.push(eventText);
    }
    focusTarget = el('section', { className: 'event', tabIndex: -1 },
      el('p', {}, ...partNodes(el, screen.text)),
      el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(session, c, session.keymap[i] ?? null))));
    parts.push(el('h2', {}, 'Event'), focusTarget);
  } else {
    session.announcedEvent = '';
    const rows = actionRows(ctx);
    const controls = rows.map((a, i) => actionControl(a, i));
    session.keymap = rows.map((a) => (a.grey ? null : { type: 'start', actionId: a.id }));
    focusTarget = el('h2', { tabIndex: -1 }, 'What next?');
    parts.push(focusTarget, el('div', { className: 'choices' }, ...controls.map((c, i) => choiceNode(session, c, session.keymap[i] ?? null))));
  }

  const tabButton = (tab: Tab, label: string) =>
    el('button', { className: session.tab === tab ? 'tab active' : 'tab', type: 'button', onclick: () => { session.tab = tab; session.focusAfterRender = false; rerender(); } }, label);
  const withPressed = (b: HTMLElement) => { b.setAttribute('aria-pressed', String(b.classList.contains('active'))); return b; };
  const level = session.tab === 'chronicle' ? 'chronicle' : 'journal';
  parts.push(
    el('div', { className: 'tabs', role: 'group', ariaLabel: 'Chronicle or journal' }, withPressed(tabButton('chronicle', 'Chronicle')), withPressed(tabButton('journal', 'Journal'))),
    entriesList(state, state.chronicle.filter((e) => e.level === level), level === 'chronicle'),
  );
  app?.replaceChildren(...parts);
  announce(session.queue.splice(0).join(' '));
  if (session.focusAfterRender) {
    session.focusAfterRender = false;
    focusTarget.focus({ preventScroll: false });
  }
}

/** Applies a command, then autosaves (D-016): one save after every command. */
function act(session: Session, cmd: Command): void {
  const seen = session.state.chronicle.length;
  apply(session.state, session.content, cmd);
  session.focusAfterRender = true;
  // new chronicle lines go to the live region first, the event page follows in render()
  const lines = session.state.chronicle.slice(seen).filter((e) => e.level === 'chronicle').map(entryText);
  session.queue.push(chronicleAnnouncement(lines));
  const outcome = saveGame(session.store, session.state);
  session.saveProblem = outcome.ok ? null : saveProblemText(outcome.reason);
  render(session);
}

function startSession(session: Session, seed: number): void {
  session.state = newGame(seed, session.content);
  const outcome = saveGame(session.store, session.state);
  session.saveProblem = outcome.ok ? null : saveProblemText(outcome.reason);
  render(session);
}

function newGameWithConfirm(session: Session): void {
  if (!confirm('Start a new game? The current dynasty will be lost for good.')) return;
  clearGame(session.store);
  history.replaceState(null, '', location.pathname);
  session.notice = null;
  startSession(session, pickSeed());
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
  const { content } = loaded;
  const store = browserStore();
  const outcome = loadGame(store, content);
  const requested = seedFromSearch(location.search, isValidSeed);
  const choice = startChoice(outcome, requested);
  const session: Session = { state: outcome.kind === 'loaded' ? outcome.state : newGame(pickSeed(), content), content, store, notice: null, saveProblem: null, tab: 'chronicle', showNumbers: false, announcedEvent: '', keymap: [], focusAfterRender: false, queue: [] };
  current = session;
  if (choice === 'continue' || (choice === 'ask_replace' && !confirm(`The address asks for seed ${String(requested)}, which replaces your saved dynasty. Replace it?`))) {
    if (choice === 'ask_replace') history.replaceState(null, '', location.pathname);
    render(session);
  } else {
    if (outcome.kind === 'discarded') {
      session.notice = outcome.reason === 'old_version'
        ? 'Your saved game is from another version of the game and cannot be continued. A new game has begun.'
        : 'Your saved game could not be read. A new game has begun.';
    }
    startSession(session, requested ?? pickSeed());
  }
}

window.addEventListener('keydown', (e) => {
  if (!current || personIdFromHash(location.hash) !== null) return;
  const position = shortcutPosition({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: (e.target as HTMLElement | null)?.tagName });
  if (position === null) return;
  const picked = pickableAt(current.keymap.map((c) => ({ grey: c === null })), position);
  const command = picked === null ? null : current.keymap[picked];
  if (!command) return;
  e.preventDefault();
  act(current, command);
});
