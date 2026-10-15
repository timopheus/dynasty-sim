import { availableActions } from '../core/actions/actions';
import { fullName } from '../core/character/character';
import { entryText } from '../core/chronicle/log';
import { loadContent } from '../core/content/load';
import type { Content } from '../core/content/schema';
import { pendingEventDef } from '../core/events/events';
import { apply, newGame, type Command } from '../core/game';
import { isValidSeed } from '../core/rng';
import { getPlayer } from '../core/helpers';
import type { GameState } from '../core/state';
import { renderText } from '../core/text/text';
import { ageYears, formatDate } from '../core/time/calendar';
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
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param ? Number(param) : NaN;
  return isValidSeed(seed) ? seed : (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
}

function render(state: GameState, content: Content, act: (cmd: Command) => void): void {
  const player = getPlayer(state);
  const age = ageYears(player.birthDay, state.day);
  const parts: Node[] = [
    el('h1', {}, `House of ${player.surname}`),
    el('p', { className: 'meta' }, `${formatDate(state.day)} · seed ${state.seed} · `, el('a', { href: `?seed=${state.seed}` }, 'restart'), ' · ', el('a', { href: '?' }, 'new seed')),
    el('p', {}, `${fullName(player)}, aged ${age}. Health ${player.health}/100. Money ${player.money}.`),
  ];

  const event = pendingEventDef(state, content);
  if (event) {
    parts.push(
      el('h2', {}, 'Event'),
      el('section', { className: 'event' },
        el('p', {}, renderText(event.text, player, state.day)),
        el('div', { className: 'choices' }, ...event.options.map((option, i) =>
          el('button', { onclick: () => act({ type: 'choose', option: i }) }, renderText(option.text, player, state.day)))),
      ),
    );
  } else {
    parts.push(
      el('h2', {}, 'What next?'),
      el('div', { className: 'choices' }, ...availableActions({ state, content }).map((a) =>
        el('button', { onclick: () => act({ type: 'start', actionId: a.id }), title: `${a.duration.min}–${a.duration.max} days` }, a.name))),
    );
  }

  const recent = state.chronicle.slice(-CHRONICLE_LIMIT).reverse();
  parts.push(
    el('h2', {}, 'Chronicle'),
    el('ul', { className: 'chronicle' }, ...recent.map((e) =>
      el('li', {}, el('span', { className: 'date' }, formatDate(e.day)), entryText(e)))),
  );
  app?.replaceChildren(...parts);
}

const loaded = loadContent(files);
if (!loaded.ok) {
  app.replaceChildren(
    el('h1', {}, 'Content errors'),
    el('pre', { className: 'errors' }, loaded.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n')),
  );
} else {
  const { content } = loaded;
  const state = newGame(pickSeed(), content);
  const act = (cmd: Command) => {
    apply(state, content, cmd);
    render(state, content, act);
  };
  render(state, content, act);
}
