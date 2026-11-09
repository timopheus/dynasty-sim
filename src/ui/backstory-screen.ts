import { el } from './dom';
import './backstory-screen.css';
import { localName, tr } from './i18n';

export interface BackstoryProps {
  /** The founder's name and house, as the game will know him. */
  name: string;
  house: string;
  /** The stage of the scene, from 1, and how many stages there are. */
  step: number;
  steps: number;
  /** The window of the scene (an event window, D-438), drawn on this screen instead of over the game. */
  scene: HTMLElement;
  /** The menu of the screen (New game), the same as the header's. */
  menu: HTMLElement;
}

/**
 * The early years of the founder on a screen of their own (playtest 09.11): while the backstory runs, the game's
 * panels, map and profile are not there — the hero is not grown yet, so nothing shows him at the age he will leave home
 * at. The game screen opens when the last scene is answered.
 */
export function backstoryScreen(props: BackstoryProps): HTMLElement {
  const dots = el('ol', { className: 'backstory-steps' });
  dots.setAttribute('aria-label', tr('Scene {step} of {steps}', { step: props.step, steps: props.steps }));
  for (let i = 1; i <= props.steps; i++) {
    dots.append(el('li', { className: i < props.step ? 'done' : i === props.step ? 'current' : '' }));
  }
  return el('div', { className: 'backstory-screen' },
    el('header', { className: 'backstory-top' },
      el('div', { className: 'backstory-title' },
        el('h1', {}, tr('The early years')),
        el('p', {}, tr('{name} of the house of {house}', { name: localName(props.name), house: localName(props.house) }))),
      props.menu),
    el('div', { className: 'backstory-body' },
      el('div', { className: 'backstory-progress' },
        el('span', { className: 'backstory-age' }, tr('Scene {step} of {steps}', { step: props.step, steps: props.steps })),
        dots),
      props.scene,
      el('p', { className: 'backstory-note' }, tr('Answer each scene: they make the person who will go out into the world.'))));
}
