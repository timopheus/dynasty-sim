import { SPEEDS, type ClockMode, type Speed } from './clock-model';
import { el } from './dom';
import { withTip } from './tooltip';
import './clock.css';

export interface ClockProps {
  date: string;
  mode: ClockMode;
  speed: Speed;
  /** "Play" can do something now: run time on, or start living as one wills. */
  canPlay: boolean;
  onToggle: () => void;
  onSpeed: (speed: Speed) => void;
}

/** What the clock says beside the date, in words, not only by the state of the buttons. */
function stateText(mode: ClockMode, canPlay: boolean): string {
  if (mode === 'running') return '▶ Time runs';
  if (mode === 'paused') return 'Paused';
  if (mode === 'decision') return 'Stopped: answer to go on';
  if (mode === 'ended') return 'The house has ended';
  return canPlay ? 'Stopped: choose what to do, or play' : 'Stopped: choose what to do';
}

/**
 * The date and the time player at the bottom right (D-438, S.8): "Play"/"Pause" and the speeds ×1, ×2, ×5. Space
 * pauses, 1/2/3 pick the speed (D-448); the screen does not write the keys (D-465: they belong to the tutorial), only
 * `aria-keyshortcuts` names them.
 */
export function clockPanel({ date, mode, speed, canPlay, onToggle, onSpeed }: ClockProps): HTMLElement {
  const running = mode === 'running';
  const toggle = el('button', { className: 'clock-button clock-toggle', type: 'button', onclick: onToggle, disabled: !running && !canPlay }, running ? 'Pause' : 'Play');
  toggle.setAttribute('aria-keyshortcuts', 'Space');
  toggle.setAttribute('data-focus', 'clock-toggle');
  // a window holds the clock: the speeds wait for the answer, so they are off and say nothing else
  const off = mode === 'decision' || mode === 'ended';
  const speeds = SPEEDS.map((s, i) => {
    const b = el('button', { className: s === speed ? 'clock-button speed current' : 'clock-button speed', type: 'button', onclick: () => onSpeed(s), disabled: off }, `×${s}`);
    b.setAttribute('aria-pressed', String(s === speed));
    b.setAttribute('aria-keyshortcuts', String(i + 1));
    b.setAttribute('aria-label', `Speed ×${s}`);
    b.setAttribute('data-focus', `clock-speed-${s}`);
    withTip(b, { text: `${s === 1 ? 'A day' : `${s} days`} a second.` });
    return b;
  });
  // the buttons stay in one place whatever the date and the state say: the words go to a row of their own below
  return el('div', { className: `clock ${mode}`, role: 'group', ariaLabel: 'Time' },
    el('div', { className: 'clock-row' },
      el('span', { className: 'date' }, date),
      el('span', { className: 'clock-buttons' }, toggle, ...speeds)),
    el('div', { className: 'clock-row clock-words' },
      el('span', { className: 'clock-state' }, stateText(mode, canPlay)),
      el('span', { className: 'clock-keys' }, 'Space: pause · 1 2 3: speed')));
}
