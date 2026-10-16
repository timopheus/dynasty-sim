import type { ChronicleEntry } from '../core/chronicle/log';
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
}

function saveProblemText(reason: 'quota' | 'unavailable'): string {
  return reason === 'quota'
    ? 'Autosave failed: browser storage is full. The game goes on, but progress since the last successful save will be lost if you reload. Starting a new game frees the space.'
    : 'Autosave is not available in this browser. The game goes on, but it will not survive a reload.';
}

function entriesList(state: GameState, entries: ChronicleEntry[]): HTMLElement {
  const recent = entries.slice(-CHRONICLE_LIMIT).reverse();
  const heads = headIds(state.chronicle);
  return el('ul', { className: 'chronicle' }, ...recent.map((e) => entryItem(el, e, state.playerId, heads)));
}

function render(session: Session): void {
  const { state, content } = session;
  const player = getPlayer(state);
  const hero = heroView(state, content);
  const rerender = () => render(session);
  const parts: Node[] = [];

  const pageId = personIdFromHash(location.hash);
  if (pageId !== null) {
    app?.replaceChildren(pageView(el, personPage({ state, content }, pageId), headIds(state.chronicle)));
    window.scrollTo(0, 0);
    return;
  }

  if (session.notice) parts.push(el('p', { className: 'notice' }, session.notice));
  if (session.saveProblem) parts.push(el('p', { className: 'notice warn', role: 'alert' }, session.saveProblem));

  parts.push(
    el('h1', {}, `House of ${hero.surname}`),
    el('p', { className: 'meta' }, `${formatDate(state.day)} · seed ${state.seed} · `,
      el('button', { className: 'link', onclick: () => newGameWithConfirm(session) }, 'New game')),
    el('section', { className: 'hero' },
      el('h2', {}, el('a', { href: personHref(player.id), className: 'person' }, hero.name)),
      el('p', {}, `${hero.sex === 'male' ? 'Man' : 'Woman'}, aged ${hero.age}${hero.fame ? `, ${hero.fame}` : ''}. Money ${hero.money}.`),
      el('p', {}, `Health: ${hero.conditions || 'healthy'}.`),
      el('dl', { className: 'stats' }, ...hero.stats.flatMap((s) => [
        el('dt', {}, s.label),
        el('dd', { title: String(s.value) }, s.word),
      ])),
      hero.education.length ? el('p', {}, `Education: ${hero.education.join(', ')}.`) : '',
      hero.traits.length ? el('p', {}, `Traits: ${hero.traits.join(', ')}.`) : '',
    ),
  );

  const ctx = { state, content };
  const screen = eventScreen(ctx);
  if (screen) {
    parts.push(
      el('h2', {}, 'Event'),
      el('section', { className: 'event' },
        el('p', {}, ...partNodes(el, screen.text)),
        el('div', { className: 'choices' }, ...screen.options.map((o) => {
          const label = partNodes(el, o.label);
          const chance = o.chance ? [el('span', { className: 'chance', title: o.chance.title }, ` (${o.chance.word})`)] : [];
          if (o.grey) {
            return el('div', { className: 'unavailable' },
              el('button', { disabled: true }, ...label),
              el('span', { className: 'reason' }, o.reason));
          }
          return el('div', { className: 'option' },
            el('button', { onclick: () => act(session, { type: 'choose', option: o.index }) }, ...label), ...chance);
        })),
      ),
    );
  } else {
    parts.push(
      el('h2', {}, 'What next?'),
      el('div', { className: 'choices' }, ...actionRows(ctx).map((a) => {
        if (!a.grey) return el('button', { onclick: () => act(session, { type: 'start', actionId: a.id }), title: a.days }, a.name);
        return el('div', { className: 'unavailable' },
          el('button', { disabled: true, title: a.days }, a.name),
          el('span', { className: 'reason' }, a.reason));
      })),
    );
  }

  const tabButton = (tab: Tab, label: string) =>
    el('button', { className: session.tab === tab ? 'tab active' : 'tab', onclick: () => { session.tab = tab; rerender(); } }, label);
  const level = session.tab === 'chronicle' ? 'chronicle' : 'journal';
  parts.push(
    el('div', { className: 'tabs' }, tabButton('chronicle', 'Chronicle'), tabButton('journal', 'Journal')),
    entriesList(state, state.chronicle.filter((e) => e.level === level)),
  );
  app?.replaceChildren(...parts);
}

/** Applies a command, then autosaves (D-016): one save after every command. */
function act(session: Session, cmd: Command): void {
  apply(session.state, session.content, cmd);
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
  const session: Session = { state: outcome.kind === 'loaded' ? outcome.state : newGame(pickSeed(), content), content, store, notice: null, saveProblem: null, tab: 'chronicle' };
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
