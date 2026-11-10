import { el } from './dom';
import './backstory-screen.css';
import type { TextPart } from '../core/text/text';
import { backstoryHead } from './backstory-clock-model';
import { localName, tr } from './i18n';

export interface BackstoryProps {
  /** The founder's name and house, as the game will know him. */
  name: string;
  house: string;
  /** The stage of the scene, from 1, and how many stages there are. */
  step: number;
  steps: number;
  /** The date of the world and the age of the hero on the one clock (D-479); null on the old way, which has no date. */
  date?: { year: number; age: number } | null;
  /** The years run by between the scenes: the head shows it and the scene's place is empty. */
  running?: boolean;
  /** The lines of the years run so far, newest last: what the world did while the years ran by. */
  log?: { year: number; parts: readonly TextPart[] }[];
  /** The window of the scene (an event window, D-438), drawn on this screen instead of over the game. */
  scene: HTMLElement;
  /** The menu of the screen (New game), the same as the header's. */
  menu: HTMLElement;
}

/** A line of the log as plain text: references by the name in the language chosen, in the case the line put it in (RU.1). */
function logText(parts: readonly TextPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : localName(p.name, p.case ?? 'nom'))).join('');
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
  return el('div', { className: props.running ? 'backstory-screen running' : 'backstory-screen' },
    el('header', { className: 'backstory-top' },
      el('div', { className: 'backstory-title' },
        el('h1', {}, tr('The early years')),
        el('p', {}, tr('{name} of the house of {house}', { name: localName(props.name), house: localName(props.house) }))),
      props.menu),
    el('div', { className: 'backstory-body' },
      el('div', { className: 'backstory-progress' },
        props.date
          ? el('span', { className: 'backstory-age backstory-date' }, backstoryHead(props.date.year, props.date.age))
          : el('span', { className: 'backstory-age' }, tr('Scene {step} of {steps}', { step: props.step, steps: props.steps })),
        dots),
      el('div', { className: 'backstory-slot' },
        props.scene,
        props.running && props.log && props.log.length > 0
          ? el('ul', { className: 'backstory-log' }, ...props.log.map((l) => el('li', {}, el('span', { className: 'backstory-log-year' }, String(l.year)), ` ${logText(l.parts)}`)))
          : ''),
      el('p', { className: props.running ? 'backstory-note hidden' : 'backstory-note' }, tr('Answer each scene: they make the person who will go out into the world.'))));
}
