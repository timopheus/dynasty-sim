import { el } from './dom';
import './modal.css';

export interface ModalOptions {
  /** Heading of the window; also its accessible name. */
  title: string;
  /** Pinned windows hold a decision: no close button, no Escape (D-438). */
  pinned: boolean;
  /** Called by the close button and Escape of an unpinned window. */
  onClose?: () => void;
  /** Shown beside the title of a pinned window, e.g. "pinned · time stopped". */
  badge?: string;
  /** Extra class of the window (`event`, `outcome`, `will`, `confirm`). */
  kind: string;
}

/**
 * The frame of a decision window over the centre of the screen (D-438): backdrop, dialog, heading, body. What goes
 * inside is the business of whoever opens it (an event, an outcome, a will, a question).
 */
export function modalFrame(options: ModalOptions, ...body: (Node | string)[]): HTMLElement {
  const heading = el('h2', { className: 'modal-title', tabIndex: -1, id: 'modal-title' }, options.title);
  const head = el('div', { className: 'modal-head' }, heading);
  if (options.badge) head.append(el('span', { className: 'modal-badge' }, options.badge));
  if (!options.pinned && options.onClose) {
    head.append(el('button', { className: 'modal-close', type: 'button', onclick: options.onClose, ariaLabel: 'Close' }, '×'));
  }
  const dialog = el('div', { className: `modal ${options.kind}`, role: 'dialog' }, head, ...body);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'modal-title');
  return el('div', { className: 'modal-layer' }, dialog);
}

/** The heading of a frame, to move focus to it once the window is drawn. */
export function modalHeading(frame: HTMLElement): HTMLElement | null {
  return frame.querySelector<HTMLElement>('.modal-title');
}
